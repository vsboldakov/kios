import { $ } from "bun"
import { fileURLToPath } from "node:url"
import { formula } from "./formula"
import { changelog, latestVersion, notesFor, planRelease } from "./semver"
import { packageArchive, sha256sums, sourceArchive } from "./sums"

await main()

async function main() {
  const branch = process.env.GITHUB_REF_NAME
  if (process.env.GITHUB_ACTIONS !== "true" || (branch !== "master" && branch !== "main")) {
    throw new Error("releases run from GitHub Actions on master")
  }
  const repo = process.env.GITHUB_REPOSITORY ?? ""
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("GITHUB_REPOSITORY is not set")

  process.chdir(fileURLToPath(new URL("..", import.meta.url)))
  await $`git fetch origin --tags`
  await $`git checkout -B ${branch} origin/${branch}`
  const dirty = (await $`git status --porcelain`.text()).trim()
  if (dirty) throw new Error(`working tree is dirty\n${dirty}`)

  const pkg = requirePackage(await Bun.file("package.json").json())
  const tags = (await $`git tag --list ${"v*"}`.text()).split("\n").filter((tag) => tag !== "")
  const latest = latestVersion(tags)
  const messages = await logSince(latest)
  const planned = planRelease({
    current: pkg.version,
    latestTag: latest,
    messages,
    force: forced(process.env.RELEASE_BUMP),
  })
  const version = planned?.version ?? pkg.version
  const tagged = await tagExists(version)
  if (!planned && !tagged) {
    console.log("No release.")
    return
  }
  if (!(await onNpm(pkg.name, version)) && !process.env.NPM_CONFIG_TOKEN) {
    throw new Error("Set the NPM_CONFIG_TOKEN repository secret (an npm automation token) before releasing.")
  }

  if (planned && !tagged) {
    await writeRelease(planned.version, planned.notes)
    await commit(`chore(release): ${planned.version}`, "package.json", "CHANGELOG.md")
    await $`git tag v${planned.version}`
    await $`git push origin ${branch}`
    await $`git push origin tag v${planned.version}`
    console.log(`Tagged v${planned.version}`)
  }

  if (!(await onNpm(pkg.name, version))) {
    await $`bun publish --tolerate-republish`
    console.log(`Published ${pkg.name}@${version}`)
  }
  const sourceSha = await updateFormula(repo, version, branch)
  await updateGithubRelease(repo, pkg.name, version, planned?.notes, sourceSha)
}

async function writeRelease(version: string, notes: string) {
  const pkg: Record<string, unknown> = await Bun.file("package.json").json()
  pkg.version = version
  await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`)
  const existing = (await Bun.file("CHANGELOG.md").exists()) ? await Bun.file("CHANGELOG.md").text() : ""
  await Bun.write("CHANGELOG.md", changelog(existing, version, notes))
}

async function updateFormula(repo: string, version: string, branch: string) {
  const archive = sourceArchive(repo, version)
  const current = (await Bun.file("Formula/kios.rb").exists()) ? await Bun.file("Formula/kios.rb").text() : ""
  if (current.includes(archive.url)) return
  const sha = await archiveSha(archive.url)
  const ruby = formula(repo, version, sha)
  await $`mkdir -p Formula`
  await Bun.write("Formula/kios.rb", ruby)
  await commit(`chore(release): brew formula ${version}`, "Formula/kios.rb")
  await $`git push origin ${branch}`
  console.log(`Updated Homebrew formula for ${version}`)
  return sha
}

async function updateGithubRelease(
  repo: string,
  packageName: string,
  version: string,
  plannedNotes: string | undefined,
  sourceSha: string | undefined,
) {
  const release = await githubRelease(repo, version)
  if (release?.assets.includes("SHA256SUMS") && release.body.includes("### Checksums")) return

  const notes = plannedNotes ?? notesFor((await Bun.file("CHANGELOG.md").exists()) ? await Bun.file("CHANGELOG.md").text() : "", version)
  const source = sourceArchive(repo, version)
  const pack = packageArchive(packageName, version)
  const sums = sha256sums([
    { file: source.file, sha256: sourceSha ?? (await archiveSha(source.url)) },
    { file: pack.file, sha256: await archiveSha(pack.url) },
  ])
  const dir = `/tmp/kios-${version}`
  const notesPath = `${dir}/notes.md`
  const sumsPath = `${dir}/SHA256SUMS`
  await $`mkdir -p ${dir}`
  await Bun.write(notesPath, `${notes.trim()}\n\n### Checksums\n\n\`\`\`\n${sums.trim()}\n\`\`\`\n`)
  await Bun.write(sumsPath, sums)
  if (!release) {
    await $`gh release create v${version} --repo ${repo} --title v${version} --notes-file ${notesPath} ${sumsPath}`
    console.log(`Created GitHub release v${version}`)
    return
  }
  await $`gh release edit v${version} --repo ${repo} --notes-file ${notesPath}`
  if (!release.assets.includes("SHA256SUMS")) await $`gh release upload v${version} --repo ${repo} ${sumsPath}`
  console.log(`Updated GitHub release v${version}`)
}

async function githubRelease(repo: string, version: string): Promise<{ assets: string[]; body: string } | null> {
  const view = await $`gh release view v${version} --repo ${repo} --json assets,body`.quiet().nothrow()
  if (view.exitCode !== 0) return null
  return requireRelease(JSON.parse(view.stdout.toString()))
}

function requireRelease(value: unknown): { assets: string[]; body: string } {
  if (typeof value !== "object" || value === null || !("assets" in value) || !Array.isArray(value.assets)) {
    throw new Error("unexpected GitHub release")
  }
  const body = "body" in value ? value.body : ""
  if (typeof body !== "string" && body !== null) throw new Error("unexpected GitHub release")
  return {
    body: body ?? "",
    assets: value.assets.flatMap((asset) =>
      typeof asset === "object" && asset !== null && "name" in asset && typeof asset.name === "string" ? [asset.name] : [],
    ),
  }
}

// Freshly published npm tarballs can 404 for a minute or more while the registry CDN catches up.
async function archiveSha(url: string): Promise<string> {
  for (const attempt of Array.from({ length: 36 }, (_, index) => index + 1)) {
    const response = await fetch(url)
    if (response.ok) {
      const hasher = new Bun.CryptoHasher("sha256")
      hasher.update(new Uint8Array(await response.arrayBuffer()))
      return hasher.digest("hex")
    }
    if (attempt < 36) await Bun.sleep(5000)
  }
  throw new Error(`missing archive ${url}`)
}

async function onNpm(name: string, version: string): Promise<boolean> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${version}`)
  return response.ok
}

async function tagExists(version: string): Promise<boolean> {
  const listed = (await $`git tag --list v${version}`.text()).trim()
  return listed === `v${version}`
}

async function logSince(latest: string | null): Promise<string[]> {
  const range = latest ? `v${latest}..HEAD` : "HEAD"
  const output = await $`git log ${range} --reverse --format=${"%x1e%B"}`.text()
  return output.split("\x1e").map((message) => message.trim()).filter((message) => message !== "")
}

async function commit(message: string, ...files: string[]) {
  await $`git config user.name ${"github-actions[bot]"}`
  await $`git config user.email ${"41898282+github-actions[bot]@users.noreply.github.com"}`
  await $`git add ${files}`
  const staged = await $`git diff --cached --quiet`.nothrow()
  if (staged.exitCode === 0) return
  if (staged.exitCode !== 1) throw new Error(staged.stderr.toString() || "git diff failed")
  await $`git commit -m ${message}`
}

function forced(value: string | undefined): "major" | "minor" | "patch" | null {
  if (value === "major" || value === "minor" || value === "patch") return value
  return null
}

function requirePackage(value: unknown): { name: string; version: string } {
  if (typeof value !== "object" || value === null) throw new Error("package.json is not an object")
  const name = "name" in value ? value.name : undefined
  const version = "version" in value ? value.version : undefined
  if (typeof name !== "string" || name === "" || typeof version !== "string") {
    throw new Error("package.json needs a name and version")
  }
  return { name, version }
}

import { $ } from "bun"
import { fileURLToPath } from "node:url"
import { formula } from "./formula"
import { changelog, latestVersion, notesFor, planRelease } from "./semver"

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
  await updateFormula(repo, version, branch)
  await updateGithubRelease(repo, version, planned?.notes)
}

async function writeRelease(version: string, notes: string) {
  const pkg: Record<string, unknown> = await Bun.file("package.json").json()
  pkg.version = version
  await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`)
  const existing = (await Bun.file("CHANGELOG.md").exists()) ? await Bun.file("CHANGELOG.md").text() : ""
  await Bun.write("CHANGELOG.md", changelog(existing, version, notes))
}

async function updateFormula(repo: string, version: string, branch: string) {
  const url = `https://github.com/${repo}/archive/refs/tags/v${version}.tar.gz`
  const current = (await Bun.file("Formula/kios.rb").exists()) ? await Bun.file("Formula/kios.rb").text() : ""
  if (current.includes(url)) return
  const ruby = formula(repo, version, await archiveSha(url))
  await $`mkdir -p Formula`
  await Bun.write("Formula/kios.rb", ruby)
  await commit(`chore(release): brew formula ${version}`, "Formula/kios.rb")
  await $`git push origin ${branch}`
  console.log(`Updated Homebrew formula for ${version}`)
}

async function updateGithubRelease(repo: string, version: string, plannedNotes: string | undefined) {
  const existing = await $`gh release view v${version} --repo ${repo}`.quiet().nothrow()
  if (existing.exitCode === 0) return
  const notes = plannedNotes ?? notesFor((await Bun.file("CHANGELOG.md").exists()) ? await Bun.file("CHANGELOG.md").text() : "", version)
  const path = `/tmp/kios-${version}-notes.md`
  await Bun.write(path, `${notes}\n`)
  await $`gh release create v${version} --repo ${repo} --title v${version} --notes-file ${path}`
  console.log(`Created GitHub release v${version}`)
}

async function archiveSha(url: string): Promise<string> {
  for (const attempt of [1, 2, 3, 4, 5, 6]) {
    const response = await fetch(url)
    if (response.ok) {
      const hasher = new Bun.CryptoHasher("sha256")
      hasher.update(new Uint8Array(await response.arrayBuffer()))
      return hasher.digest("hex")
    }
    if (attempt < 6) await Bun.sleep(3000)
  }
  throw new Error(`missing source archive ${url}`)
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

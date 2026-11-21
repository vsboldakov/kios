import { expect, test } from "bun:test"
import { $ } from "bun"
import { formula } from "./formula"
import { packageArchive, sha256sums, sourceArchive } from "./sums"

test("names the archives Homebrew and npm publish", () => {
  const source = sourceArchive("vsboldakov/kios", "0.1.0")
  expect(source).toEqual({
    url: "https://github.com/vsboldakov/kios/archive/refs/tags/v0.1.0.tar.gz",
    file: "kios-0.1.0.tar.gz",
  })
  expect(formula("vsboldakov/kios", "0.1.0", "a".repeat(64))).toContain(source.url)
  expect(packageArchive("@vsboldakov/kios", "0.1.0")).toEqual({
    url: "https://registry.npmjs.org/@vsboldakov%2Fkios/-/kios-0.1.0.tgz",
    file: "kios-0.1.0.tgz",
  })
  expect(() => sourceArchive("bad repo", "0.1.0")).toThrow("invalid repo")
  expect(() => sha256sums([{ file: "kios-0.1.0.tgz", sha256: "zz" }])).toThrow("invalid sha256")
})

test("sha256sums checks with shasum", async () => {
  const dir = (await $`mktemp -d`.text()).trim()
  const source = new Bun.CryptoHasher("sha256").update("source").digest("hex")
  const pack = new Bun.CryptoHasher("sha256").update("pack").digest("hex")
  await Bun.write(`${dir}/kios-0.1.0.tar.gz`, "source")
  await Bun.write(`${dir}/kios-0.1.0.tgz`, "pack")
  await Bun.write(
    `${dir}/SHA256SUMS`,
    sha256sums([
      { file: "kios-0.1.0.tar.gz", sha256: source },
      { file: "kios-0.1.0.tgz", sha256: pack },
    ]),
  )
  const output = await $`shasum -a 256 -c SHA256SUMS`.cwd(dir).text()
  expect(output).toContain("kios-0.1.0.tar.gz: OK")
  expect(output).toContain("kios-0.1.0.tgz: OK")
  await $`rm -rf ${dir}`
})

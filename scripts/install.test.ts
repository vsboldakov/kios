import { expect, test } from "bun:test"
import { $ } from "bun"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

test("install --help explains the curl command", async () => {
  const output = await $`bash install --help`.cwd(root).text()
  expect(output).toContain("kios")
  expect(output).toContain("--version")
  expect(output).toContain("--no-modify-path")
})

test("install --version requires a version", async () => {
  const result = await $`bash install --version`.cwd(root).nothrow()
  expect(result.exitCode).not.toBe(0)
})

import { expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

test("kios --help prints the flags", async () => {
  const output = await $`bun src/index.tsx --help`.text()
  expect(output).toContain("--context")
  expect(output).toContain("-n")
})

test("kios --help works from a directory with its own bunfig", async () => {
  const dir = await mkdtemp(`${tmpdir()}/kios-`)
  await writeFile(`${dir}/bunfig.toml`, 'preload = ["./missing.ts"]\n')
  const output = await $`${root}/bin/kios --help`.cwd(dir).text()
  expect(output).toContain("--context")
})

test("kios rejects an unknown flag", async () => {
  const result = await $`bun src/index.tsx --kubeconfig cfg`.nothrow()
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain("--kubeconfig")
})

test("kios exits before the ui when kubectl is not on PATH", async () => {
  const dir = await mkdtemp(`${tmpdir()}/kios-path-`)
  const env: Record<string, string> = { PATH: dir }
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key === "PATH" || key === "KIOS_KUBECTL") continue
    env[key] = value
  }
  const help = Bun.spawn([process.execPath, "src/index.tsx", "--help"], { env, stdout: "pipe", stderr: "pipe" })
  expect(await help.exited).toBe(0)
  expect(await new Response(help.stdout).text()).toContain("--context")

  const proc = Bun.spawn([process.execPath, "src/index.tsx"], { env, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  const code = await Promise.race([proc.exited, Bun.sleep(2000).then(() => -1)])
  if (code === -1) proc.kill()
  expect(code).toBe(1)
  expect(await new Response(proc.stdout).text()).toBe("")
  expect(await new Response(proc.stderr).text()).toContain('Executable not found in $PATH: "kubectl"')
})

test("kios rejects a missing flag value and an extra argument", async () => {
  const missing = await $`bun src/index.tsx --context`.nothrow()
  expect(missing.exitCode).not.toBe(0)
  expect(missing.stderr.toString()).toContain("--context")
  const extra = await $`bun src/index.tsx payments`.nothrow()
  expect(extra.exitCode).not.toBe(0)
  expect(extra.stderr.toString()).toContain("payments")
})

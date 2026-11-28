import { unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KindCommand } from "../resources/types"

export function matchChart(payload: string, chart: string, version: string): { chart: string } | { error: string } {
  const missing = `chart ${chart} ${version} is not in a configured helm repo`
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return { error: missing }
  }
  if (!Array.isArray(parsed)) return { error: missing }
  const matches = parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const name = "name" in item && typeof item.name === "string" ? item.name : ""
    const found = "version" in item && typeof item.version === "string" ? item.version : ""
    if (found !== version || !name.endsWith(`/${chart}`)) return []
    return [name]
  })
  const match = matches.length === 1 ? matches[0] : ""
  if (match) return { chart: match }
  if (matches.length === 0) return { error: missing }
  return { error: `chart ${chart} ${version} matches more than one repo` }
}

export function upgradeCommand(name: string, namespace: string, chart: string, version: string, file: string): KindCommand {
  const scope = namespace ? ["-n", namespace] : []
  return { bin: "helm", args: ["upgrade", name, chart, "--version", version, ...scope, "-f", file] }
}

export function valuesFile(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9.-]/g, "") || "release"
  return join(tmpdir(), `kios-${safe}-${Date.now().toString(36)}.yaml`)
}

export function valuesDocument(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || trimmed === "null") return "{}\n"
  return text.endsWith("\n") ? text : `${text}\n`
}

export function commandValuesFile(command: KindCommand): string {
  const index = command.args.lastIndexOf("-f")
  if (index < 0) return ""
  return command.args[index + 1] ?? ""
}

export function upgradeTarget(command: KindCommand): { name: string; namespace: string } {
  const name = command.args[1] ?? ""
  const at = command.args.indexOf("-n")
  return { name, namespace: at < 0 ? "" : (command.args[at + 1] ?? "") }
}

export async function editValues(file: string, current: string): Promise<boolean> {
  await Bun.write(file, current)
  const parts = editorCommand()
  const bin = parts[0] ?? "vi"
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([...parts, file], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.includes("ENOENT") ? `${bin} was not found` : message)
  }
  const code = await proc.exited
  if (code !== 0) throw new Error(`${bin} exited ${code}`)
  return (await Bun.file(file).text()) !== current
}

export async function removeValuesFile(file: string): Promise<void> {
  await unlink(file).catch(() => {})
}

function editorCommand(): string[] {
  const editor = process.env.KUBE_EDITOR?.trim() || process.env.EDITOR?.trim() || "vi"
  return editor.split(/\s+/).filter((part) => part !== "")
}

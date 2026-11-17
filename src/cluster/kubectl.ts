import { parseApiTable } from "../resources/api-table"
import { builtinKinds } from "../resources/builtin"
import { mergeUsage } from "../resources/quantity"
import type { KindCommand, KubernetesObject, ResourceKind } from "../resources"
import { ClientError, type ClusterClient, type ObjectView, type WatchEvent } from "./cluster"

// One process uses one kubeconfig context. Every kubectl spawn reads this.
let kubeContext = ""

export function createKubectlClient(context = ""): ClusterClient {
  const selected = context.trim()
  kubeContext = selected
  return {
    context: selected || undefined,
    currentContext: async () => {
      if (selected) return selected
      return (await kubectl(["config", "current-context"])).trim() || "unknown"
    },
    namespaces: async () =>
      parseList(await kubectl(["get", "ns", "-o", "json"]))
        .map((item) => item.metadata?.name ?? "")
        .filter((name) => name !== ""),
    contextNamespace: async () => {
      const name = (await kubectl(["config", "view", "--minify", "-o", "jsonpath={.contexts[0].context.namespace}"])).trim()
      return name || "default"
    },
    list: async (kind, namespace = "") => {
      const args = ["get", kind.resource, "-o", "json"]
      if (kind.namespaced) args.splice(2, 0, ...(namespace ? ["-n", namespace] : ["-A"]))
      const listed = kubectl(args)
      if (kind.resource !== "nodes") return parseList(await listed)
      const [payload, metrics] = await Promise.all([listed, nodeMetrics()])
      return mergeUsage(parseList(payload), metrics)
    },
    inspect: (kind, name, namespace) => inspectResource(kind, name, namespace),
    logs: (kind, name, namespace, previous, container) => logsFor(kind, name, namespace, previous, container),
    followLogs: (kind, name, namespace, onText, container) => followLogs(kind, name, namespace, onText, container),
    execute: (command) => execute(command),
    resources: () => discoverKinds(),
    watch: (kind, onEvents, namespace = "") => watchResource(kind, onEvents, namespace),
  }
}

// shortcut: metrics-server only, leave "-" until usage comes from somewhere else
async function nodeMetrics(): Promise<KubernetesObject[]> {
  try {
    return parseList(await kubectl(["get", "nodes.metrics.k8s.io", "-o", "json"]))
  } catch {
    return []
  }
}

let resourcesTable: Promise<string> | undefined

function apiTable(): Promise<string> {
  if (resourcesTable) return resourcesTable
  resourcesTable = kubectl(["api-resources", "-o", "wide", "--no-headers"]).catch((error: unknown) => {
    resourcesTable = undefined
    throw error
  })
  return resourcesTable
}

async function discoverKinds(): Promise<ResourceKind[]> {
  const [table, crds] = await Promise.all([
    apiTable(),
    kubectl(["get", "crd", "-o", "json"]).catch(() => ""),
  ])
  return builtinKinds(table, crds)
}

export function logArgs(kind: ResourceKind, name: string, namespace: string, follow: boolean, previous = false, container = ""): string[] {
  const scope = kind.namespaced && namespace ? ["-n", namespace] : []
  const selected = container ? ["-c", container] : ["--all-containers"]
  // shortcut: starts at the last 500 lines, drop --tail when the full history is needed
  return ["logs", ...(follow ? ["-f"] : []), ...(previous ? ["--previous"] : []), "--tail=500", ...selected, "--prefix", ...scope, `${kind.resource}/${name}`]
}

async function logsFor(kind: ResourceKind, name: string, namespace: string, previous = false, container = ""): Promise<string> {
  return capture(kubectl(logArgs(kind, name, namespace, false, previous, container)))
}

function followLogs(kind: ResourceKind, name: string, namespace: string, onText: (text: string) => void, container = ""): () => void {
  const bin = kubectlBin()
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([bin, ...scoped(logArgs(kind, name, namespace, true, false, container))], { stdout: "pipe", stderr: "pipe" } as const)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onText(message.includes("ENOENT") ? `${bin} was not found` : message)
    return () => {}
  }
  let stopped = false
  const stdout = proc.stdout
  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ""
    if (stdout && typeof stdout !== "number") {
      const reader = stdout.getReader()
      try {
        while (!stopped) {
          const chunk = await reader.read()
          if (chunk.done) break
          buffer += decoder.decode(chunk.value, { stream: true })
          if (!stopped) onText(buffer)
        }
      } catch {
        // The reader rejects when the process is killed.
      }
    }
    if (stopped) return
    const stderr = (await readPipe(proc.stderr)).trim()
    const code = await proc.exited
    if (!stopped && code !== 0 && !buffer) onText(stderr || `${bin} exited ${code}`)
  })()
  return () => {
    stopped = true
    proc.kill()
  }
}

async function inspectResource(kind: ResourceKind, name: string, namespace: string): Promise<ObjectView> {
  const scope = kind.namespaced && namespace ? ["-n", namespace] : []
  const [describe, yaml, json] = await Promise.all([
    capture(kubectl(["describe", kind.resource, name, ...scope])),
    capture(kubectl(["get", kind.resource, name, ...scope, "-o", "yaml"])),
    capture(kubectl(["get", kind.resource, name, ...scope, "-o", "json"])),
  ])
  return { describe, yaml, json: prettyJson(json) }
}

async function capture(work: Promise<string>): Promise<string> {
  try {
    return await work
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function prettyJson(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

async function readPipe(stream: ReadableStream<Uint8Array> | number | null | undefined): Promise<string> {
  if (!stream || typeof stream === "number") return ""
  return new Response(stream).text()
}

export function kubectlBin(): string {
  const bin = process.env.KIOS_KUBECTL?.trim()
  return bin || "kubectl"
}

export function withContext(context: string, args: string[]): string[] {
  if (!context) return args
  return ["--context", context, ...args]
}

function scoped(args: string[]): string[] {
  return withContext(kubeContext, args)
}

function kubectl(args: string[]): Promise<string> {
  return run(kubectlBin(), scoped(args))
}

async function execute(command: KindCommand): Promise<void> {
  const bin = kubectlBin()
  const args = scoped(command.args)
  if (command.interactive) {
    await interact(bin, args)
    return
  }
  await run(bin, args, command.stdin)
}

async function interact(bin: string, args: string[]): Promise<void> {
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([bin, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.includes("ENOENT") ? `${bin} was not found` : message)
  }
  const code = await proc.exited
  if (code !== 0) throw new Error(`${bin} exited ${code}`)
}

async function run(bin: string, args: string[], stdin?: string): Promise<string> {
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe", stdin: stdin === undefined ? "ignore" : "pipe" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ClientError("other", message.includes("ENOENT") ? `${bin} was not found` : message)
  }
  const writer = proc.stdin
  if (stdin !== undefined && writer && typeof writer !== "number") {
    writer.write(stdin)
    writer.end()
  }
  const stdout = await readPipe(proc.stdout)
  const stderr = await readPipe(proc.stderr)
  const code = await proc.exited
  if (code !== 0) throw kubectlError(bin, stderr, code)
  return stdout
}

function kubectlError(bin: string, stderr: string, code: number): ClientError {
  const message = stderr.trim() || `${bin} exited ${code}`
  return new ClientError(message.includes("(Forbidden)") ? "forbidden" : "other", message)
}

function watchResource(kind: ResourceKind, onEvents: (events: WatchEvent[]) => void, namespace = ""): () => void {
  let stopped = false
  let proc: ReturnType<typeof Bun.spawn> | undefined
  void (async () => {
    try {
      const table = await apiTable()
      if (stopped) return
      const target = lookupResource(table, kind.resource)
      if (!target?.watchable) {
        onEvents([{ type: "unwatchable" }])
        return
      }
      const path = scopePath(target.path, kind.namespaced ? namespace : "")
      // shortcut: one unpaginated response per sync, add limit/continue paging when 10k-object lists become slow
      // shortcut: node usage is stamped from this list, so CPU and memory stay until the next reconnect
      const [payload, metrics] = await Promise.all([
        kubectl(["get", "--raw", path]),
        kind.resource === "nodes" ? nodeMetrics() : Promise.resolve([]),
      ])
      if (stopped) return
      const listed = readList(payload)
      onEvents(stampUsage([{ type: "sync", items: listed.items }], metrics))
      if (stopped) return
      if (!listed.resourceVersion) {
        onEvents([{ type: "end" }])
        return
      }
      const raw = `${path}?watch=1&resourceVersion=${encodeURIComponent(listed.resourceVersion)}`
      const bin = kubectlBin()
      try {
        proc = Bun.spawn([bin, ...scoped(["get", "--raw", raw])], { stdout: "pipe", stderr: "pipe" })
      } catch (error) {
        if (stopped) return
        const message = error instanceof Error ? error.message : String(error)
        onEvents([{ type: "end", error: message.includes("ENOENT") ? `${bin} was not found` : message }])
        return
      }
      await readWatchStream(proc, (events) => {
        if (stopped) return
        onEvents(stampUsage(events, metrics))
      }, () => stopped)
    } catch (error) {
      if (stopped) return
      if (error instanceof ClientError && error.kind === "forbidden") {
        onEvents([{ type: "forbidden", error: error.message }])
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      onEvents([{ type: "end", error: message.includes("ENOENT") ? `${kubectlBin()} was not found` : message }])
    }
  })()
  return () => {
    stopped = true
    proc?.kill()
  }
}

async function readWatchStream(proc: ReturnType<typeof Bun.spawn>, onEvents: (events: WatchEvent[]) => void, stopped: () => boolean) {
  const stdout = proc.stdout
  const decoder = new TextDecoder()
  let carry = ""
  if (stdout && typeof stdout !== "number") {
    const reader = stdout.getReader()
    try {
      while (!stopped()) {
        const chunk = await reader.read()
        if (chunk.done || stopped()) break
        const step = readWatchChunk(carry, decoder.decode(chunk.value, { stream: true }))
        carry = step.carry
        if (stopped()) return
        if (step.events.length > 0 || step.ended) onEvents(step.ended ? [...step.events, { type: "end" }] : step.events)
        if (!step.ended) continue
        proc.kill()
        await readPipe(proc.stderr)
        await proc.exited
        return
      }
    } catch {
      // The reader rejects when the process is killed.
    }
  }
  if (stopped()) return
  const stderr = (await readPipe(proc.stderr)).trim()
  const code = await proc.exited
  if (stopped()) return
  if (forbiddenText(stderr)) {
    onEvents([{ type: "unwatchable" }])
    return
  }
  const error = code === 0 ? undefined : stderr || `${kubectlBin()} exited ${code}`
  onEvents([error ? { type: "end", error } : { type: "end" }])
}

function forbiddenText(message: string): boolean {
  return message.includes("(Forbidden)")
}

export function readWatchChunk(carry: string, chunk: string): { events: WatchEvent[]; carry: string; ended: boolean } {
  const text = carry + chunk
  const events: WatchEvent[] = []
  let start = 0
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "\n") continue
    const line = text.slice(start, index).trim()
    start = index + 1
    if (!line) continue
    const step = watchLine(line)
    if (step === "end") return { events, carry: "", ended: true }
    if (step?.type === "unwatchable") return { events: [...events, step], carry: "", ended: true }
    if (step) events.push(step)
  }
  return { events, carry: text.slice(start), ended: false }
}

function watchLine(line: string): WatchEvent | "end" | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return "end"
  }
  if (!parsed || typeof parsed !== "object") return "end"
  if (statusForbidden(parsed)) return { type: "unwatchable" }
  if (!("type" in parsed) || typeof parsed.type !== "string") return "end"
  if (parsed.type === "ERROR") {
    const status = "object" in parsed && parsed.object && typeof parsed.object === "object" ? parsed.object : undefined
    if (status && statusForbidden(status)) return { type: "unwatchable" }
    return "end"
  }
  if (parsed.type === "BOOKMARK") return null
  if (parsed.type !== "ADDED" && parsed.type !== "MODIFIED" && parsed.type !== "DELETED") return null
  if (!("object" in parsed) || !parsed.object || typeof parsed.object !== "object") return "end"
  const type = parsed.type === "ADDED" ? "added" : parsed.type === "MODIFIED" ? "modified" : "deleted"
  return { type, object: parsed.object as KubernetesObject }
}

function stampUsage(events: WatchEvent[], metrics: readonly KubernetesObject[]): WatchEvent[] {
  if (metrics.length === 0) return events
  return events.map((event) => {
    if (event.type === "sync") return { type: "sync", items: mergeUsage(event.items, metrics) }
    if (event.type !== "added" && event.type !== "modified") return event
    const object = mergeUsage([event.object], metrics)[0]
    return object ? { type: event.type, object } : event
  })
}

function statusForbidden(value: object): boolean {
  if ("code" in value && value.code === 403) return true
  return "reason" in value && value.reason === "Forbidden"
}

export function scopePath(path: string, namespace: string): string {
  if (!namespace) return path
  const slash = path.lastIndexOf("/")
  return `${path.slice(0, slash)}/namespaces/${encodeURIComponent(namespace)}/${path.slice(slash + 1)}`
}

export function lookupResource(table: string, resource: string): { path: string; watchable: boolean } | null {
  return indexResources(table).get(resource) ?? null
}

function indexResources(table: string): Map<string, { path: string; watchable: boolean }> {
  const map = new Map<string, { path: string; watchable: boolean }>()
  for (const row of parseApiTable(table)) {
    const target = {
      path: row.group ? `/apis/${row.group}/${row.version}/${row.name}` : `/api/${row.version}/${row.name}`,
      watchable: row.verbs.has("watch"),
    }
    const qualified = row.group ? `${row.name}.${row.group}` : row.name
    map.set(qualified, target)
    // kubectl get accepts plural.version.group, which is how a custom resource pins its served version
    if (row.group) map.set(`${row.name}.${row.version}.${row.group}`, target)
    // shortcut: the bare name keeps the first row; a core row's key is that name, so it replaces metrics.k8s.io
    if (!map.has(row.name)) map.set(row.name, target)
  }
  return map
}

function readList(payload: string): { items: KubernetesObject[]; resourceVersion: string } {
  const parsed: unknown = JSON.parse(payload)
  const record = parsed && typeof parsed === "object" ? parsed : {}
  const items = "items" in record && Array.isArray(record.items) ? record.items as KubernetesObject[] : []
  const metadata = "metadata" in record && record.metadata && typeof record.metadata === "object" ? record.metadata : undefined
  const resourceVersion = metadata && "resourceVersion" in metadata && typeof metadata.resourceVersion === "string" ? metadata.resourceVersion : ""
  return { items, resourceVersion }
}

function parseList(payload: string): KubernetesObject[] {
  return readList(payload).items
}

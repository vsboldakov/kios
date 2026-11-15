import { ReactiveMap } from "@solid-primitives/map"
import { createPolled } from "@solid-primitives/timer"
import { batch, createSignal, untrack } from "solid-js"
import { isServer } from "solid-js/web"
import { compareObjects, findKind, type KindCommand, type KubernetesObject, type ResourceKind } from "../resources"
import { admit } from "./cache"

if (isServer) {
  throw new Error("kios needs Bun's browser export condition. Run: bun --conditions browser src/index.tsx")
}

export interface ResourceSnapshot {
  status: "loading" | "ready" | "error"
  items: KubernetesObject[]
  error: string | null
  updatedAt: number | null
  live: boolean
  cached: boolean
}

export interface ObjectView {
  describe: string
  yaml: string
  json: string
}

export type WatchEvent =
  | { type: "sync"; items: KubernetesObject[] }
  | { type: "added" | "modified" | "deleted"; object: KubernetesObject }
  | { type: "unwatchable" }
  | { type: "forbidden"; error: string }
  | { type: "end"; error?: string }

export interface ClusterClient {
  currentContext(): Promise<string>
  namespaces(): Promise<string[]>
  contextNamespace?(): Promise<string>
  list(kind: ResourceKind, namespace?: string): Promise<KubernetesObject[]>
  watch?(kind: ResourceKind, onEvents: (events: WatchEvent[]) => void, namespace?: string): () => void
  inspect(kind: ResourceKind, name: string, namespace: string): Promise<ObjectView>
  logs(kind: ResourceKind, name: string, namespace: string): Promise<string>
  followLogs(kind: ResourceKind, name: string, namespace: string, onText: (text: string) => void): () => void
  execute(command: KindCommand): Promise<void>
  resources?(): Promise<ResourceKind[]>
}

export interface Cluster {
  contextName: () => string
  namespaces: () => readonly string[]
  namespace: () => string
  namespaceLocked: () => boolean
  setNamespace: (name: string) => void
  now: () => number
  snapshot: (id: string) => ResourceSnapshot
  syncWatches: (kindIds: readonly string[]) => void
  refresh: (kind: ResourceKind) => Promise<void>
  refreshNamespaces: () => Promise<void>
  inspect: (kind: ResourceKind, name: string, namespace: string) => Promise<ObjectView>
  logs: (kind: ResourceKind, name: string, namespace: string) => Promise<string>
  followLogs: (kind: ResourceKind, name: string, namespace: string, onText: (text: string) => void) => () => void
  execute: (command: KindCommand) => Promise<void>
  extraKinds: () => readonly ResourceKind[]
}

export class ClientError extends Error {
  readonly kind: "forbidden" | "other"
  constructor(kind: "forbidden" | "other", message: string) {
    super(message)
    this.kind = kind
  }
}

const loadingSnapshot: ResourceSnapshot = { status: "loading", items: [], error: null, updatedAt: null, live: false, cached: false }
const retryMs = 2000
const cachedAfterMs = 1500

export function createCluster(client: ClusterClient): Cluster {
  const snapshots = new ReactiveMap<string, ResourceSnapshot>()
  const attempts = new Map<string, number>()
  const cachedTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let namespacesPending = false
  let lockedNamespace = ""
  let locking: Promise<void> | undefined
  const [namespaceLocked, setNamespaceLocked] = createSignal(false)
  const [contextName, setContextName] = createSignal("…")
  const [namespaces, setNamespaces] = createSignal<string[]>([])
  const [namespace, setNamespace] = createSignal("")
  const [extraKinds, setExtraKinds] = createSignal<readonly ResourceKind[]>([])
  // Context, namespaces, and discovery wait so the first list is the only kubectl until the rows are up.
  let listed = false
  const now = createPolled(() => Date.now(), 5000)

  function startDeferred() {
    if (listed) return
    listed = true
    void client.currentContext().then(setContextName).catch(() => setContextName("unavailable"))
    if (client.resources) {
      void client.resources().then(setExtraKinds).catch(() => {
        // Sidebar kinds still open when discovery cannot read the API.
      })
    }
    void refreshNamespaces()
  }

  async function refreshNamespaces(): Promise<void> {
    if (!listed || namespacesPending) return
    namespacesPending = true
    try {
      const names = (await client.namespaces()).filter((name) => name !== "")
      if (lockedNamespace) return
      names.sort((left, right) => left.localeCompare(right))
      setNamespaces(names)
      const selected = untrack(namespace)
      if (selected && !names.includes(selected)) setNamespace("")
    } catch (error) {
      // A forbidden namespace list is a namespace Role. Anything else keeps the last list.
      if (error instanceof ClientError && error.kind === "forbidden") await lockNamespace()
    } finally {
      namespacesPending = false
    }
  }

  function lockNamespace(): Promise<void> {
    if (locking) return locking
    // The context namespace is the only scope a forbidden namespace list can still name.
    locking = Promise.resolve()
      .then(() => client.contextNamespace?.() ?? "default")
      .catch(() => "default")
      .then((name) => {
        const ns = (name ?? "").trim() || "default"
        lockedNamespace = ns
        batch(() => {
          setNamespaceLocked(true)
          setNamespaces([ns])
          setNamespace(ns)
        })
        watches.restart()
      })
    return locking
  }

  function scopedNamespace(kind: ResourceKind): string {
    if (!kind.namespaced) return ""
    return lockedNamespace
  }

  const watches = createWatches({
    client,
    snapshots,
    refresh: (kind) => refresh(kind),
    namespace: (kind) => scopedNamespace(kind),
    locked: () => lockedNamespace,
    kind: (id) => findKind(id, extraKinds()),
    started: () => startDeferred(),
  })

  async function refresh(kind: ResourceKind): Promise<void> {
    if (watches.watching(kind.id)) return
    const token = (attempts.get(kind.id) ?? 0) + 1
    attempts.set(kind.id, token)
    const previous = untrack(() => snapshots.get(kind.id))
    if (!previous) snapshots.set(kind.id, loadingSnapshot)
    const pendingTimer = cachedTimers.get(kind.id)
    if (pendingTimer) clearTimeout(pendingTimer)
    // A list that returns quickly should not flash "cached".
    if (previous && previous.status !== "loading") {
      cachedTimers.set(kind.id, setTimeout(() => {
        if (attempts.get(kind.id) !== token) return
        const current = untrack(() => snapshots.get(kind.id))
        if (current !== previous) return
        snapshots.set(kind.id, { ...current, cached: true, live: false })
      }, cachedAfterMs))
    } else cachedTimers.delete(kind.id)
    try {
      const items = await client.list(kind, scopedNamespace(kind))
      if (attempts.get(kind.id) !== token) return
      for (const item of items) admit(item)
      items.sort(compareObjects)
      snapshots.set(kind.id, { status: "ready", items, error: null, updatedAt: Date.now(), live: false, cached: false })
    } catch (error) {
      if (attempts.get(kind.id) !== token) return
      const kept = untrack(() => snapshots.get(kind.id))
      snapshots.set(kind.id, {
        status: "error",
        items: kept?.items ?? [],
        error: error instanceof Error ? error.message : String(error),
        updatedAt: kept?.updatedAt ?? null,
        live: false,
        cached: false,
      })
    } finally {
      if (attempts.get(kind.id) === token) {
        const timer = cachedTimers.get(kind.id)
        if (timer) clearTimeout(timer)
        cachedTimers.delete(kind.id)
      }
      startDeferred()
    }
  }

  function syncWatches(kindIds: readonly string[]) {
    watches.sync(kindIds)
  }

  return {
    contextName,
    namespaces,
    namespace,
    namespaceLocked,
    setNamespace,
    now,
    snapshot: (id) => {
      const current = snapshots.get(id) ?? loadingSnapshot
      const selected = namespace()
      if (!selected) return current
      // shortcut: filters the all-namespaces payload in memory, query with -n when a cluster is too large to list
      return {
        ...current,
        items: current.items.filter((item) => {
          const namespace = item.metadata?.namespace
          return !namespace || namespace === selected
        }),
      }
    },
    syncWatches,
    refresh,
    refreshNamespaces,
    inspect: (kind, name, namespace) => client.inspect(kind, name, namespace),
    logs: (kind, name, namespace) => client.logs(kind, name, namespace),
    followLogs: (kind, name, namespace, onText) => client.followLogs(kind, name, namespace, onText),
    execute: (command) => client.execute(command),
    extraKinds,
  }
}

interface Watcher {
  stopped: boolean
  stop: () => void
  timer?: ReturnType<typeof setTimeout>
}

function createWatches(input: {
  client: ClusterClient
  snapshots: ReactiveMap<string, ResourceSnapshot>
  refresh: (kind: ResourceKind) => Promise<void>
  namespace: (kind: ResourceKind) => string
  locked: () => string
  kind: (id: string) => ResourceKind | undefined
  started: () => void
}) {
  const objects = new Map<string, Map<string, KubernetesObject>>()
  const watchers = new Map<string, Watcher>()
  const watched = new Set<string>()

  function sync(kindIds: readonly string[]) {
    const open = new Set(kindIds)
    untrack(() => {
      for (const id of [...watchers.keys()]) {
        if (!open.has(id)) stopWatcher(id)
      }
      for (const id of open) {
        if (watchers.has(id)) continue
        const kind = input.kind(id)
        if (!kind) continue
        if (!input.snapshots.has(id)) input.snapshots.set(id, loadingSnapshot)
        startWatcher(kind)
      }
    })
  }

  function restart() {
    for (const id of [...watchers.keys()]) {
      const kind = input.kind(id)
      stopWatcher(id)
      if (kind) startWatcher(kind)
    }
  }

  function stopWatcher(id: string) {
    const watcher = watchers.get(id)
    if (!watcher) return
    watcher.stopped = true
    if (watcher.timer) clearTimeout(watcher.timer)
    watcher.stop()
    watchers.delete(id)
    watched.delete(id)
  }

  function startWatcher(kind: ResourceKind) {
    const watcher: Watcher = { stopped: false, stop: () => {} }
    watchers.set(kind.id, watcher)
    if (!input.client.watch) {
      armPoll(kind, watcher)
      return
    }
    armWatch(kind, watcher)
  }

  function armPoll(kind: ResourceKind, watcher: Watcher) {
    if (watcher.stopped) return
    watched.delete(kind.id)
    const run = () => {
      if (watcher.stopped) return
      void input.refresh(kind).finally(() => {
        if (watcher.stopped) return
        watcher.timer = setTimeout(run, retryMs)
      })
    }
    watcher.stop = () => {
      watcher.stopped = true
      if (watcher.timer) clearTimeout(watcher.timer)
    }
    run()
  }

  function armWatch(kind: ResourceKind, watcher: Watcher) {
    if (watcher.stopped || !input.client.watch) return
    watched.add(kind.id)
    let live = true
    let polling = false
    let stop = () => {}
    stop = input.client.watch(kind, (events) => {
      if (!live || watcher.stopped) return
      if (events.some((event) => event.type === "unwatchable" || event.type === "forbidden")) {
        live = false
        stop()
        const denied = events.find((event) => event.type === "forbidden")
        if (denied?.type === "forbidden") publish(kind.id, objects.get(kind.id) ?? new Map(), denied.error)
        // A cluster-wide list failure waits for the namespace lock to restart this watcher.
        if (denied?.type === "forbidden" && kind.namespaced && !input.locked()) return
        polling = true
        watched.delete(kind.id)
        armPoll(kind, watcher)
        return
      }
      const ended = applyEvents(kind, events)
      if (!ended || watcher.stopped) return
      live = false
      watcher.timer = setTimeout(() => {
        if (watcher.stopped) return
        armWatch(kind, watcher)
      }, retryMs)
    }, input.namespace(kind))
    if (polling) return
    watcher.stop = () => {
      watcher.stopped = true
      live = false
      if (watcher.timer) clearTimeout(watcher.timer)
      stop()
    }
  }

  function applyEvents(kind: ResourceKind, events: WatchEvent[]): boolean {
    let map = objects.get(kind.id) ?? new Map<string, KubernetesObject>()
    let changed = false
    let error: string | null = null
    let ended = false
    for (const event of events) {
      if (event.type === "end") {
        ended = true
        error = event.error ?? null
        break
      }
      if (event.type === "unwatchable" || event.type === "forbidden") continue
      if (event.type === "sync") {
        map = new Map()
        for (const item of event.items) remember(map, item)
        changed = true
        continue
      }
      if (event.type === "deleted") {
        const uid = event.object.metadata?.uid
        if (uid && map.delete(uid)) changed = true
        continue
      }
      remember(map, event.object)
      changed = true
    }
    objects.set(kind.id, map)
    if (changed || error) publish(kind.id, map, error)
    else if (ended) input.started()
    return ended
  }

  function publish(id: string, map: Map<string, KubernetesObject>, error: string | null) {
    const items = [...map.values()].sort(compareObjects)
    const previous = untrack(() => input.snapshots.get(id))
    batch(() => {
      input.snapshots.set(id, {
        status: error ? "error" : "ready",
        items,
        error,
        updatedAt: error ? (previous?.updatedAt ?? null) : Date.now(),
        live: !error,
        cached: false,
      })
    })
    input.started()
  }

  return { sync, restart, watching: (id: string) => watched.has(id) }
}

function remember(map: Map<string, KubernetesObject>, object: KubernetesObject) {
  admit(object)
  const uid = object.metadata?.uid
  if (!uid) return
  map.set(uid, object)
}

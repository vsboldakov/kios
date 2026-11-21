import { expect, test } from "bun:test"
import { createEffect, createRoot } from "solid-js"
import { findKind, type KubernetesObject, type ResourceKind } from "../resources"
import { ClientError, createCluster, type Cluster, type ClusterClient, type WatchEvent } from "./cluster"

function pod(uid: string, name: string): KubernetesObject {
  return { metadata: { uid, name, namespace: "default" } }
}

function names(cluster: Cluster): string[] {
  return cluster.snapshot("pods").items.map((item) => item.metadata?.name ?? "")
}

function stub(client: Partial<ClusterClient>): ClusterClient {
  return {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return []
    },
    async list() {
      return []
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
    ...client,
  }
}

async function until(done: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (done()) return
    await Promise.resolve()
  }
  throw new Error("timed out")
}

test("watches each open kind once and keeps the last rows", async () => {
  const starts: ((events: WatchEvent[]) => void)[] = []
  let stops = 0
  let lists = 0
  const seen: number[] = []
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async list() {
        lists += 1
        return []
      },
      watch(_kind, onEvents) {
        starts.push(onEvents)
        return () => {
          stops += 1
        }
      },
    }))
    createEffect(() => {
      seen.push(cluster.snapshot("pods").items.length)
    })
    cluster.syncWatches(["pods", "pods"])
    return { dispose, cluster }
  })
  const send = (events: WatchEvent[]) => {
    const onEvents = starts[starts.length - 1]
    if (!onEvents) throw new Error("missing watch")
    onEvents(events)
  }
  try {
    expect(starts).toHaveLength(1)
    expect(stops).toBe(0)
    root.cluster.syncWatches(["pods"])
    expect(starts).toHaveLength(1)
    expect(stops).toBe(0)

    const dirty = pod("1", "a")
    ;(dirty.metadata as { managedFields?: unknown }).managedFields = [{ manager: "kubectl" }]
    send([{ type: "sync", items: [pod("2", "b"), dirty] }])
    expect(names(root.cluster)).toEqual(["a", "b"])
    expect(root.cluster.snapshot("pods").live).toBe(true)
    expect(dirty.metadata && "managedFields" in dirty.metadata).toBe(false)

    const mark = seen.length
    send([
      { type: "sync", items: [pod("1", "a"), pod("2", "b")] },
      { type: "deleted", object: pod("1", "a") },
    ])
    expect(seen.slice(mark)).toEqual([1])
    expect(names(root.cluster)).toEqual(["b"])

    send([{ type: "sync", items: [pod("3", "c")] }])
    expect(names(root.cluster)).toEqual(["c"])

    const pods = findKind("pods")
    if (!pods) throw new Error("missing pods")
    await root.cluster.refresh(pods)
    expect(lists).toBe(0)

    send([{ type: "end", error: "gone" }])
    expect(names(root.cluster)).toEqual(["c"])
    expect(root.cluster.snapshot("pods")).toMatchObject({ status: "error", error: "gone", live: false })

    root.cluster.syncWatches([])
    expect(stops).toBe(1)
    send([{ type: "sync", items: [pod("9", "nope")] }])
    expect(names(root.cluster)).toEqual(["c"])

    root.cluster.syncWatches(["pods"])
    expect(starts).toHaveLength(2)
    expect(names(root.cluster)).toEqual(["c"])
    send([{ type: "sync", items: [pod("4", "d")] }])
    expect(names(root.cluster)).toEqual(["d"])
    expect(root.cluster.snapshot("pods")).toMatchObject({ error: null, live: true, cached: false })
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("polls when a kind cannot be watched", async () => {
  let lists = 0
  let stops = 0
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async list() {
        lists += 1
        return [pod("1", "a")]
      },
      watch(_kind, callback) {
        onEvents = callback
        return () => {
          stops += 1
        }
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "unwatchable" }])
    expect(stops).toBe(1)
    await until(() => names(root.cluster).length === 1)
    expect(lists).toBe(1)
    expect(names(root.cluster)).toEqual(["a"])
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("keeps the previous list age while the next list is in flight", async () => {
  const gates: { resolve: (items: KubernetesObject[]) => void; reject: (error: Error) => void }[] = []
  const cluster = createCluster(stub({
    list() {
      return new Promise((resolve, reject) => {
        gates.push({ resolve, reject })
      })
    },
  }))
  const pods = findKind("pods")
  if (!pods) throw new Error("missing pods")
  const first = cluster.refresh(pods)
  expect(cluster.snapshot("pods")).toMatchObject({ status: "loading", cached: false, live: false })
  gates[0]?.resolve([pod("1", "a")])
  await first
  const updatedAt = cluster.snapshot("pods").updatedAt
  expect(updatedAt).toBeGreaterThan(0)
  expect(cluster.snapshot("pods")).toMatchObject({ live: false, cached: false })

  const second = cluster.refresh(pods)
  expect(cluster.snapshot("pods")).toMatchObject({ status: "ready", cached: false, live: false, updatedAt })
  expect(names(cluster)).toEqual(["a"])
  gates[1]?.resolve([pod("2", "b")])
  await second
  expect(names(cluster)).toEqual(["b"])
  expect(cluster.snapshot("pods").cached).toBe(false)
  expect(cluster.snapshot("pods").updatedAt).toBeGreaterThanOrEqual(updatedAt ?? 0)

  const third = cluster.refresh(pods)
  gates[2]?.reject(new Error("gone"))
  await third
  expect(cluster.snapshot("pods")).toMatchObject({ status: "error", error: "gone", cached: false, live: false })
  expect(names(cluster)).toEqual(["b"])
})

test("a later list wins when an earlier one settles after it", async () => {
  const gates: ((items: KubernetesObject[]) => void)[] = []
  const cluster = createCluster(stub({
    list() {
      return new Promise((resolve) => {
        gates.push(resolve)
      })
    },
  }))
  const pods = findKind("pods")
  if (!pods) throw new Error("missing pods")
  const first = cluster.refresh(pods)
  const second = cluster.refresh(pods)
  gates[1]?.([pod("2", "b")])
  await second
  gates[0]?.([pod("1", "a")])
  await first
  expect(names(cluster)).toEqual(["b"])
  expect(cluster.snapshot("pods").status).toBe("ready")
})

test("lists when the client has no watch", async () => {
  let lists = 0
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async list() {
        lists += 1
        return [pod("1", "a")]
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    await until(() => names(root.cluster).length === 1)
    expect(lists).toBe(1)
    const pods = findKind("pods")
    if (!pods) throw new Error("missing pods")
    await root.cluster.refresh(pods)
    expect(lists).toBe(2)
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("polls after a watch is forbidden", async () => {
  const listed: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async list(_kind, namespace) {
        listed.push(namespace ?? "")
        return [pod("1", "a")]
      },
      watch(_kind, callback) {
        onEvents = callback
        return () => {}
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "sync", items: [pod("1", "a")] }])
    expect(root.cluster.snapshot("pods").live).toBe(true)
    onEvents?.([{ type: "unwatchable" }])
    await until(() => listed.length === 1 && root.cluster.snapshot("pods").live === false)
    expect(listed).toEqual([""])
    expect(names(root.cluster)).toEqual(["a"])
    expect(root.cluster.namespaceLocked()).toBe(false)
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("keeps loaders up until CRDs and namespaces settle", async () => {
  const idle = createCluster(stub({}))
  expect(idle.kindsReady()).toBe(true)
  expect(idle.namespacesReady()).toBe(false)

  let releaseNamespaces: ((names: string[]) => void) | undefined
  let releaseKinds: ((kinds: ResourceKind[]) => void) | undefined
  const cluster = createCluster(stub({
    namespaces() {
      return new Promise((resolve) => {
        releaseNamespaces = resolve
      })
    },
    resources() {
      return new Promise((resolve) => {
        releaseKinds = resolve
      })
    },
    async list() {
      return [pod("1", "a")]
    },
  }))
  const pods = findKind("pods")
  if (!pods) throw new Error("missing pods")
  expect(cluster.kindsReady()).toBe(false)
  expect(cluster.namespacesReady()).toBe(false)
  await cluster.refresh(pods)
  expect(cluster.kindsReady()).toBe(false)
  expect(cluster.namespacesReady()).toBe(false)
  releaseNamespaces?.(["default"])
  releaseKinds?.([])
  await until(() => cluster.namespacesReady() && cluster.kindsReady() && cluster.namespaces().length === 1)
  expect(cluster.namespaces()).toEqual(["default"])

  const failed = createCluster(stub({
    resources() {
      return Promise.reject(new Error("nope"))
    },
  }))
  await failed.refresh(pods)
  await until(() => failed.kindsReady())
})

test("shows the launch context without asking kubectl", async () => {
  let called = false
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      context: "prod",
      async currentContext() {
        called = true
        return "demo"
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    expect(root.cluster.contextName()).toBe("prod")
    expect(root.cluster.launchContext()).toBe("prod")
    await until(() => root.cluster.snapshot("pods").status === "ready")
    expect(called).toBe(false)
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("uses the launch namespace when listing namespaces is forbidden", async () => {
  const watched: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async namespaces() {
        throw new ClientError("forbidden", "Error from server (Forbidden): namespaces is forbidden")
      },
      async contextNamespace() {
        return "team"
      },
      watch(_kind, callback, namespace) {
        watched.push(namespace ?? "")
        onEvents = callback
        return () => {}
      },
    }), "payments")
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    expect(root.cluster.namespace()).toBe("payments")
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): pods is forbidden" }])
    await until(() => root.cluster.namespaceLocked())
    expect(root.cluster.namespace()).toBe("payments")
    expect(root.cluster.namespaces()).toEqual(["payments"])
    expect(watched).toEqual(["", "payments"])
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("locks namespaced reads to the context namespace when listing namespaces is forbidden", async () => {
  const watched: string[] = []
  const listed: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async namespaces() {
        throw new ClientError("forbidden", "Error from server (Forbidden): namespaces is forbidden")
      },
      async contextNamespace() {
        return "team"
      },
      async list(_kind, namespace) {
        listed.push(namespace ?? "")
        return [pod("1", "a")]
      },
      watch(_kind, callback, namespace) {
        watched.push(namespace ?? "")
        onEvents = callback
        return () => {}
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): pods is forbidden" }])
    await until(() => root.cluster.namespaceLocked())
    expect(root.cluster.namespace()).toBe("team")
    expect(root.cluster.namespaces()).toEqual(["team"])
    expect(watched).toEqual(["", "team"])
    root.cluster.setNamespace("")
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): pods is forbidden" }])
    await until(() => names(root.cluster).length === 1)
    expect(listed).toEqual(["team"])
    expect(root.cluster.snapshot("pods").live).toBe(false)
    expect(root.cluster.namespaceLocked()).toBe(true)
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("an empty context namespace locks to default", async () => {
  const watched: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async namespaces() {
        throw new ClientError("forbidden", "Error from server (Forbidden): namespaces is forbidden")
      },
      async contextNamespace() {
        return "  "
      },
      watch(_kind, callback, namespace) {
        watched.push(namespace ?? "")
        onEvents = callback
        return () => {}
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): pods is forbidden" }])
    await until(() => root.cluster.namespaceLocked())
    expect(root.cluster.namespace()).toBe("default")
    expect(watched).toEqual(["", "default"])
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("a forbidden resource list does not lock when namespaces can be read", async () => {
  const watched: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async namespaces() {
        return ["default", "other"]
      },
      watch(_kind, callback, namespace) {
        watched.push(namespace ?? "")
        onEvents = callback
        return () => {}
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): pods is forbidden" }])
    await until(() => root.cluster.namespaces().length === 2)
    for (let step = 0; step < 5; step++) await Promise.resolve()
    expect(root.cluster.namespaceLocked()).toBe(false)
    expect(root.cluster.namespace()).toBe("")
    expect(watched).toEqual([""])
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("a namespace outage does not lock the scope", async () => {
  let failed = false
  const watched: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async namespaces() {
        failed = true
        throw new Error("connection refused")
      },
      watch(_kind, callback, namespace) {
        watched.push(namespace ?? "")
        onEvents = callback
        return () => {}
      },
    }))
    cluster.syncWatches(["pods"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): pods is forbidden" }])
    await until(() => failed)
    for (let step = 0; step < 5; step++) await Promise.resolve()
    expect(root.cluster.namespaceLocked()).toBe(false)
    expect(watched).toEqual([""])
    expect(root.cluster.snapshot("pods").error).toContain("Forbidden")
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

test("polls a cluster-scoped kind when its list is forbidden", async () => {
  const listed: string[] = []
  let onEvents: ((events: WatchEvent[]) => void) | undefined
  const root = createRoot((dispose) => {
    const cluster = createCluster(stub({
      async list(kind, namespace) {
        listed.push(`${kind.id}:${namespace ?? ""}`)
        throw new Error("Error from server (Forbidden): nodes is forbidden")
      },
      watch(_kind, callback) {
        onEvents = callback
        return () => {}
      },
    }))
    cluster.syncWatches(["nodes"])
    return { dispose, cluster }
  })
  try {
    onEvents?.([{ type: "forbidden", error: "Error from server (Forbidden): nodes is forbidden" }])
    await until(() => listed.length === 1)
    expect(listed).toEqual(["nodes:"])
    expect(root.cluster.namespaceLocked()).toBe(false)
  } finally {
    root.cluster.syncWatches([])
    root.dispose()
  }
})

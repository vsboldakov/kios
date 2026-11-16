import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { Cluster, ResourceSnapshot } from "../cluster/cluster"
import type { KubernetesObject } from "../resources"
import { visibleRows } from "./selection"
import { createSession } from "./session"

function cluster(items: KubernetesObject[]): Cluster {
  const snapshot: ResourceSnapshot = { status: "ready", items, error: null, updatedAt: null, live: false, cached: false }
  return {
    contextName: () => "",
    launchContext: () => "",
    namespaces: () => [],
    namespace: () => "",
    namespaceLocked: () => false,
    setNamespace: () => {},
    now: () => 0,
    snapshot: () => snapshot,
    syncWatches: () => {},
    refresh: async () => {},
    refreshNamespaces: async () => {},
    inspect: async () => ({ describe: "", yaml: "", json: "" }),
    logs: async () => "",
    followLogs: () => () => {},
    execute: async () => {},
    extraKinds: () => [],
  }
}

test("visible rows follow the container list or the filtered resource list", () => {
  const pod: KubernetesObject = {
    metadata: { uid: "1", name: "api", namespace: "default" },
    spec: { containers: [{ name: "app" }, { name: "sidecar" }] },
  }
  const worker: KubernetesObject = { metadata: { uid: "2", name: "worker", namespace: "default" } }
  createRoot((dispose) => {
    const session = createSession([{ id: "pods" }])
    const resources = visibleRows(session, cluster([pod, worker]))
    expect(resources?.type).toBe("resources")
    if (resources?.type !== "resources") return
    expect(resources.shown.map((item) => item.metadata?.name)).toEqual(["api", "worker"])
    session.setFilter("api")
    const filtered = visibleRows(session, cluster([pod, worker]))
    if (filtered?.type !== "resources") return
    expect(filtered.shown.map((item) => item.metadata?.name)).toEqual(["api"])
    expect(filtered.rows).toHaveLength(2)
    session.showContainers("api", "default")
    const containers = visibleRows(session, cluster([pod, worker]))
    expect(containers?.type).toBe("containers")
    if (containers?.type !== "containers") return
    expect(containers.shown.map((row) => row.name)).toEqual(["app", "sidecar"])
    session.setContainerFilter("side")
    const narrowed = visibleRows(session, cluster([pod, worker]))
    if (narrowed?.type !== "containers") return
    expect(narrowed.shown.map((row) => row.name)).toEqual(["sidecar"])
    expect(narrowed.rows.map((row) => row.name)).toEqual(["app", "sidecar"])
    dispose()
  })
})

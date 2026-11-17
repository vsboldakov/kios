import { expect, test } from "bun:test"
import type { ResourceKind } from "../resources"
import { logArgs, lookupResource, readWatchChunk, scopePath, withContext } from "./kubectl"

const table = `
pods po v1 true Pod get,list,watch
deployments deploy apps/v1 true Deployment get,list,watch
pods metrics.k8s.io/v1beta1 true PodMetrics get,list
volumesnapshots vs snapshot.storage.k8s.io/v1 true VolumeSnapshot get,list,watch
`.trim()

test("parses watch lines once they are complete", () => {
  const split = readWatchChunk("", '{"type":"ADDED","object":{"metadata":{"uid":"1","name":"a"}}}\n{"type":"MOD')
  expect(split.ended).toBe(false)
  expect(split.events).toEqual([{ type: "added", object: { metadata: { uid: "1", name: "a" } } }])
  const rest = readWatchChunk(split.carry, 'IFIED","object":{"metadata":{"uid":"1","name":"b"}}}\n')
  expect(rest.carry).toBe("")
  expect(rest.events).toEqual([{ type: "modified", object: { metadata: { uid: "1", name: "b" } } }])
  const marked = readWatchChunk("", '{"type":"BOOKMARK","object":{"metadata":{"resourceVersion":"5"}}}\n{"type":"DELETED","object":{"metadata":{"uid":"1"}}}\n')
  expect(marked.ended).toBe(false)
  expect(marked.events).toEqual([{ type: "deleted", object: { metadata: { uid: "1" } } }])
  const failed = readWatchChunk("", '{"type":"ADDED","object":{"metadata":{"uid":"2"}}}\n{"type":"ERROR","object":{"code":410}}\n')
  expect(failed.ended).toBe(true)
  expect(failed.events).toEqual([{ type: "added", object: { metadata: { uid: "2" } } }])
})

test("a forbidden watch status ends the stream", () => {
  const denied = readWatchChunk("", '{"type":"ERROR","object":{"code":403,"reason":"Forbidden"}}\n')
  expect(denied).toEqual({ events: [{ type: "unwatchable" }], carry: "", ended: true })
  const status = readWatchChunk("", '{"kind":"Status","reason":"Forbidden","code":403}\n')
  expect(status).toEqual({ events: [{ type: "unwatchable" }], carry: "", ended: true })
})

test("prefixes kubectl args with the launch context", () => {
  expect(withContext("", ["get", "ns"])).toEqual(["get", "ns"])
  expect(withContext("prod", ["get", "pods", "-n", "payments"])).toEqual(["--context", "prod", "get", "pods", "-n", "payments"])
})

test("scopes a resource path to a namespace", () => {
  expect(scopePath("/api/v1/pods", "")).toBe("/api/v1/pods")
  expect(scopePath("/api/v1/pods", "team")).toBe("/api/v1/namespaces/team/pods")
  expect(scopePath("/apis/apps/v1/deployments", "team")).toBe("/apis/apps/v1/namespaces/team/deployments")
})

test("maps an api-resources row to its API path", () => {
  expect(lookupResource(table, "pods")).toEqual({ path: "/api/v1/pods", watchable: true })
  expect(lookupResource(table, "deployments")).toEqual({ path: "/apis/apps/v1/deployments", watchable: true })
  expect(lookupResource(table, "deployments.apps")).toEqual({ path: "/apis/apps/v1/deployments", watchable: true })
})

test("a row without watch is unwatchable", () => {
  expect(lookupResource(table, "pods.metrics.k8s.io")).toEqual({
    path: "/apis/metrics.k8s.io/v1beta1/pods",
    watchable: false,
  })
})

test("a versioned custom resource name watches that row", () => {
  expect(lookupResource(table, "volumesnapshots.v1.snapshot.storage.k8s.io")).toEqual({
    path: "/apis/snapshot.storage.k8s.io/v1/volumesnapshots",
    watchable: true,
  })
})

test("logs one container or every container", () => {
  const pods: ResourceKind = { id: "pods", label: "Pods", resource: "pods", namespaced: true, group: 0, columns: [] }
  expect(logArgs(pods, "api", "default", false)).toEqual(["logs", "--tail=500", "--all-containers", "--prefix", "-n", "default", "pods/api"])
  expect(logArgs(pods, "api", "default", true, true, "app")).toEqual(["logs", "-f", "--previous", "--tail=500", "-c", "app", "--prefix", "-n", "default", "pods/api"])
})

import { expect, test } from "bun:test"
import { builtinKinds } from "./builtin"

const table = `
bindings                                                                v1                                       true    Binding                            create
componentstatuses                   cs                                  v1                                       false   ComponentStatus                    get,list
endpoints                           ep                                  v1                                       true    Endpoints                          create,delete,get,list
pods                                po                                  v1                                       true    Pod                                create,delete,get,list
pods                                                                    metrics.k8s.io/v1beta1                   true    PodMetrics                         get,list
events                              ev                                  v1                                       true    Event                              create,delete,get,list
events                              ev                                  events.k8s.io/v1                         true    Event                              create,delete,get,list
clusterroles                                                            rbac.authorization.k8s.io/v1             false   ClusterRole                        create,delete,deletecollection,get,list,patch,update,watch
roles                                                                   rbac.authorization.k8s.io/v1             true    Role                               create,delete,get,list
rolebindings                                                            rbac.authorization.k8s.io/v1             true    RoleBinding                        create,delete,get,list
ciliumendpoints                     cep                                 cilium.io/v2                             true    CiliumEndpoint                     delete,get,list
volumesnapshots                     vs                                  snapshot.storage.k8s.io/v1               true    VolumeSnapshot                     delete,get,list
leases                                                                  coordination.k8s.io/v1                   true    Lease                              create,delete,get,list
`.trim()

const crds = JSON.stringify({
  items: [
    { spec: { group: "cilium.io", names: { plural: "ciliumendpoints" } } },
    { spec: { group: "snapshot.storage.k8s.io", names: { plural: "volumesnapshots" } } },
  ],
})

test("keeps builtin resources that the sidebar does not already list", () => {
  const kinds = builtinKinds(table, crds)
  expect(kinds.map((kind) => kind.id)).toEqual([
    "clusterroles",
    "componentstatuses",
    "endpoints",
    "leases",
    "pods.metrics.k8s.io",
    "roles",
  ])
  expect(kinds.map((kind) => kind.label)).toEqual([
    "ClusterRoles",
    "ComponentStatuses",
    "Endpoints",
    "Leases",
    "PodMetrics",
    "Roles",
  ])
  const metrics = kinds.find((kind) => kind.id === "pods.metrics.k8s.io")
  expect(metrics?.resource).toBe("pods.metrics.k8s.io")
  expect(metrics?.deletable).toBe(false)
  expect(metrics?.namespaced).toBe(true)
  expect(kinds.find((kind) => kind.id === "componentstatuses")).toMatchObject({
    namespaced: false,
    deletable: false,
    aliases: ["cs", "componentstatus"],
    apiVersion: "v1",
  })
  expect(kinds.find((kind) => kind.id === "clusterroles")).toMatchObject({
    resource: "clusterroles",
    namespaced: false,
    deletable: true,
    apiVersion: "rbac.authorization.k8s.io/v1",
  })
  expect(metrics?.apiVersion).toBe("metrics.k8s.io/v1beta1")
  expect(kinds.find((kind) => kind.id === "roles")?.columns.map((column) => column.id)).toEqual(["namespace", "name", "age"])
  expect(kinds.find((kind) => kind.id === "endpoints")?.columns.map((column) => column.id)).toEqual(["namespace", "name", "age"])
})

test("keeps apiVersion when the same kind comes from different groups", () => {
  const kinds = builtinKinds(
    `
policies  policy.example.com/v1  true  Policy  get,list
policies  other.example.com/v1alpha1  true  Policy  get,list
`.trim(),
    '{"items":[]}',
  )
  expect(kinds.map((kind) => ({ label: kind.label, apiVersion: kind.apiVersion }))).toEqual([
    { label: "Policies", apiVersion: "policy.example.com/v1" },
    { label: "Policies", apiVersion: "other.example.com/v1alpha1" },
  ])
})

test("reads known custom resources from api-resources when CRDs cannot be listed", () => {
  const kinds = builtinKinds(`${table}\nwidgets  example.com/v1  true  Widget  get,list`, "")
  const ids = kinds.map((kind) => kind.id)
  expect(ids).toContain("volumesnapshots")
  expect(ids).toContain("ciliumendpoints")
  expect(ids).not.toContain("widgets")
  expect(kinds.filter((kind) => kind.id === "ciliumendpoints")).toHaveLength(1)
  expect(kinds.find((kind) => kind.id === "ciliumendpoints")).toMatchObject({
    resource: "ciliumendpoints.v2.cilium.io",
    deletable: true,
    namespaced: true,
  })
  expect(kinds.find((kind) => kind.id === "volumesnapshots")).toMatchObject({
    resource: "volumesnapshots.v1.snapshot.storage.k8s.io",
    deletable: true,
  })
})

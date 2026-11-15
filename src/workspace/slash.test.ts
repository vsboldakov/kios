import { expect, test } from "bun:test"
import { resourceKinds } from "../resources"
import { matchSlash, slashItems } from "./slash"

const items = slashItems({
  kinds: [
    { id: "pods", label: "Pods", resource: "pods" },
    { id: "services", label: "Services", resource: "services" },
    { id: "hpas", label: "HPAs", resource: "horizontalpodautoscalers" },
    { id: "configmaps", label: "Config Maps", resource: "configmaps" },
  ],
  actions: [
    { id: "describe", label: "Describe" },
    { id: "delete", label: "Delete" },
  ],
  namespaces: ["default", "kube-system"],
})

test("ranks slash matches by prefix, then substring, then fuzzy", () => {
  expect(matchSlash(items, "").map((item) => item.label)).toEqual([
    "Pods",
    "Services",
    "HPAs",
    "Config Maps",
    "Describe",
    "Delete",
    "all namespaces",
    "default",
    "kube-system",
  ])
  expect(matchSlash(items, "de").map((item) => `${item.type}:${item.label}`)).toEqual([
    "action:Describe",
    "action:Delete",
    "namespace:default",
  ])
  expect(matchSlash(items, "svc").map((item) => item.value)).toEqual(["services"])
  expect(matchSlash(items, "hpa").map((item) => item.value)).toEqual(["hpas"])
  expect(matchSlash(items, "kube").map((item) => item.label)).toEqual(["kube-system"])
  expect(matchSlash(items, "cm").map((item) => item.value)).toEqual(["configmaps"])
  expect(matchSlash(items, "nope")).toEqual([])
})

test("matches kubectl short names ahead of longer kind names", () => {
  const kinds = slashItems({ kinds: resourceKinds, actions: [], namespaces: [] })
  const first = (query: string) => matchSlash(kinds, query)[0]?.value
  expect(first("po")).toBe("pods")
  expect(first("svc")).toBe("services")
  expect(first("deploy")).toBe("deployments")
  expect(first("sts")).toBe("statefulsets")
  expect(first("ds")).toBe("daemonsets")
  expect(first("rs")).toBe("replicasets")
  expect(first("cm")).toBe("configmaps")
  expect(first("ns")).toBe("namespaces")
  expect(first("no")).toBe("nodes")
  expect(first("sa")).toBe("serviceaccounts")
  expect(first("ing")).toBe("ingresses")
  expect(first("pvc")).toBe("pvcs")
  expect(first("pv")).toBe("pvs")
  expect(first("cj")).toBe("cronjobs")
  expect(first("sc")).toBe("storageclasses")
  expect(first("netpol")).toBe("networkpolicies")
  expect(first("hpa")).toBe("hpas")
  expect(first("pdb")).toBe("pdbs")
  expect(first("quota")).toBe("resourcequotas")
  expect(first("limits")).toBe("limitranges")
  expect(first("ev")).toBe("events")
})

test("carries a kind apiVersion onto the slash item", () => {
  const listed = slashItems({
    kinds: [{ id: "policies.other.example.com", label: "Policies", resource: "policies.other.example.com", apiVersion: "other.example.com/v1alpha1" }],
    actions: [],
    namespaces: [],
  })
  expect(listed[0]).toMatchObject({ label: "Policies", apiVersion: "other.example.com/v1alpha1", type: "kind" })
  expect(listed[1]?.apiVersion).toBeUndefined()
})

test("matches resources from the current screen by name", () => {
  const listed = slashItems({
    kinds: [{ id: "pods", label: "Pods", resource: "pods" }],
    actions: [],
    namespaces: ["default"],
    resources: [
      { name: "api", namespace: "default" },
      { name: "worker", namespace: "kube-system" },
    ],
    qualifyNames: true,
  })
  expect(matchSlash(listed, "worker").map((item) => item.value)).toEqual(["kube-system/worker"])
  expect(matchSlash(listed, "api")[0]?.label).toBe("default/api")
  const named = slashItems({
    kinds: [],
    actions: [],
    namespaces: [],
    resources: [{ name: "api", namespace: "default" }],
  })
  expect(matchSlash(named, "api")[0]?.label).toBe("api")
})

test("omits all namespaces when the scope is locked", () => {
  const locked = slashItems({ kinds: [], actions: [], namespaces: ["team"], includeAll: false })
  expect(locked.map((item) => item.label)).toEqual(["team"])
})

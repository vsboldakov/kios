import { expect, test } from "bun:test"
import { findKind, type KubernetesObject } from "."
import { hpaTargets } from "./hpa"

const cell = (id: string, object: KubernetesObject) =>
  findKind("hpas")?.columns.find((column) => column.id === id)?.cell(object, 0)

test("shows each metric's current value against its target", () => {
  const object: KubernetesObject = {
    spec: {
      minReplicas: 1,
      maxReplicas: 10,
      metrics: [
        { type: "Resource", resource: { name: "cpu", target: { averageUtilization: 50 } } },
        { type: "Resource", resource: { name: "memory", target: { averageValue: "100Mi" } } },
        { type: "Pods", pods: { target: { averageValue: "1k" } } },
      ],
    },
    status: {
      currentReplicas: 2,
      desiredReplicas: 4,
      currentMetrics: [
        { type: "Resource", resource: { name: "cpu", current: { averageUtilization: 80 } } },
        { type: "Resource", resource: { name: "memory", current: { averageValue: "20Mi" } } },
        { type: "Pods", pods: { current: { averageValue: "500" } } },
      ],
    },
  }

  expect(findKind("hpas")?.columns.map((column) => column.id)).toEqual([
    "namespace",
    "name",
    "reference",
    "targets",
    "min",
    "max",
    "replicas",
    "age",
  ])
  expect(hpaTargets(object)).toBe("cpu: 80%/50%, memory: 20Mi/100Mi + 1 more...")
  expect(cell("targets", object)).toEqual({ text: "cpu: 80%/50%, memory: 20Mi/100Mi + 1 more..." })
  expect(cell("min", object)).toEqual({ text: "1" })
  expect(cell("max", object)).toEqual({ text: "10" })
  expect(cell("replicas", object)).toEqual({ text: "2/4", tone: "progress" })
  expect(cell("replicas", { status: { currentReplicas: 2, desiredReplicas: 2 }, spec: { maxReplicas: 10 } })).toEqual({
    text: "2/2",
    tone: "ready",
  })
  expect(cell("replicas", { status: { currentReplicas: 10, desiredReplicas: 10 }, spec: { maxReplicas: 10 } })).toEqual({
    text: "10/10",
    tone: "progress",
  })
  expect(cell("min", {})).toEqual({ text: "<unset>" })
  expect(cell("replicas", {})).toEqual({ text: "" })
})

test("pairs a current metric with its spec when status order or length differs", () => {
  expect(hpaTargets({
    spec: {
      metrics: [
        { type: "Resource", resource: { name: "cpu", target: { averageUtilization: 50 } } },
        { type: "Resource", resource: { name: "memory", target: { averageValue: "100Mi" } } },
      ],
    },
    status: {
      currentMetrics: [
        { type: "Resource", resource: { name: "memory", current: { averageValue: "20Mi" } } },
      ],
    },
  })).toBe("cpu: <unknown>/50%, memory: 20Mi/100Mi")

  expect(hpaTargets({
    spec: {
      metrics: [
        { type: "ContainerResource", containerResource: { name: "cpu", container: "app", target: { averageUtilization: 50 } } },
        { type: "ContainerResource", containerResource: { name: "cpu", container: "sidecar", target: { averageUtilization: 70 } } },
      ],
    },
    status: {
      currentMetrics: [
        { type: "ContainerResource", containerResource: { name: "cpu", container: "sidecar", current: { averageUtilization: 9 } } },
        { type: "ContainerResource", containerResource: { name: "cpu", container: "app", current: { averageUtilization: 80 } } },
      ],
    },
  })).toBe("cpu(app): 80%/50%, cpu(sidecar): 9%/70%")

  expect(hpaTargets({
    spec: {
      metrics: [
        { type: "External", external: { metric: { name: "queue", selector: { matchLabels: { lane: "a" } } }, target: { value: "10" } } },
        { type: "External", external: { metric: { name: "queue", selector: { matchLabels: { lane: "b" } } }, target: { value: "4" } } },
      ],
    },
    status: {
      currentMetrics: [
        { type: "External", external: { metric: { name: "queue", selector: { matchLabels: { lane: "b" } } }, current: { value: "3" } } },
        { type: "External", external: { metric: { name: "queue", selector: { matchLabels: { lane: "a" } } }, current: { value: "9" } } },
      ],
    },
  })).toBe("9/10, 3/4")

  expect(hpaTargets({
    spec: {
      metrics: [
        { type: "Object", object: { describedObject: { apiVersion: "v1", kind: "Service", name: "frontend" }, metric: { name: "hits" }, target: { value: "10" } } },
        { type: "Object", object: { describedObject: { apiVersion: "networking.k8s.io/v1", kind: "Service", name: "frontend" }, metric: { name: "hits" }, target: { value: "20" } } },
      ],
    },
    status: {
      currentMetrics: [
        { type: "Object", object: { describedObject: { apiVersion: "networking.k8s.io/v1", kind: "Service", name: "frontend" }, metric: { name: "hits" }, current: { value: "2" } } },
      ],
    },
  })).toBe("<unknown>/10, 2/20")
})

test("formats the other metric kinds and a v1 cpu target", () => {
  expect(hpaTargets({
    spec: { metrics: [{ type: "External", external: { target: { averageValue: "30" } } }] },
    status: { currentMetrics: [{ type: "External", external: { current: { averageValue: "12" } } }] },
  })).toBe("12/30 (avg)")
  expect(hpaTargets({
    spec: { metrics: [{ type: "External", external: { target: { value: "10k" } } }] },
    status: { currentMetrics: [{ type: "External", external: { current: { value: "8823020m" } } }] },
  })).toBe("8823020m/10k")
  expect(hpaTargets({
    spec: { metrics: [{ type: "Object", object: { target: { averageValue: "3" } } }] },
  })).toBe("<unknown>/3 (avg)")
  expect(hpaTargets({
    spec: { metrics: [{ type: "ContainerResource", containerResource: { name: "cpu", container: "app", target: {} } }] },
    status: { currentMetrics: [{ type: "ContainerResource", containerResource: { name: "cpu", container: "app", current: { averageUtilization: 4 } } }] },
  })).toBe("cpu(app): 4%/<auto>")
  expect(hpaTargets({ spec: { metrics: [{ type: "Weird" }] } })).toBe("<unknown type>")
  expect(hpaTargets({})).toBe("<none>")
  expect(hpaTargets({ spec: { targetCPUUtilizationPercentage: 80 }, status: { currentCPUUtilizationPercentage: 10 } })).toBe("cpu: 10%/80%")
  expect(hpaTargets({ spec: { targetCPUUtilizationPercentage: 80 } })).toBe("cpu: <unknown>/80%")
})

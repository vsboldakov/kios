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
    spec: { metrics: [{ type: "ContainerResource", containerResource: { name: "cpu", target: {} } }] },
    status: { currentMetrics: [{ type: "ContainerResource", containerResource: { current: { averageUtilization: 4 } } }] },
  })).toBe("cpu: 4%/<auto>")
  expect(hpaTargets({ spec: { metrics: [{ type: "Weird" }] } })).toBe("<unknown type>")
  expect(hpaTargets({})).toBe("<none>")
  expect(hpaTargets({ spec: { targetCPUUtilizationPercentage: 80 }, status: { currentCPUUtilizationPercentage: 10 } })).toBe("cpu: 10%/80%")
  expect(hpaTargets({ spec: { targetCPUUtilizationPercentage: 80 } })).toBe("cpu: <unknown>/80%")
})

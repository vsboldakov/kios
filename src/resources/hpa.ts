import { read, show } from "./columns"
import type { Cell, KubernetesObject } from "./types"

// shortcut: v2 metrics and v1 cpu percent; annotation-encoded v2beta1 metrics stay <none>
export function hpaTargets(object: KubernetesObject): string {
  const specs = records(object.spec?.metrics)
  if (specs.length === 0) return legacyCpu(object)
  const current = new Map(records(object.status?.currentMetrics).flatMap((status) => {
    const key = metricKey(status)
    if (!key) return []
    return [[key, status] as const]
  }))
  const shown = specs.slice(0, 2).map((spec) => {
    const key = metricKey(spec)
    return oneMetric(spec, key ? current.get(key) : undefined)
  })
  const extra = specs.length - shown.length
  if (extra === 0) return shown.join(", ")
  return `${shown.join(", ")} + ${extra} more...`
}

export function hpaReplicas(object: KubernetesObject): Cell {
  const current = object.status?.currentReplicas
  const desired = object.status?.desiredReplicas
  if (typeof current !== "number" && typeof desired !== "number") return { text: "" }
  const text = `${typeof current === "number" ? current : 0}/${typeof desired === "number" ? desired : 0}`
  if (typeof current !== "number" || typeof desired !== "number") return { text }
  const max = object.spec?.maxReplicas
  return { text, tone: current === desired && !(typeof max === "number" && current >= max) ? "ready" : "progress" }
}

function legacyCpu(object: KubernetesObject): string {
  const target = object.spec?.targetCPUUtilizationPercentage
  if (typeof target !== "number") return "<none>"
  return `cpu: ${percent(object.status?.currentCPUUtilizationPercentage)}/${target}%`
}

function oneMetric(spec: Record<string, unknown>, status: Record<string, unknown> | undefined): string {
  if (spec.type === "Resource") return namedResource(spec.resource, status?.resource)
  if (spec.type === "ContainerResource") return namedResource(spec.containerResource, status?.containerResource)
  if (spec.type === "Pods") return pair(read(status, "pods", "current", "averageValue"), read(spec, "pods", "target", "averageValue"))
  if (spec.type === "External") return valued(spec.external, status?.external)
  if (spec.type === "Object") return valued(spec.object, status?.object)
  return "<unknown type>"
}

function namedResource(spec: unknown, status: unknown): string {
  const name = show(read(spec, "name"))
  const container = show(read(spec, "container"))
  const label = name && container ? `${name}(${container})` : name || container
  const average = read(spec, "target", "averageValue")
  const text = average !== undefined
    ? pair(read(status, "current", "averageValue"), average)
    : `${percent(read(status, "current", "averageUtilization"))}/${utilization(read(spec, "target", "averageUtilization"))}`
  return label ? `${label}: ${text}` : text
}

// status.currentMetrics is not aligned with spec.metrics, so pair them by identity
function metricKey(metric: Record<string, unknown>): string | undefined {
  if (metric.type === "Resource") return join(metric.type, read(metric.resource, "name"))
  if (metric.type === "ContainerResource") return join(metric.type, read(metric.containerResource, "name"), read(metric.containerResource, "container"))
  if (metric.type === "Pods") return join(metric.type, ...metricIdentity(metric.pods))
  if (metric.type === "External") return join(metric.type, ...metricIdentity(metric.external))
  if (metric.type === "Object") {
    const target = read(metric.object, "describedObject")
    return join(metric.type, read(target, "apiVersion"), read(target, "kind"), read(target, "name"), ...metricIdentity(metric.object))
  }
  return undefined
}

function metricIdentity(source: unknown): [unknown, string] {
  return [read(source, "metric", "name"), JSON.stringify(read(source, "metric", "selector") ?? null)]
}

function join(...parts: unknown[]): string {
  return parts.map((part) => show(part)).join("\0")
}

function valued(spec: unknown, status: unknown): string {
  const average = read(spec, "target", "averageValue")
  if (average !== undefined) return `${pair(read(status, "current", "averageValue"), average)} (avg)`
  return pair(read(status, "current", "value"), read(spec, "target", "value"))
}

function pair(current: unknown, target: unknown): string {
  return `${quantity(current)}/${quantity(target)}`
}

function quantity(value: unknown): string {
  return show(value) || "<unknown>"
}

function percent(value: unknown): string {
  return typeof value === "number" ? `${value}%` : "<unknown>"
}

function utilization(value: unknown): string {
  return typeof value === "number" ? `${value}%` : "<auto>"
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
}

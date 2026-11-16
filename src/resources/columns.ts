import { formatAge } from "./format"
import type { Column, KubernetesObject } from "./types"

export const namespaceColumn: Column = {
  id: "namespace",
  header: "NAMESPACE",
  width: 14,
  cell: (object) => ({ text: object.metadata?.namespace ?? "" }),
}

export const nameColumn: Column = {
  id: "name",
  header: "NAME",
  width: 12,
  grow: true,
  cell: (object) => ({ text: object.metadata?.name ?? "" }),
}

export const ageColumn: Column = {
  id: "age",
  header: "AGE",
  width: 5,
  cell: (object, now) => ({ text: formatAge(object.metadata?.creationTimestamp, now), tone: "muted" }),
}

export function listed(namespaced: boolean, middle: Column[]): Column[] {
  return [...(namespaced ? [namespaceColumn] : []), nameColumn, ...middle, ageColumn]
}

export function column(id: string, header: string, width: number, text: (object: KubernetesObject) => string, grow = false): Column {
  return { id, header, width, grow, cell: (object) => ({ text: text(object) }) }
}

export function readyColumn(): Column {
  return {
    id: "ready",
    header: "READY",
    width: 5,
    cell: (object) => {
      const status = conditionText(object, "Ready")
      if (status === "True") return { text: "True", tone: "ready" }
      if (status === "False") return { text: "False", tone: "progress" }
      return { text: status }
    },
  }
}

export function messageColumn(): Column {
  return {
    id: "message",
    header: "STATUS",
    width: 12,
    grow: true,
    cell: (object) => ({ text: object.status?.conditions?.find((item) => item.type === "Ready")?.message ?? "" }),
  }
}

export function suspendColumn(): Column {
  return column("suspend", "SUSPEND", 8, (object) => (read(object.spec, "suspend") === true ? "True" : "False"))
}

export function boolColumn(id: string, header: string, width: number, value: (object: KubernetesObject) => unknown): Column {
  return {
    id,
    header,
    width,
    cell: (object) => {
      const current = value(object)
      if (current === true || current === "True") return { text: "True", tone: "ready" }
      if (current === false || current === "False") return { text: "False", tone: "progress" }
      return { text: "" }
    },
  }
}

export function statusColumn(
  id: string,
  header: string,
  width: number,
  value: (object: KubernetesObject) => string,
  ready: readonly string[],
): Column {
  return {
    id,
    header,
    width,
    cell: (object) => {
      const text = value(object)
      if (!text) return { text: "" }
      if (ready.includes(text)) return { text, tone: "ready" }
      return { text, tone: "progress" }
    },
  }
}

export function show(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

export function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function lengthOf(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return String(value.length)
}

export function qualifiedName(prefix: string, name: string): string {
  if (!name) return ""
  if (!prefix) return name
  return `${prefix}/${name}`
}

export function joinList(value: unknown, text: (item: unknown) => string): string {
  if (!Array.isArray(value)) return ""
  return value.flatMap((item) => {
    const shown = text(item)
    return shown ? [shown] : []
  }).join(",")
}

export function conditionText(object: KubernetesObject, type: string): string {
  return object.status?.conditions?.find((item) => item.type === type)?.status ?? ""
}

export function texts(value: unknown): string {
  if (typeof value === "string") return value
  return joinList(value, (item) => show(item))
}

export function labelText(value: unknown): string {
  const record = asRecord(value)
  if (!record) return ""
  return Object.entries(record).flatMap(([key, item]) => {
    if (typeof item !== "string" && typeof item !== "number") return []
    return [`${key}=${item}`]
  }).join(",")
}

export function read(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>((current, key) => asRecord(current)?.[key], value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

import type { CellPart, Column, KubernetesObject } from "./types"

export function objectId(object: KubernetesObject): string {
  const name = object.metadata?.name ?? ""
  const namespace = object.metadata?.namespace ?? ""
  return object.metadata?.uid ?? `${namespace}/${name}`
}

export function compareObjects(left: KubernetesObject, right: KubernetesObject): number {
  const namespace = (left.metadata?.namespace ?? "").localeCompare(right.metadata?.namespace ?? "")
  if (namespace !== 0) return namespace
  return (left.metadata?.name ?? "").localeCompare(right.metadata?.name ?? "")
}

export function formatAge(timestamp: string | undefined, now: number): string {
  if (!timestamp) return ""
  const created = Date.parse(timestamp)
  if (Number.isNaN(created)) return ""
  const seconds = Math.max(0, Math.floor((now - created) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function fit(value: string, width: number): string {
  if (width <= 0) return ""
  if (value.length <= width) return value.padEnd(width, " ")
  return value.slice(0, width)
}

export function fitParts(parts: readonly CellPart[], width: number): CellPart[] {
  if (width <= 0) return []
  const out: CellPart[] = []
  let left = width
  for (const part of parts) {
    if (left <= 0) break
    const text = part.text.slice(0, left)
    left -= text.length
    if (text) out.push(part.tone ? { text, tone: part.tone } : { text })
  }
  if (left > 0) out.push({ text: " ".repeat(left) })
  return out
}

export function columnWidth(column: Column, objects: readonly KubernetesObject[], now: number): number {
  return objects.reduce((max, object) => Math.max(max, column.cell(object, now).text.length), column.width)
}

export function resolveWidths(columns: readonly { width: number; grow?: boolean }[], total: number): number[] {
  const gaps = 2 * Math.max(0, columns.length - 1)
  const fixed = columns.reduce((sum, column) => sum + (column.grow ? 0 : column.width), 0)
  const growers = columns.filter((column) => column.grow).length
  const leftover = Math.max(0, total - gaps - fixed)
  const growWidth = growers === 0 ? 0 : Math.max(4, Math.floor(leftover / growers))
  return columns.map((column) => (column.grow ? growWidth : column.width))
}

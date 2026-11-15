import type { KubernetesObject } from "./types"

const factors: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
}

export function parseQuantity(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = /^(\d+(?:\.\d+)?)([A-Za-z]*)$/.exec(value)
  if (!match) return undefined
  const amount = Number(match[1])
  const factor = match[2] ? factors[match[2]] : 1
  if (!Number.isFinite(amount) || factor === undefined) return undefined
  return amount * factor
}

export function formatCpu(value: string | undefined): string {
  const cores = parseQuantity(value)
  if (cores === undefined) return "-"
  const milli = Math.round(cores * 1000)
  if (Math.abs(milli) >= 1000 && milli % 1000 === 0) return String(milli / 1000)
  return `${milli}m`
}

export function formatMemory(value: string | undefined): string {
  const bytes = parseQuantity(value)
  if (bytes === undefined) return "-"
  const mib = bytes / 1024 / 1024
  if (mib < 10 * 1024) return `${Math.round(mib)}Mi`
  const gib = mib / 1024
  if (gib < 1024) return `${roundTenths(gib)}Gi`
  return `${roundTenths(gib / 1024)}Ti`
}

export function formatPercent(used: string | undefined, total: string | undefined): string {
  const usage = parseQuantity(used)
  const capacity = parseQuantity(total)
  if (usage === undefined || !capacity) return "-"
  return `${Math.round((usage / capacity) * 100)}%`
}

export function mergeUsage(objects: KubernetesObject[], metrics: readonly KubernetesObject[]): KubernetesObject[] {
  const usage = new Map(metrics.flatMap((item) => {
    const name = item.metadata?.name
    if (!name || !item.usage) return []
    return [[name, item.usage] as const]
  }))
  if (usage.size === 0) return objects
  return objects.map((object) => {
    const current = usage.get(object.metadata?.name ?? "")
    return current ? { ...object, usage: current } : object
  })
}

function roundTenths(value: number): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

import { kubernetesKind, pluralKind, resourceKinds } from "./catalog"
import { claimsCustom, customKinds, type DiscoveredResource } from "../custom"
import { listed } from "./columns"
import type { ResourceKind } from "./types"

interface ApiRow {
  name: string
  group: string
  version: string
  kind: string
  namespaced: boolean
  shorts: string[]
  verbs: Set<string>
}

export function builtinKinds(table: string, crdPayload: string): ResourceKind[] {
  const rows = table.split("\n").flatMap((line) => {
    const row = parseRow(line)
    return row ? [row] : []
  })
  const custom = customNames(crdPayload)
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1)
  const taken = new Set(resourceKinds.map((kind) => kind.resource))
  const ids = new Set(resourceKinds.map((kind) => kind.id))
  const kinds = rows.flatMap((row) => {
    if (row.name.includes("/")) return []
    if (!row.verbs.has("get") || !row.verbs.has("list")) return []
    if (claimsCustom(row.name, row.group)) return []
    if (isCustom(row, custom)) return []
    if (resourceKinds.some((kind) => kind.resource === row.name && kubernetesKind(kind.id) === row.kind)) return []
    const qualified = row.group ? `${row.name}.${row.group}` : row.name
    const resource = row.group && ((counts.get(row.name) ?? 0) > 1 || taken.has(row.name)) ? qualified : row.name
    const id = ids.has(row.name) ? qualified : row.name
    ids.add(id)
    const label = pluralKind(row.kind)
    return [
      {
        id,
        label,
        resource,
        apiVersion: row.group ? `${row.group}/${row.version}` : row.version,
        namespaced: row.namespaced,
        group: 8,
        deletable: row.verbs.has("delete"),
        aliases: [...row.shorts, row.kind.toLowerCase()],
        columns: listed(row.namespaced, []),
      },
    ]
  })
  kinds.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
  return [...kinds, ...customKinds(crdPayload, rows.map(discovered))]
}

function discovered(row: ApiRow): DiscoveredResource {
  return { name: row.name, group: row.group, version: row.version, namespaced: row.namespaced, shorts: row.shorts }
}

function parseRow(line: string): ApiRow | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  const namespacedAt = tokens.findIndex((token) => token === "true" || token === "false")
  if (namespacedAt < 2 || namespacedAt > 3 || namespacedAt + 2 >= tokens.length) return null
  const name = tokens[0] ?? ""
  const apiversion = tokens[namespacedAt - 1] ?? ""
  const kind = tokens[namespacedAt + 1] ?? ""
  if (!name || !kind) return null
  const slash = apiversion.lastIndexOf("/")
  return {
    name,
    group: slash >= 0 ? apiversion.slice(0, slash) : "",
    version: slash >= 0 ? apiversion.slice(slash + 1) : apiversion,
    kind,
    namespaced: tokens[namespacedAt] === "true",
    shorts: namespacedAt === 3 ? (tokens[1] ?? "").split(",").filter(Boolean) : [],
    verbs: new Set((tokens[namespacedAt + 2] ?? "").split(",").filter(Boolean)),
  }
}

function customNames(payload: string): Set<string> | null {
  if (!payload.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || !("items" in parsed) || !Array.isArray(parsed.items)) return null
  const names = new Set<string>()
  for (const item of parsed.items) {
    const spec = item && typeof item === "object" && "spec" in item ? item.spec : undefined
    const group = spec && typeof spec === "object" && "group" in spec && typeof spec.group === "string" ? spec.group : ""
    const kindNames = spec && typeof spec === "object" && "names" in spec ? spec.names : undefined
    const plural = kindNames && typeof kindNames === "object" && "plural" in kindNames && typeof kindNames.plural === "string" ? kindNames.plural : ""
    if (group && plural) names.add(`${plural}.${group}`)
  }
  return names
}

// shortcut: a failed CRD list keeps *.k8s.io groups, so CRDs installed there show up until discovery can read CRDs
function isCustom(row: ApiRow, custom: Set<string> | null): boolean {
  if (custom) return custom.has(row.group ? `${row.name}.${row.group}` : row.name)
  if (row.group === "" || row.group === "apps" || row.group === "batch" || row.group === "autoscaling" || row.group === "policy" || row.group === "extensions") return false
  return !row.group.endsWith(".k8s.io")
}

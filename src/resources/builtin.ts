import { kubernetesKind, pluralKind, resourceKinds } from "./catalog"
import { claimsCustom, crdNames, customKinds, type DiscoveredResource } from "../custom"
import { parseApiTable, type ApiResource } from "./api-table"
import { listed } from "./columns"
import type { ResourceKind } from "./types"

export function builtinKinds(table: string, crdPayload: string): ResourceKind[] {
  const rows = parseApiTable(table)
  const custom = crdNames(crdPayload)
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

function discovered(row: ApiResource): DiscoveredResource {
  return { name: row.name, group: row.group, version: row.version, namespaced: row.namespaced, shorts: row.shorts }
}

// shortcut: a failed CRD list keeps *.k8s.io groups, so CRDs installed there show up until discovery can read CRDs
function isCustom(row: ApiResource, custom: Set<string> | null): boolean {
  if (custom) return custom.has(row.group ? `${row.name}.${row.group}` : row.name)
  if (row.group === "" || row.group === "apps" || row.group === "batch" || row.group === "autoscaling" || row.group === "policy" || row.group === "extensions") return false
  return !row.group.endsWith(".k8s.io")
}

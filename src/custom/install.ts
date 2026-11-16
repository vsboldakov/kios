import { pluralKind } from "../resources/catalog"
import type { KindAction, ResourceKind } from "../resources/types"
import { read, show } from "../resources/columns"

export interface DiscoveredResource {
  name: string
  group: string
  version: string
  namespaced: boolean
  shorts: readonly string[]
}

export interface CustomResource {
  group: string
  versions: readonly string[]
  plural: string
  kind: string
  namespaced: boolean
  columns: ResourceKind["columns"]
  aliases?: readonly string[]
  actions?: readonly KindAction[]
  label?: string
  sidebar?: boolean
}

export interface CustomPack {
  group: number
  resources: readonly CustomResource[]
}

interface ServedCrd {
  group: string
  plural: string
  scope: string
  shorts: string[]
  served: string[]
}

interface Match {
  version: string
  namespaced: boolean
  shorts: readonly string[]
}

export function pack(group: number, resources: readonly CustomResource[]): CustomPack {
  return { group, resources }
}

export function namespaceArgs(kind: ResourceKind, namespace: string): string[] {
  if (kind.namespaced && namespace) return ["-n", namespace]
  return []
}

export function crdNames(payload: string): Set<string> | null {
  const crds = parseCrds(payload)
  if (!crds) return null
  return new Set(crds.map((crd) => `${crd.plural}.${crd.group}`))
}

export function installCustom(packs: readonly CustomPack[], crdPayload: string, rows: readonly DiscoveredResource[]): ResourceKind[] {
  const crds = parseCrds(crdPayload)
  const ids = new Set<string>()
  return packs.flatMap((item) =>
    item.resources.flatMap((resource) => {
      const match = crds ? matchCrd(resource, crds) : matchRow(resource, rows)
      if (!match) return []
      const id = ids.has(resource.plural) ? `${resource.plural}.${resource.group}` : resource.plural
      ids.add(id)
      return [toKind(item.group, resource, match, id)]
    }),
  )
}

function toKind(group: number, resource: CustomResource, match: Match, id: string): ResourceKind {
  return {
    id,
    label: resource.label ?? pluralKind(resource.kind),
    resource: `${resource.plural}.${match.version}.${resource.group}`,
    apiVersion: `${resource.group}/${match.version}`,
    namespaced: match.namespaced,
    group,
    deletable: true,
    aliases: [...new Set([...(resource.aliases ?? []), ...match.shorts, resource.kind.toLowerCase()])],
    columns: resource.columns,
    ...(resource.sidebar ? { sidebar: true } : {}),
    ...(resource.actions?.length ? { actions: resource.actions } : {}),
  }
}

function matchCrd(resource: CustomResource, crds: readonly ServedCrd[]): Match | undefined {
  const crd = crds.find((item) => item.group === resource.group && item.plural === resource.plural)
  const version = crd ? choose(resource.versions, crd.served) : undefined
  if (!crd || !version) return undefined
  return { version, namespaced: scoped(resource, crd.scope), shorts: crd.shorts }
}

function matchRow(resource: CustomResource, rows: readonly DiscoveredResource[]): Match | undefined {
  const matches = rows.filter((row) => row.name === resource.plural && row.group === resource.group)
  const version = choose(resource.versions, matches.map((row) => row.version))
  const row = matches.find((item) => item.version === version)
  if (!row || !version) return undefined
  return { version, namespaced: row.namespaced, shorts: row.shorts }
}

// First matching entry wins, so resource versions are listed newest-first.
function choose(versions: readonly string[], served: readonly string[]): string | undefined {
  return versions.find((version) => version !== "" && served.includes(version))
}

function scoped(resource: CustomResource, scope: string): boolean {
  if (scope === "Cluster") return false
  if (scope === "Namespaced") return true
  return resource.namespaced
}

function parseCrds(payload: string): ServedCrd[] | null {
  if (!payload.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  const items = read(parsed, "items")
  if (!Array.isArray(items)) return null
  return items.flatMap((item) => {
    const spec = read(item, "spec")
    const group = show(read(spec, "group"))
    const plural = show(read(spec, "names", "plural"))
    if (!group || !plural) return []
    return [
      {
        group,
        plural,
        scope: show(read(spec, "scope")),
        shorts: strings(read(spec, "names", "shortNames")),
        served: servedVersions(read(spec, "versions")),
      },
    ]
  })
}

function servedVersions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((version) => {
    const name = show(read(version, "name"))
    if (!name || read(version, "served") === false) return []
    return [name]
  })
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const text = show(item)
    return text ? [text] : []
  })
}

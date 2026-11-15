export interface SlashItem {
  label: string
  apiVersion?: string
  type: "kind" | "action" | "namespace" | "resource"
  value: string
  aliases: readonly string[]
}

export function slashItems(input: {
  kinds: readonly { id: string; label: string; resource: string; apiVersion?: string; aliases?: readonly string[] }[]
  actions: readonly { id: string; label: string }[]
  namespaces: readonly string[]
  resources?: readonly { name: string; namespace: string }[]
  qualifyNames?: boolean
  includeAll?: boolean
}): SlashItem[] {
  const qualify = input.qualifyNames === true
  const all = input.includeAll === false ? [] : [{ label: "all namespaces", type: "namespace" as const, value: "", aliases: [] as readonly string[] }]
  return [
    ...input.kinds.map((kind) => ({
      label: kind.label,
      ...(kind.apiVersion ? { apiVersion: kind.apiVersion } : {}),
      type: "kind" as const,
      value: kind.id,
      aliases: kindAliases(kind),
    })),
    ...input.actions.map((action) => ({
      label: action.label,
      type: "action" as const,
      value: action.id,
      aliases: [action.id],
    })),
    ...all,
    ...input.namespaces.map((name) => ({
      label: name,
      type: "namespace" as const,
      value: name,
      aliases: [],
    })),
    ...(input.resources ?? []).flatMap((resource) => {
      if (!resource.name) return []
      const qualified = qualify && resource.namespace ? `${resource.namespace}/${resource.name}` : resource.name
      return [
        {
          label: qualified,
          type: "resource" as const,
          value: `${resource.namespace}/${resource.name}`,
          aliases: qualified === resource.name ? [] : [resource.name],
        },
      ]
    }),
  ]
}

export function matchSlash(items: readonly SlashItem[], query: string): SlashItem[] {
  const needle = query.toLowerCase()
  if (!needle) return [...items]
  return items
    .map((item, index) => ({ item, index, rank: rank(needle, item) }))
    .filter((row): row is { item: SlashItem; index: number; rank: number } => row.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((row) => row.item)
}

// kubectl api-resources short names; a label prefix would otherwise outrank these
const shortNames: Record<string, readonly string[]> = {
  nodes: ["no"],
  pods: ["po"],
  deployments: ["deploy"],
  statefulsets: ["sts"],
  daemonsets: ["ds"],
  replicasets: ["rs"],
  cronjobs: ["cj"],
  configmaps: ["cm"],
  hpas: ["hpa"],
  pdbs: ["pdb"],
  services: ["svc"],
  ingresses: ["ing"],
  networkpolicies: ["netpol"],
  storageclasses: ["sc"],
  pvcs: ["pvc"],
  pvs: ["pv"],
  namespaces: ["ns"],
  resourcequotas: ["quota"],
  limitranges: ["limits"],
  serviceaccounts: ["sa"],
  events: ["ev"],
}

function kindAliases(kind: { id: string; resource: string; aliases?: readonly string[] }): string[] {
  const names = kind.resource === kind.id ? [kind.id] : [kind.id, kind.resource]
  return [...names, ...(shortNames[kind.id] ?? []), ...(kind.aliases ?? [])]
}

function rank(query: string, item: SlashItem): number | null {
  const label = item.label.toLowerCase()
  const aliases = item.aliases.map((alias) => alias.toLowerCase())
  if (label === query || aliases.includes(query)) return 0
  if (label.startsWith(query)) return 1
  if (aliases.some((alias) => alias.startsWith(query))) return 2
  if (label.includes(query)) return 3
  if (aliases.some((alias) => alias.includes(query))) return 4
  if (fuzzy(query, label)) return 5
  return null
}

function fuzzy(query: string, value: string): boolean {
  let at = 0
  for (const char of query) {
    const found = value.indexOf(char, at)
    if (found < 0) return false
    at = found + 1
  }
  return true
}

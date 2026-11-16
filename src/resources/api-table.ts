export interface ApiResource {
  name: string
  group: string
  version: string
  kind: string
  namespaced: boolean
  shorts: string[]
  verbs: Set<string>
}

export function parseApiTable(table: string): ApiResource[] {
  return table.split("\n").flatMap((line) => {
    const row = parseApiRow(line)
    return row ? [row] : []
  })
}

function parseApiRow(line: string): ApiResource | null {
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

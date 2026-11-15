export function nameMatches(name: string, query: string): boolean {
  if (!query) return true
  return name.toLowerCase().includes(query.toLowerCase())
}

export function fitMatch(value: string, query: string, width: number): { text: string; match: boolean }[] {
  if (width <= 0) return []
  const needle = query.toLowerCase()
  const at = needle ? value.toLowerCase().indexOf(needle) : -1
  const spans =
    at < 0
      ? [{ text: value, match: false }]
      : [value.slice(0, at), value.slice(at, at + needle.length), value.slice(at + needle.length)].flatMap((text, index) =>
          text ? [{ text, match: index === 1 }] : [],
        )
  const out: { text: string; match: boolean }[] = []
  let left = width
  for (const span of spans) {
    if (left <= 0) break
    const text = span.text.slice(0, left)
    left -= text.length
    if (text) out.push({ text, match: span.match })
  }
  if (left > 0) out.push({ text: " ".repeat(left), match: false })
  return out
}

export function rowAfterFilter<T>(items: readonly T[], index: number, from: string, to: string, name: (item: T) => string): number {
  const current = items.filter((item) => nameMatches(name(item), from))
  const selected = current[Math.min(Math.max(index, 0), Math.max(current.length - 1, 0))]
  if (!selected) return 0
  const next = items.filter((item) => nameMatches(name(item), to))
  const found = next.indexOf(selected)
  return found >= 0 ? found : 0
}

const rank = { patch: 1, minor: 2, major: 3 } as const

type Level = keyof typeof rank

export function latestVersion(tags: readonly string[]): string | null {
  const versions = tags.flatMap((tag) => {
    const match = /^v(\d+\.\d+\.\d+)$/.exec(tag.trim())
    return match?.[1] ? [match[1]] : []
  })
  if (versions.length === 0) return null
  return versions.reduce((best, version) => (compareVersions(version, best) > 0 ? version : best))
}

export function planRelease(input: {
  current: string
  latestTag: string | null
  messages: readonly string[]
  force: Level | null
}): { version: string; notes: string } | null {
  parseVersion(input.current)
  if (input.latestTag && compareVersions(input.latestTag, input.current) > 0) {
    throw new Error(`tag v${input.latestTag} is newer than package.json ${input.current}`)
  }
  const notes = releaseNotes(input.messages)
  // The version commit can be pushed before the tag. Ship that version instead of bumping again.
  if (input.latestTag && compareVersions(input.current, input.latestTag) > 0) return { version: input.current, notes }
  if (!input.latestTag && !input.force) return { version: input.current, notes }
  const level = resolveLevel(input.messages, input.force)
  if (!level) return null
  return { version: bump(input.current, level), notes }
}

export function releaseNotes(messages: readonly string[]): string {
  const groups: Record<Level, string[]> = { major: [], minor: [], patch: [] }
  for (const message of messages) {
    const level = commitLevel(message)
    if (level) groups[level].push(subject(message))
  }
  const sections = [
    section("Breaking", groups.major),
    section("Features", groups.minor),
    section("Fixes", groups.patch),
  ].filter((item) => item !== "")
  if (sections.length === 0) return "Initial release."
  return sections.join("\n\n")
}

export function changelog(existing: string, version: string, notes: string): string {
  const title = "# Changelog\n\n"
  const rest = existing.replace(/^# Changelog\n+/, "")
  if (rest.includes(`## ${version}\n`)) {
    const body = existing.startsWith("# Changelog") ? existing : `${title}${existing}`
    return body.endsWith("\n") ? body : `${body}\n`
  }
  return `${title}## ${version}\n\n${notes}\n\n${rest}`.trimEnd() + "\n"
}

export function notesFor(existing: string, version: string): string {
  const heading = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`## ${heading}\\n+([\\s\\S]*?)(?=\\n## |$)`).exec(existing)
  const notes = match?.[1]?.trim()
  if (!notes) return "Initial release."
  return notes
}

function resolveLevel(messages: readonly string[], force: Level | null): Level | null {
  return messages.reduce<Level | null>((highest, message) => higher(highest, commitLevel(message)), force)
}

function commitLevel(message: string): Level | null {
  const header = message.split("\n", 1)[0] ?? ""
  const match = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<bang>!)?: /.exec(header)
  if (!match?.groups?.type) return null
  if (match.groups.bang === "!" || /^BREAKING CHANGE:/m.test(message) || /^BREAKING-CHANGE:/m.test(message)) return "major"
  if (match.groups.type === "feat") return "minor"
  if (match.groups.type === "fix") return "patch"
  return null
}

function subject(message: string): string {
  const header = message.split("\n", 1)[0] ?? ""
  const match = /^[a-z]+(?:\((?<scope>[^)]*)\))?!?: (?<text>.*)$/.exec(header)
  if (!match?.groups?.text) return header
  if (match.groups.scope) return `${match.groups.scope}: ${match.groups.text}`
  return match.groups.text
}

function section(title: string, items: readonly string[]): string {
  if (items.length === 0) return ""
  return `### ${title}\n${items.map((item) => `- ${item}`).join("\n")}`
}

function higher(left: Level | null, right: Level | null): Level | null {
  if (!left) return right
  if (!right) return left
  return rank[left] >= rank[right] ? left : right
}

function bump(current: string, level: Level): string {
  const [major, minor, patch] = parseVersion(current)
  if (level === "major") return `${major + 1}.0.0`
  if (level === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match?.[1] || !match[2] || !match[3]) throw new Error(`invalid version ${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(left: string, right: string): number {
  const [a1, a2, a3] = parseVersion(left)
  const [b1, b2, b3] = parseVersion(right)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
}

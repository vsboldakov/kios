import { expect, test } from "bun:test"
import { changelog, latestVersion, notesFor, planRelease } from "./semver"

test("releases the current version once, then bumps from conventional commits", () => {
  expect(planRelease({ current: "0.1.0", latestTag: null, messages: ["feat: first"], force: null })).toEqual({
    version: "0.1.0",
    notes: "### Features\n- first",
  })
  expect(planRelease({ current: "0.1.0", latestTag: "0.1.0", messages: ["fix(screen): keep row"], force: null })).toEqual({
    version: "0.1.1",
    notes: "### Fixes\n- screen: keep row",
  })
  expect(planRelease({ current: "0.1.9", latestTag: "0.1.9", messages: ["feat: add"], force: null })?.version).toBe("0.2.0")
  expect(planRelease({
    current: "0.2.0",
    latestTag: "0.2.0",
    messages: ["fix: typo", "feat!: redraw"],
    force: null,
  })?.version).toBe("1.0.0")
  expect(planRelease({
    current: "1.2.3",
    latestTag: "1.2.3",
    messages: ["fix: crash\n\nBREAKING CHANGE: drops the old flag"],
    force: "patch",
  })?.version).toBe("2.0.0")
  expect(planRelease({ current: "1.2.3", latestTag: "1.2.3", messages: ["chore: tidy", "docs: readme"], force: null })).toBeNull()
  expect(planRelease({ current: "1.2.3", latestTag: "1.2.3", messages: [], force: "minor" })?.version).toBe("1.3.0")
  expect(planRelease({ current: "0.2.0", latestTag: "0.1.0", messages: ["feat: again"], force: null })?.version).toBe("0.2.0")
  expect(() => planRelease({ current: "0.1.0", latestTag: "0.2.0", messages: [], force: null })).toThrow("newer than package.json")
})

test("picks the highest semver tag and keeps an existing changelog section", () => {
  expect(latestVersion(["v0.1.9", "v0.1.10", "v1.0.0-beta", "nope"])).toBe("0.1.10")
  const existing = changelog("", "0.1.0", "Initial release.")
  expect(existing).toBe("# Changelog\n\n## 0.1.0\n\nInitial release.\n")
  const next = changelog(existing, "0.2.0", "### Features\n- add")
  expect(next).toBe("# Changelog\n\n## 0.2.0\n\n### Features\n- add\n\n## 0.1.0\n\nInitial release.\n")
  expect(changelog(next, "0.2.0", "again")).toBe(next)
  expect(notesFor(next, "0.1.0")).toBe("Initial release.")
  expect(notesFor("", "0.1.0")).toBe("Initial release.")
})

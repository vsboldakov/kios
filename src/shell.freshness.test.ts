import { expect, test } from "bun:test"
import type { ResourceSnapshot } from "./cluster/cluster"
import { theme } from "./screen/theme"
import { listFreshness } from "./shell"

const now = Date.parse("2026-11-15T12:00:00Z")

function snapshot(patch: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return { status: "ready", items: [{}], error: null, updatedAt: now, live: false, cached: false, ...patch }
}

test("labels a list as live, cached, stale, or aged", () => {
  expect(listFreshness(snapshot({ status: "loading", items: [] }), now)).toBeNull()
  expect(listFreshness(snapshot({ status: "error", items: [], error: "gone" }), now)).toBeNull()
  expect(listFreshness(snapshot({ live: true }), now)).toEqual({ text: "  live", fg: theme.dot })
  expect(listFreshness(snapshot({ live: true, updatedAt: now - 31_000 }), now)).toEqual({ text: "  live", fg: theme.dot })
  expect(listFreshness(snapshot({ live: true, updatedAt: now - 240_000 }), now)).toEqual({ text: "  live", fg: theme.dot })
  expect(listFreshness(snapshot({ cached: true, updatedAt: now - 240_000 }), now)).toEqual({ text: "  cached 4m", fg: theme.progress })
  expect(listFreshness(snapshot({ status: "error", error: "gone", cached: true, updatedAt: now - 240_000 }), now)).toEqual({
    text: "  cached 4m",
    fg: theme.progress,
  })
  expect(listFreshness(snapshot({ status: "error", error: "gone" }), now)).toEqual({ text: "  stale", fg: theme.error })
  expect(listFreshness(snapshot(), now)).toEqual({ text: "  0s", fg: theme.muted })
  expect(listFreshness(snapshot({ updatedAt: now - 31_000 }), now)).toEqual({ text: "  31s", fg: theme.progress })
})

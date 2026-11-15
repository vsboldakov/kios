import { expect, test } from "bun:test"
import { highlight } from "./highlight"
import { theme } from "./theme"

function text(format: "describe" | "yaml" | "json", line: string): string {
  return highlight(format, line).map((span) => span.text).join("")
}

function color(format: "describe" | "yaml" | "json", line: string, piece: string): string | undefined {
  return highlight(format, line).find((span) => span.text === piece)?.fg
}

test("colors describe keys and status words", () => {
  const line = "Status:       Running"
  expect(text("describe", line)).toBe(line)
  expect(color("describe", line, "Status")).toBe(theme.primary)
  expect(color("describe", line, "Running")).toBe(theme.ready)
  const none = highlight("describe", "Node:    <none>")
  expect(none.some((span) => span.text.includes("<none>") && span.fg === theme.muted)).toBe(true)
})

test("colors yaml keys, numbers, and comments", () => {
  const line = "  replicas: 2"
  expect(text("yaml", line)).toBe(line)
  expect(color("yaml", line, "replicas")).toBe(theme.primary)
  expect(color("yaml", line, "2")).toBe(theme.progress)
  expect(color("yaml", "enabled: false", "false")).toBe(theme.error)
  expect(color("yaml", "  # note", "# note")).toBe(theme.muted)
})

test("colors json keys, strings, and literals", () => {
  const line = '  "name": "api",'
  expect(text("json", line)).toBe(line)
  expect(color("json", line, '"name"')).toBe(theme.primary)
  expect(color("json", line, '"api"')).toBe(theme.ready)
  expect(color("json", "    null", "null")).toBe(theme.muted)
  expect(color("json", "    3", "3")).toBe(theme.progress)
})

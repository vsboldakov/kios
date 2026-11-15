import { expect, test } from "bun:test"
import { columnHeader, columnLetters, sortByText } from "./sort"

test("gives each column a distinct letter from its header", () => {
  expect(columnLetters(["NAMESPACE", "NAME", "READY", "STATUS", "AGE"])).toEqual(["m", "n", "r", "s", "a"])
  expect(columnHeader("READY", "r", null)).toBe("[r] READY")
  expect(columnHeader("READY", "", false)).toBe("READY ↑")
  expect(columnHeader("READY", "", true)).toBe("READY ↓")
})

test("sorts ages and quantities, keeping blanks last", () => {
  expect(sortByText(["10d", "5s", "2h", ""], (value) => value, false)).toEqual(["5s", "2h", "10d", ""])
  expect(sortByText(["10d", "5s", "2h", ""], (value) => value, true)).toEqual(["10d", "2h", "5s", ""])
  expect(sortByText(["100m", "1", "50m"], (value) => value, false)).toEqual(["50m", "100m", "1"])
  expect(sortByText(["pod-10", "pod-2", "pod-2"], (value) => value, false)).toEqual(["pod-2", "pod-2", "pod-10"])
})

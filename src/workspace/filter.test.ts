import { expect, test } from "bun:test"
import { fitMatch, nameMatches, rowAfterFilter } from "./filter"

test("matches a name by case-insensitive substring", () => {
  expect(nameMatches("API", "ap")).toBe(true)
  expect(nameMatches("api", "")).toBe(true)
  expect(nameMatches("api", "z")).toBe(false)
})

test("highlights the matched span and pads to the column width", () => {
  expect(fitMatch("Payment", "pay", 4)).toEqual([
    { text: "Pay", match: true },
    { text: "m", match: false },
  ])
  expect(fitMatch("api", "nope", 5)).toEqual([
    { text: "api", match: false },
    { text: "  ", match: false },
  ])
  expect(fitMatch("api", "a", 0)).toEqual([])
})

test("keeps the selected row when the filter changes", () => {
  const items = [{ name: "api" }, { name: "worker" }, { name: "web" }]
  const name = (item: { name: string }) => item.name
  expect(rowAfterFilter(items, 1, "", "w", name)).toBe(0)
  expect(rowAfterFilter(items, 0, "", "w", name)).toBe(0)
  expect(rowAfterFilter(items, 1, "w", "", name)).toBe(2)
})

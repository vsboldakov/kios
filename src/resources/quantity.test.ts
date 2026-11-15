import { expect, test } from "bun:test"
import { formatCpu, formatMemory, formatPercent, mergeUsage, parseQuantity } from "./quantity"

test("parses cpu and memory quantities", () => {
  expect(parseQuantity("4")).toBe(4)
  expect(parseQuantity("250m")).toBeCloseTo(0.25)
  expect(parseQuantity("187654321n")).toBeCloseTo(0.187654321)
  expect(parseQuantity("1k")).toBe(1000)
  expect(parseQuantity("1Ki")).toBe(1024)
  expect(parseQuantity("1452Mi")).toBe(1452 * 1024 * 1024)
  expect(parseQuantity("16Gi")).toBe(16 * 1024 ** 3)
  expect(parseQuantity("")).toBeUndefined()
  expect(parseQuantity("nope")).toBeUndefined()
})

test("formats usage the way kubectl top does", () => {
  expect(formatCpu("250m")).toBe("250m")
  expect(formatCpu("2000m")).toBe("2")
  expect(formatCpu("187654321n")).toBe("188m")
  expect(formatCpu("0")).toBe("0m")
  expect(formatCpu(undefined)).toBe("-")
  expect(formatMemory("1452Mi")).toBe("1452Mi")
  expect(formatMemory("1536Mi")).toBe("1536Mi")
  expect(formatMemory("16Gi")).toBe("16Gi")
  expect(formatMemory("11776Mi")).toBe("11.5Gi")
  expect(formatMemory(undefined)).toBe("-")
  expect(formatPercent("250m", "4")).toBe("6%")
  expect(formatPercent("2", "4")).toBe("50%")
  expect(formatPercent("1452Mi", "16Gi")).toBe("9%")
  expect(formatPercent(undefined, "4")).toBe("-")
  expect(formatPercent("1", "0")).toBe("-")
})

test("joins metrics onto the node with the same name", () => {
  const nodes = [{ metadata: { name: "a" } }, { metadata: { name: "b" } }]
  const merged = mergeUsage(nodes, [{ metadata: { name: "b" }, usage: { cpu: "100m", memory: "1Gi" } }])
  expect(merged[0]).toBe(nodes[0])
  expect(merged[1]).toEqual({ metadata: { name: "b" }, usage: { cpu: "100m", memory: "1Gi" } })
  expect(mergeUsage(nodes, [])).toBe(nodes)
  expect(mergeUsage(nodes, [{ metadata: { name: "missing" } }])).toBe(nodes)
})

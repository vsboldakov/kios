import { expect, test } from "bun:test"
import { filteredNamespaces } from "./namespace-list"

test("filters namespace names and the all-namespaces row by substring", () => {
  const names = ["default", "empty-ns", "kube-system"]
  expect(filteredNamespaces(false, names, "")).toEqual(["", ...names])
  expect(filteredNamespaces(false, names, "KUBE")).toEqual(["kube-system"])
  expect(filteredNamespaces(false, names, "all")).toEqual([""])
  expect(filteredNamespaces(true, ["default"], "all")).toEqual([])
})

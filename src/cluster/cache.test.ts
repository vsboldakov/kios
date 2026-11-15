import { expect, test } from "bun:test"
import { admit } from "./cache"

test("removes managed fields", () => {
  const object = {
    metadata: { name: "api", managedFields: [{ manager: "kubectl" }] },
    spec: { replicas: 1 },
  }
  admit(object)
  expect(object.metadata.name).toBe("api")
  expect("managedFields" in object.metadata).toBe(false)
  expect(object.spec).toEqual({ replicas: 1 })
  const plain = { metadata: { name: "web" } }
  admit(plain)
  expect(plain.metadata.name).toBe("web")
  admit({})
})

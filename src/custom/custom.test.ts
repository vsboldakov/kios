import { expect, test } from "bun:test"
import { editActions, editCommand } from "../workspace/actions"
import { builtinKinds } from "../resources/builtin"
import { customKinds, packs } from "./index"

function crd(group: string, plural: string, versions: { name: string; served?: boolean }[], scope = "Namespaced", shorts: string[] = []) {
  return {
    spec: {
      group,
      scope,
      names: { plural, shortNames: shorts },
      versions: versions.map((version) => ({ name: version.name, served: version.served !== false, storage: false })),
    },
  }
}

const payload = JSON.stringify({
  items: [
    crd("source.toolkit.fluxcd.io", "gitrepositories", [{ name: "v1" }, { name: "v1beta2" }, { name: "v1beta1", served: false }], "Namespaced", ["gitrepo"]),
    crd("helm.toolkit.fluxcd.io", "helmreleases", [{ name: "v2", served: false }, { name: "v2beta2" }, { name: "v2beta1" }]),
    crd("image.toolkit.fluxcd.io", "imagepolicies", [{ name: "v1beta2" }]),
    crd("cilium.io", "ciliumidentities", [{ name: "v2" }], "Cluster"),
    crd("security.istio.io", "authorizationpolicies", [{ name: "v1" }]),
    crd("policy.linkerd.io", "authorizationpolicies", [{ name: "v1alpha1" }]),
    crd("example.com", "widgets", [{ name: "v1" }]),
  ],
})

test("installs the newest served version and keeps delete on every resource", () => {
  const kinds = customKinds(payload, [])
  const ids = kinds.map((kind) => kind.id)
  expect(ids).toContain("gitrepositories")
  expect(ids).not.toContain("widgets")
  expect(new Set(ids).size).toBe(ids.length)
  expect(kinds.find((kind) => kind.id === "gitrepositories")).toMatchObject({
    resource: "gitrepositories.v1.source.toolkit.fluxcd.io",
    label: "GitRepositories",
    apiVersion: "source.toolkit.fluxcd.io/v1",
    namespaced: true,
    deletable: true,
    aliases: ["gitrepo", "gitrepository"],
  })
  expect(kinds.find((kind) => kind.id === "gitrepositories")?.sidebar).toBeUndefined()
  expect(kinds.find((kind) => kind.id === "helmreleases")?.sidebar).toBe(true)
  expect(kinds.find((kind) => kind.id === "helmreleases")?.resource).toBe("helmreleases.v2beta2.helm.toolkit.fluxcd.io")
  expect(kinds.find((kind) => kind.id === "ciliumidentities")?.namespaced).toBe(false)
  expect(kinds.find((kind) => kind.id === "authorizationpolicies")?.apiVersion).toBe("security.istio.io/v1")
  expect(kinds.find((kind) => kind.resource.startsWith("authorizationpolicies.") && kind.apiVersion === "policy.linkerd.io/v1alpha1")?.id).toBe(
    "authorizationpolicies.policy.linkerd.io",
  )

  for (const kind of kinds) {
    expect(kind.resource.startsWith(`${kind.id.split(".")[0]}.`)).toBe(true)
    expect(editActions(kind.id, false, kinds).some((action) => action.id === "delete")).toBe(true)
    expect(editCommand(kind.id, "delete", { name: "demo", namespace: "ns" }, undefined, kinds)?.args[1]).toBe(kind.resource)
    const keys = editActions(kind.id, false, kinds).map((action) => action.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain("c")
  }
  expect(editActions("gitrepositories", false, kinds).map((action) => action.id)).toEqual(["delete", "reconcile", "edit"])
  expect(editActions("imagepolicies", false, kinds).map((action) => action.id)).toEqual(["delete", "edit"])
  expect(editCommand("imagepolicies", "reconcile", { name: "demo", namespace: "ns" }, undefined, kinds)).toBeNull()
  expect(editCommand("gitrepositories", "reconcile", { name: "podinfo", namespace: "flux-system" }, 0, kinds)?.args).toEqual([
    "annotate",
    "gitrepositories.v1.source.toolkit.fluxcd.io",
    "podinfo",
    "-n",
    "flux-system",
    "--overwrite",
    "reconcile.fluxcd.io/requestedAt=1970-01-01T00:00:00.000Z",
  ])
  expect(editCommand("ciliumidentities", "delete", { name: "123", namespace: "default" }, undefined, kinds)?.args).toEqual([
    "delete",
    "ciliumidentities.v2.cilium.io",
    "123",
    "--wait=false",
  ])
})

test("prefers the CRD's served version over the api-resources row", () => {
  const table = "gitrepositories  gitrepo  source.toolkit.fluxcd.io/v1beta1  true  GitRepository  delete,get,list"
  const found = builtinKinds(table, payload).filter((kind) => kind.id === "gitrepositories")
  expect(found).toHaveLength(1)
  expect(found[0]?.resource).toBe("gitrepositories.v1.source.toolkit.fluxcd.io")
})

test("keeps action keys unique across every custom resource", () => {
  expect(new Set(packs.map((item) => item.group)).size).toBe(packs.length)
  const ids = packs.flatMap((item) => item.resources.map((resource) => `${resource.plural}.${resource.group}`))
  expect(new Set(ids).size).toBe(ids.length)
  for (const item of packs) {
    for (const resource of item.resources) {
      expect(resource.versions.length).toBeGreaterThan(0)
      const keys = ["d", ...(resource.actions ?? []).map((action) => action.key)]
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys).not.toContain("c")
    }
  }
})

test("uses the api-resources version when CRDs cannot be read", () => {
  const kinds = customKinds("", [
    { name: "gitrepositories", group: "source.toolkit.fluxcd.io", version: "v1beta2", namespaced: true, shorts: ["gitrepo"] },
    { name: "widgets", group: "example.com", version: "v1", namespaced: true, shorts: [] },
  ])
  expect(kinds.find((kind) => kind.id === "gitrepositories")?.resource).toBe("gitrepositories.v1beta2.source.toolkit.fluxcd.io")
  expect(kinds.map((kind) => kind.id)).not.toContain("widgets")
})

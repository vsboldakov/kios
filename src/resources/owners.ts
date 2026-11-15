import type { KubernetesObject, OwnerScope } from "./types"

// shortcut: one child kind per owner; statefulsets open pods, not the PVCs they also own
const controls: Record<string, string> = {
  deployments: "replicasets",
  replicasets: "pods",
  statefulsets: "pods",
  daemonsets: "pods",
  jobs: "pods",
  cronjobs: "jobs",
}

export function controlledKind(id: string): string | undefined {
  return controls[id]
}

export function controllerOf(object: KubernetesObject): { kind: string; name: string; uid: string } | null {
  const refs = object.metadata?.ownerReferences ?? []
  const ref = refs.find((item) => item.controller && item.kind && item.name) ?? refs.find((item) => item.kind && item.name)
  if (!ref?.kind || !ref.name) return null
  return { kind: ref.kind, name: ref.name, uid: ref.uid ?? "" }
}

export function ownedItems(items: readonly KubernetesObject[], owner: OwnerScope | null): readonly KubernetesObject[] {
  if (!owner) return items
  return items.filter((object) => {
    if (owner.namespace && (object.metadata?.namespace ?? "") !== owner.namespace) return false
    return (object.metadata?.ownerReferences ?? []).some((ref) => {
      if (ref.controller === false || !ref.kind || !ref.name) return false
      if (owner.uid && ref.uid) return ref.uid === owner.uid
      return ref.kind === owner.kind && ref.name === owner.name
    })
  })
}

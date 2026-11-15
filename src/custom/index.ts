import type { ResourceKind } from "../resources/types"
import { argocd } from "./argocd"
import { certmanager } from "./certmanager"
import { cilium } from "./cilium"
import { flux } from "./flux"
import { installCustom, type DiscoveredResource } from "./install"
import { istio } from "./istio"
import { karpenter } from "./karpenter"
import { keda } from "./keda"
import { kyverno } from "./kyverno"
import { linkerd } from "./linkerd"
import { prometheus } from "./prometheus"
import { velero } from "./velero"
import { volumesnapshot } from "./volumesnapshot"

// Add a product file here. It owns that product's resources, API versions, columns, and actions.
// Describe, YAML, and JSON come from kubectl. Delete is added for every installed resource.
export const packs = [cilium, flux, prometheus, istio, volumesnapshot, argocd, certmanager, karpenter, keda, kyverno, velero, linkerd]

export type { DiscoveredResource } from "./install"

export function claimsCustom(name: string, group: string): boolean {
  return packs.some((item) => item.resources.some((resource) => resource.plural === name && resource.group === group))
}

export function customKinds(crdPayload: string, rows: readonly DiscoveredResource[]): ResourceKind[] {
  return installCustom(packs, crdPayload, rows)
}

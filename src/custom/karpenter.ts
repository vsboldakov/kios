import type { KubernetesObject } from "../resources/types"
import { column, listed, read, readyColumn, show } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "karpenter.sh"
const versions = ["v1", "v1beta1"]

export const karpenter = pack(16, [
  node(group, versions, "nodepools", "NodePool", listed(false, [
    column("nodeclass", "NODECLASS", 16, (object) => show(read(object.spec, "template", "spec", "nodeClassRef", "name")), true),
    column("nodes", "NODES", 6, poolNodes),
    column("cpu", "CPU", 8, (object) => show(read(object.status, "resources", "cpu"))),
    readyColumn(),
  ]), [], true),
  node(group, versions, "nodeclaims", "NodeClaim", listed(false, [
    column("type", "TYPE", 12, (object) => label(object, "node.kubernetes.io/instance-type")),
    column("capacity", "CAPACITY", 10, (object) => label(object, "karpenter.sh/capacity-type")),
    column("zone", "ZONE", 12, (object) => label(object, "topology.kubernetes.io/zone")),
    column("node", "NODE", 16, (object) => show(read(object.status, "nodeName")), true),
    readyColumn(),
  ]), [], true),
  node("karpenter.k8s.aws", versions, "ec2nodeclasses", "EC2NodeClass", listed(false, [
    column("family", "FAMILY", 12, (object) => show(read(object.spec, "amiFamily")), true),
    readyColumn(),
  ]), ["ec2nc", "ec2ncs"]),
])

function node(
  apiGroup: string,
  apiVersions: readonly string[],
  plural: string,
  kind: string,
  columns: CustomResource["columns"],
  aliases: readonly string[] = [],
  sidebar = false,
): CustomResource {
  return { group: apiGroup, versions: apiVersions, plural, kind, namespaced: false, columns, aliases, ...(sidebar ? { sidebar: true } : {}) }
}

function poolNodes(object: KubernetesObject): string {
  return show(read(object.status, "nodes")) || show(read(object.status, "resources", "nodes"))
}

function label(object: KubernetesObject, key: string): string {
  return show(read(object.metadata, "labels", key))
}

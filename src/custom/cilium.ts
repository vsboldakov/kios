import type { KubernetesObject } from "../resources/types"
import { column, joinList, labelText, listed, read, show, statusColumn } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "cilium.io"

export const cilium = pack(9, [
  resource(["v2"], "ciliumendpoints", "CiliumEndpoint", true, listed(true, [
    column("identity", "IDENTITY", 8, (object) => show(read(object.status, "identity", "id"))),
    statusColumn("state", "STATE", 12, (object) => show(read(object.status, "state")), ["ready"]),
    column("ipv4", "IPV4", 16, endpointIPv4, true),
  ]), ["cep"]),
  resource(["v2"], "ciliumidentities", "CiliumIdentity", false, listed(false, [
    column("labels", "LABELS", 18, (object) => labelText(read(object, "security-labels")), true),
  ])),
  resource(["v2"], "ciliumnodes", "CiliumNode", false, listed(false, [
    column("ip", "INTERNAL-IP", 16, nodeIP, true),
  ])),
  resource(["v2"], "ciliumnetworkpolicies", "CiliumNetworkPolicy", true, listed(true, [
    column("selector", "SELECTOR", 18, (object) => labelText(read(object.spec, "endpointSelector", "matchLabels")), true),
  ]), ["cnp"]),
  resource(["v2"], "ciliumclusterwidenetworkpolicies", "CiliumClusterwideNetworkPolicy", false, listed(false, [
    column("selector", "SELECTOR", 18, (object) => labelText(read(object.spec, "endpointSelector", "matchLabels")), true),
  ]), ["ccnp"]),
  resource(["v2", "v2alpha1"], "ciliumloadbalancerippools", "CiliumLoadBalancerIPPool", false, listed(false, [
    column("cidrs", "CIDRS", 18, poolCidrs, true),
  ])),
])

function resource(
  versions: readonly string[],
  plural: string,
  kind: string,
  namespaced: boolean,
  columns: CustomResource["columns"],
  aliases: readonly string[] = [],
): CustomResource {
  return { group, versions, plural, kind, namespaced, columns, aliases }
}

function endpointIPv4(object: KubernetesObject): string {
  return joinList(read(object.status, "networking", "addressing"), (item) => show(read(item, "ipv4")))
}

function nodeIP(object: KubernetesObject): string {
  const addresses = read(object.spec, "addresses")
  if (!Array.isArray(addresses)) return ""
  const internal = addresses.find((item) => show(read(item, "type")) === "InternalIP")
  return show(read(internal ?? addresses[0], "ip"))
}

function poolCidrs(object: KubernetesObject): string {
  const blocks = read(object.spec, "blocks")
  if (Array.isArray(blocks)) return joinList(blocks, (item) => show(read(item, "cidr")))
  return joinList(read(object.spec, "cidrs"), (item) => show(item) || show(read(item, "cidr")))
}

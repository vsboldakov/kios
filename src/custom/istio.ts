import type { KubernetesObject } from "../resources/types"
import { column, labelText, listed, read, show, texts } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const networking = "networking.istio.io"
const security = "security.istio.io"
const stable = ["v1", "v1beta1"]

export const istio = pack(12, [
  istioResource(networking, stable, "virtualservices", "VirtualService", listed(true, [
    column("gateways", "GATEWAYS", 16, (object) => texts(read(object.spec, "gateways"))),
    column("hosts", "HOSTS", 18, (object) => texts(read(object.spec, "hosts")), true),
  ]), ["vs"], true),
  istioResource(networking, stable, "destinationrules", "DestinationRule", listed(true, [
    column("host", "HOST", 18, (object) => show(read(object.spec, "host")), true),
  ]), ["dr"], true),
  istioResource(networking, stable, "gateways", "Gateway", listed(true, [
    column("hosts", "HOSTS", 18, gatewayHosts, true),
  ]), ["gw"], true),
  istioResource(networking, stable, "serviceentries", "ServiceEntry", listed(true, [
    column("hosts", "HOSTS", 18, (object) => texts(read(object.spec, "hosts")), true),
    column("resolution", "RESOLUTION", 12, (object) => show(read(object.spec, "resolution"))),
    column("location", "LOCATION", 10, (object) => show(read(object.spec, "location"))),
  ]), ["se"], true),
  istioResource(networking, stable, "sidecars", "Sidecar", listed(true, [
    column("workload", "WORKLOAD", 18, workload, true),
  ])),
  istioResource(networking, stable, "workloadentries", "WorkloadEntry", listed(true, [
    column("address", "ADDRESS", 16, (object) => show(read(object.spec, "address")), true),
  ])),
  istioResource(networking, stable, "workloadgroups", "WorkloadGroup", listed(true, [
    column("workload", "WORKLOAD", 18, workload, true),
  ])),
  istioResource(networking, ["v1alpha3"], "envoyfilters", "EnvoyFilter", listed(true, [
    column("workload", "WORKLOAD", 18, workload, true),
  ])),
  istioResource(security, stable, "authorizationpolicies", "AuthorizationPolicy", listed(true, [
    column("action", "ACTION", 10, (object) => show(read(object.spec, "action")) || "ALLOW"),
  ]), [], true),
  istioResource(security, stable, "peerauthentications", "PeerAuthentication", listed(true, [
    column("mode", "MODE", 12, (object) => show(read(object.spec, "mtls", "mode"))),
  ])),
  istioResource(security, stable, "requestauthentications", "RequestAuthentication", listed(true, [
    column("issuer", "ISSUER", 18, issuers, true),
  ])),
  istioResource("telemetry.istio.io", ["v1", "v1alpha1"], "telemetries", "Telemetry", listed(true, [
    column("workload", "WORKLOAD", 18, workload, true),
  ])),
  istioResource("extensions.istio.io", ["v1alpha1"], "wasmplugins", "WasmPlugin", listed(true, [
    column("url", "URL", 24, (object) => show(read(object.spec, "url")), true),
  ])),
])

function istioResource(
  group: string,
  versions: readonly string[],
  plural: string,
  kind: string,
  columns: CustomResource["columns"],
  aliases: readonly string[] = [],
  sidebar = false,
): CustomResource {
  return { group, versions, plural, kind, namespaced: true, columns, aliases, ...(sidebar ? { sidebar: true } : {}) }
}

function workload(object: KubernetesObject): string {
  return labelText(read(object.spec, "workloadSelector", "labels"))
}

function gatewayHosts(object: KubernetesObject): string {
  const servers = read(object.spec, "servers")
  if (!Array.isArray(servers)) return ""
  return servers.flatMap((server) => {
    const hosts = read(server, "hosts")
    return Array.isArray(hosts) ? hosts.flatMap((host) => {
      const text = show(host)
      return text ? [text] : []
    }) : []
  }).join(",")
}

function issuers(object: KubernetesObject): string {
  const rules = read(object.spec, "jwtRules")
  if (!Array.isArray(rules)) return ""
  return rules.flatMap((rule) => {
    const issuer = show(read(rule, "issuer"))
    return issuer ? [issuer] : []
  }).join(",")
}

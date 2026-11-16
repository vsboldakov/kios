import type { KubernetesObject } from "../resources/types"
import { column, joinList, labelText, lengthOf, listed, qualifiedName, read, show, texts } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const policy = "policy.linkerd.io"

export const linkerd = pack(20, [
  link("servers", "Server", ["v1beta3", "v1beta2", "v1beta1", "v1alpha1"], listed(true, [
    column("port", "PORT", 8, (object) => show(read(object.spec, "port"))),
    column("protocol", "PROTOCOL", 10, (object) => show(read(object.spec, "proxyProtocol"))),
    column("access", "ACCESS", 8, (object) => show(read(object.spec, "accessPolicy"))),
    column("selector", "SELECTOR", 18, (object) => labelText(read(object.spec, "podSelector", "matchLabels")), true),
  ]), ["srv"], true),
  link("serverauthorizations", "ServerAuthorization", ["v1beta1", "v1alpha1"], listed(true, [
    column("server", "SERVER", 16, (object) => show(read(object.spec, "server", "name"))),
    column("client", "CLIENT", 18, client, true),
  ]), ["saz"], true),
  link("authorizationpolicies", "AuthorizationPolicy", ["v1alpha1"], listed(true, [
    column("target", "TARGET", 18, targetRef, true),
    column("authn", "AUTHN", 6, (object) => lengthOf(read(object.spec, "requiredAuthenticationRefs"))),
  ]), ["authzpolicy"], true),
  link("meshtlsauthentications", "MeshTLSAuthentication", ["v1alpha1"], listed(true, [
    column("identities", "IDENTITIES", 18, (object) => texts(read(object.spec, "identities")), true),
  ]), ["meshtls"]),
  link("networkauthentications", "NetworkAuthentication", ["v1alpha1"], listed(true, [
    column("networks", "NETWORKS", 18, networks, true),
  ]), ["netauth"]),
  link("serviceprofiles", "ServiceProfile", ["v1alpha2", "v1alpha1"], listed(true, [
    column("routes", "ROUTES", 6, (object) => lengthOf(read(object.spec, "routes")), true),
  ]), ["sp"], true, "linkerd.io"),
])

function link(
  plural: string,
  kind: string,
  versions: readonly string[],
  columns: CustomResource["columns"],
  aliases: readonly string[],
  sidebar = false,
  group = policy,
): CustomResource {
  return { group, versions, plural, kind, namespaced: true, columns, aliases, ...(sidebar ? { sidebar: true } : {}) }
}

function targetRef(object: KubernetesObject): string {
  return qualifiedName(show(read(object.spec, "targetRef", "kind")), show(read(object.spec, "targetRef", "name")))
}

function client(object: KubernetesObject): string {
  if (read(object.spec, "client", "unauthenticated") === true) return "unauthenticated"
  const identities = read(object.spec, "client", "meshTLS", "identities")
  if (Array.isArray(identities) && identities.length) return texts(identities)
  const accounts = read(object.spec, "client", "meshTLS", "serviceAccounts")
  if (!Array.isArray(accounts)) return ""
  return joinList(accounts, (item) => show(read(item, "name")))
}

function networks(object: KubernetesObject): string {
  return joinList(read(object.spec, "networks"), (item) => show(item) || show(read(item, "cidr")))
}

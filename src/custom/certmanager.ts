import type { KubernetesObject } from "../resources/types"
import { column, listed, messageColumn, qualifiedName, read, readyColumn, show, statusColumn } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "cert-manager.io"
const acme = "acme.cert-manager.io"
const versions = ["v1", "v1beta1"]

export const certmanager = pack(15, [
  cert(group, "certificates", "Certificate", true, listed(true, [
    column("secret", "SECRET", 16, (object) => show(read(object.spec, "secretName"))),
    column("issuer", "ISSUER", 18, issuerRef),
    readyColumn(),
    messageColumn(),
  ]), ["cert", "certs"], true),
  cert(group, "certificaterequests", "CertificateRequest", true, listed(true, [
    column("issuer", "ISSUER", 18, issuerRef),
    readyColumn(),
    messageColumn(),
  ]), ["cr", "crs"]),
  cert(group, "issuers", "Issuer", true, listed(true, [
    column("type", "TYPE", 12, issuerType),
    readyColumn(),
    messageColumn(),
  ]), [], true),
  cert(group, "clusterissuers", "ClusterIssuer", false, listed(false, [
    column("type", "TYPE", 12, issuerType),
    readyColumn(),
    messageColumn(),
  ]), [], true),
  cert(acme, "orders", "Order", true, listed(true, [
    statusColumn("state", "STATE", 10, (object) => show(read(object.status, "state")), ["ready", "valid"]),
    column("issuer", "ISSUER", 18, issuerRef),
    column("reason", "REASON", 16, (object) => show(read(object.status, "reason")), true),
  ])),
  cert(acme, "challenges", "Challenge", true, listed(true, [
    statusColumn("state", "STATE", 10, (object) => show(read(object.status, "state")), ["ready", "valid"]),
    column("domain", "DOMAIN", 18, (object) => show(read(object.spec, "dnsName")), true),
    column("reason", "REASON", 16, (object) => show(read(object.status, "reason"))),
  ])),
])

function cert(
  apiGroup: string,
  plural: string,
  kind: string,
  namespaced: boolean,
  columns: CustomResource["columns"],
  aliases: readonly string[] = [],
  sidebar = false,
): CustomResource {
  return { group: apiGroup, versions, plural, kind, namespaced, columns, aliases, ...(sidebar ? { sidebar: true } : {}) }
}

function issuerRef(object: KubernetesObject): string {
  const kind = show(read(object.spec, "issuerRef", "kind"))
  return qualifiedName(kind === "Issuer" ? "" : kind, show(read(object.spec, "issuerRef", "name")))
}

function issuerType(object: KubernetesObject): string {
  if (read(object.spec, "acme")) return "ACME"
  if (read(object.spec, "ca")) return "CA"
  if (read(object.spec, "selfSigned")) return "SelfSigned"
  if (read(object.spec, "vault")) return "Vault"
  if (read(object.spec, "venafi")) return "Venafi"
  return ""
}

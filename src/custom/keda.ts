import type { KubernetesObject } from "../resources/types"
import { column, listed, read, readyColumn, show } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "keda.sh"
const versions = ["v1alpha1"]

export const keda = pack(17, [
  scaled("scaledobjects", "ScaledObject", ["so"], [
    column("target", "TARGET", 18, scaleTarget, true),
  ]),
  scaled("scaledjobs", "ScaledJob", ["sj"], []),
  auth("triggerauthentications", "TriggerAuthentication", true),
  auth("clustertriggerauthentications", "ClusterTriggerAuthentication", false),
])

function scaled(plural: string, kind: string, aliases: readonly string[], extra: CustomResource["columns"]): CustomResource {
  return {
    group,
    versions,
    plural,
    kind,
    namespaced: true,
    aliases,
    sidebar: true,
    columns: listed(true, [
      ...extra,
      column("min", "MIN", 4, (object) => show(read(object.spec, "minReplicaCount"))),
      column("max", "MAX", 4, (object) => show(read(object.spec, "maxReplicaCount"))),
      column("triggers", "TRIGGERS", 16, triggers, extra.length === 0),
      readyColumn(),
      column("active", "ACTIVE", 6, (object) => conditionStatus(object, "Active")),
    ]),
  }
}

function auth(plural: string, kind: string, namespaced: boolean): CustomResource {
  return {
    group,
    versions,
    plural,
    kind,
    namespaced,
    columns: listed(namespaced, [
      column("type", "TYPE", 12, authType, true),
    ]),
  }
}

function scaleTarget(object: KubernetesObject): string {
  const kind = show(read(object.status, "scaleTargetKind")) || show(read(object.spec, "scaleTargetRef", "kind"))
  const name = show(read(object.spec, "scaleTargetRef", "name"))
  if (!name) return ""
  if (!kind) return name
  return `${kind}/${name}`
}

function triggers(object: KubernetesObject): string {
  const listed = show(read(object.status, "triggersTypes"))
  if (listed) return listed
  const items = read(object.spec, "triggers")
  if (!Array.isArray(items)) return ""
  return items.flatMap((item) => {
    const type = show(read(item, "type"))
    return type ? [type] : []
  }).join(",")
}

function authType(object: KubernetesObject): string {
  const provider = show(read(object.spec, "podIdentity", "provider"))
  if (provider) return provider
  if (read(object.spec, "secretTargetRef")) return "secret"
  if (read(object.spec, "env")) return "env"
  if (read(object.spec, "hashiCorpVault")) return "vault"
  return ""
}

function conditionStatus(object: KubernetesObject, type: string): string {
  return object.status?.conditions?.find((item) => item.type === type)?.status ?? ""
}

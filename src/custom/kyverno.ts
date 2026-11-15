import type { KubernetesObject } from "../resources/types"
import { boolColumn, column, listed, read, show, texts } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const classic = "kyverno.io"
const classicVersions = ["v2beta1", "v1"]
const cel = "policies.kyverno.io"
const celVersions = ["v1", "v1beta1", "v1alpha1"]
const reports = "wgpolicyk8s.io"

export const kyverno = pack(18, [
  policy(classic, classicVersions, "clusterpolicies", "ClusterPolicy", false, ["cpol"]),
  policy(classic, classicVersions, "policies", "Policy", true, ["pol"]),
  celPolicy(cel, celVersions, "validatingpolicies", "ValidatingPolicy", false, ["vpol"]),
  celPolicy(cel, ["v1", "v1beta1"], "namespacedvalidatingpolicies", "NamespacedValidatingPolicy", true, ["nvpol"]),
  kyvernoResource(classic, ["v2", "v2beta1"], "policyexceptions", "PolicyException", true, listed(true, [
    column("policies", "POLICIES", 18, exceptionPolicies, true),
  ]), ["polex"]),
  report("clusterpolicyreports", "ClusterPolicyReport", false, ["cpolr"], true),
  report("policyreports", "PolicyReport", true, ["polr"]),
])

function policy(
  apiGroup: string,
  versions: readonly string[],
  plural: string,
  kind: string,
  namespaced: boolean,
  aliases: readonly string[],
): CustomResource {
  return kyvernoResource(apiGroup, versions, plural, kind, namespaced, listed(namespaced, [
    column("background", "BACKGROUND", 10, (object) => boolText(read(object.spec, "background"))),
    column("action", "ACTION", 8, (object) => show(read(object.spec, "validationFailureAction"))),
    column("rules", "RULES", 5, (object) => count(read(object.spec, "rules"))),
    boolColumn("ready", "READY", 5, (object) => read(object.status, "ready")),
  ]), aliases, true)
}

function celPolicy(
  apiGroup: string,
  versions: readonly string[],
  plural: string,
  kind: string,
  namespaced: boolean,
  aliases: readonly string[],
): CustomResource {
  return kyvernoResource(apiGroup, versions, plural, kind, namespaced, listed(namespaced, [
    column("action", "ACTION", 12, (object) => texts(read(object.spec, "validationActions")), true),
    column("failure", "FAILURE", 8, (object) => show(read(object.spec, "failurePolicy"))),
    boolColumn("ready", "READY", 5, (object) => read(object.status, "conditionStatus", "ready")),
  ]), aliases, true)
}

function report(plural: string, kind: string, namespaced: boolean, aliases: readonly string[], sidebar = false): CustomResource {
  return kyvernoResource(reports, ["v1alpha2"], plural, kind, namespaced, listed(namespaced, [
    column("scope", "SCOPE", 16, reportScope),
    column("pass", "PASS", 6, (object) => show(read(object, "summary", "pass"))),
    column("fail", "FAIL", 6, (object) => show(read(object, "summary", "fail"))),
    column("warn", "WARN", 6, (object) => show(read(object, "summary", "warn")), true),
  ]), aliases, sidebar)
}

function kyvernoResource(
  apiGroup: string,
  versions: readonly string[],
  plural: string,
  kind: string,
  namespaced: boolean,
  columns: CustomResource["columns"],
  aliases: readonly string[],
  sidebar = false,
): CustomResource {
  return { group: apiGroup, versions, plural, kind, namespaced, columns, aliases, ...(sidebar ? { sidebar: true } : {}) }
}

function exceptionPolicies(object: KubernetesObject): string {
  const refs = read(object.spec, "policyRefs")
  if (Array.isArray(refs)) return refs.flatMap((item) => named(show(read(item, "name")))).join(",")
  const exceptions = read(object.spec, "exceptions")
  if (!Array.isArray(exceptions)) return ""
  return exceptions.flatMap((item) => named(show(read(item, "policyName")))).join(",")
}

function reportScope(object: KubernetesObject): string {
  const kind = show(read(object, "scope", "kind"))
  const name = show(read(object, "scope", "name"))
  if (!name) return kind
  if (!kind) return name
  return `${kind}/${name}`
}

function boolText(value: unknown): string {
  if (value === true) return "True"
  if (value === false) return "False"
  return ""
}

function count(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return String(value.length)
}

function named(value: string): string[] {
  return value ? [value] : []
}

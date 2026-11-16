import type { KindAction, KubernetesObject } from "../resources/types"
import { column, joinList, listed, messageColumn, qualifiedName, read, readyColumn, show, suspendColumn } from "../resources/columns"
import { namespaceArgs, pack, type CustomResource } from "./install"

const source = "source.toolkit.fluxcd.io"
const sourceVersions = ["v1", "v1beta2", "v1beta1"]

// Controllers reconcile when this annotation changes. Add another action beside it on the resource.
const reconcile: KindAction = {
  key: "r",
  label: "Reconcile",
  id: "reconcile",
  command: (kind, target, now) => ({
    bin: "kubectl",
    args: [
      "annotate",
      kind.resource,
      target.name,
      ...namespaceArgs(kind, target.namespace),
      "--overwrite",
      `reconcile.fluxcd.io/requestedAt=${new Date(now).toISOString()}`,
    ],
  }),
}

export const flux = pack(10, [
  fluxResource(source, sourceVersions, "gitrepositories", "GitRepository", [reconcile], [
    column("url", "URL", 24, (object) => show(read(object.spec, "url"))),
    column("revision", "REVISION", 12, (object) => show(read(object.status, "artifact", "revision"))),
  ], ["gitrepo"]),
  fluxResource(source, ["v1", "v1beta2"], "ocirepositories", "OCIRepository", [reconcile], [
    column("url", "URL", 24, (object) => show(read(object.spec, "url"))),
    column("revision", "REVISION", 12, (object) => show(read(object.status, "artifact", "revision"))),
  ], ["ocirepo"]),
  fluxResource(source, sourceVersions, "helmrepositories", "HelmRepository", [reconcile], [
    column("url", "URL", 24, (object) => show(read(object.spec, "url")), true),
  ], ["helmrepo"]),
  fluxResource(source, sourceVersions, "helmcharts", "HelmChart", [reconcile], [
    column("chart", "CHART", 16, (object) => show(read(object.spec, "chart"))),
    column("version", "VERSION", 10, (object) => show(read(object.spec, "version"))),
    column("revision", "REVISION", 12, (object) => show(read(object.status, "artifact", "revision"))),
  ], [], true),
  fluxResource(source, sourceVersions, "buckets", "Bucket", [reconcile], [
    column("endpoint", "ENDPOINT", 18, (object) => show(read(object.spec, "endpoint"))),
    column("revision", "REVISION", 12, (object) => show(read(object.status, "artifact", "revision"))),
  ]),
  fluxResource("kustomize.toolkit.fluxcd.io", sourceVersions, "kustomizations", "Kustomization", [reconcile], [
    column("source", "SOURCE", 18, (object) => ref(object, "sourceRef")),
    column("revision", "REVISION", 12, (object) => show(read(object.status, "lastAppliedRevision"))),
  ], ["ks"], true),
  fluxResource("helm.toolkit.fluxcd.io", ["v2", "v2beta2", "v2beta1"], "helmreleases", "HelmRelease", [reconcile], [
    column("chart", "CHART", 16, helmChart, true),
    column("revision", "REVISION", 12, helmRevision),
  ], ["hr"], true),
  fluxResource("image.toolkit.fluxcd.io", sourceVersions, "imagerepositories", "ImageRepository", [reconcile], [
    column("image", "IMAGE", 18, (object) => show(read(object.spec, "image")), true),
  ], ["imgrepo"]),
  fluxResource("image.toolkit.fluxcd.io", sourceVersions, "imagepolicies", "ImagePolicy", [], [
    column("image", "LATEST", 18, (object) => show(read(object.status, "latestImage")), true),
  ]),
  fluxResource("image.toolkit.fluxcd.io", sourceVersions, "imageupdateautomations", "ImageUpdateAutomation", [reconcile], [
    column("source", "SOURCE", 18, (object) => ref(object, "sourceRef"), true),
  ], ["imgupd"]),
  fluxResource("notification.toolkit.fluxcd.io", ["v1", "v1beta3", "v1beta2", "v1beta1"], "alerts", "Alert", [], [
    column("event", "EVENT", 16, eventSources, true),
  ]),
  fluxResource("notification.toolkit.fluxcd.io", ["v1", "v1beta3", "v1beta2", "v1beta1"], "providers", "Provider", [], [
    column("type", "TYPE", 12, (object) => show(read(object.spec, "type")), true),
  ]),
  fluxResource("notification.toolkit.fluxcd.io", ["v1", "v1beta3", "v1beta2", "v1beta1"], "receivers", "Receiver", [reconcile], [
    column("type", "TYPE", 12, (object) => show(read(object.spec, "type")), true),
  ]),
])

function fluxResource(
  apiGroup: string,
  versions: readonly string[],
  plural: string,
  kind: string,
  actions: readonly KindAction[],
  middle: CustomResource["columns"],
  aliases: readonly string[] = [],
  sidebar = false,
): CustomResource {
  return {
    group: apiGroup,
    versions,
    plural,
    kind,
    namespaced: true,
    aliases,
    columns: listed(true, [...middle, suspendColumn(), readyColumn(), messageColumn()]),
    actions,
    ...(sidebar ? { sidebar: true } : {}),
  }
}

function ref(object: KubernetesObject, key: string): string {
  return qualifiedName(show(read(object.spec, key, "kind")), show(read(object.spec, key, "name")))
}

function helmChart(object: KubernetesObject): string {
  return show(read(object.spec, "chart", "spec", "chart")) || show(read(object.spec, "chartRef", "name"))
}

function helmRevision(object: KubernetesObject): string {
  const attempted = show(read(object.status, "lastAttemptedRevision"))
  if (attempted) return attempted
  const history = read(object.status, "history")
  if (!Array.isArray(history)) return ""
  return show(read(history[0], "chartVersion"))
}

function eventSources(object: KubernetesObject): string {
  return joinList(read(object.spec, "eventSources"), (item) => qualifiedName(show(read(item, "kind")), show(read(item, "name"))))
}

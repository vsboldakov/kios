import type { KubernetesObject } from "../resources/types"
import { column, labelText, lengthOf, listed, read, show } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "monitoring.coreos.com"
const current = ["v1"]

export const prometheus = pack(11, [
  prom(current, "prometheuses", "Prometheus", listed(true, [
    column("version", "VERSION", 10, (object) => show(read(object.status, "version")) || show(read(object.spec, "version"))),
    column("replicas", "REPLICAS", 10, replicas),
  ])),
  prom(current, "alertmanagers", "Alertmanager", listed(true, [
    column("replicas", "REPLICAS", 10, replicas),
  ])),
  prom(current, "thanosrulers", "ThanosRuler", listed(true, [
    column("replicas", "REPLICAS", 10, replicas),
  ])),
  prom(current, "servicemonitors", "ServiceMonitor", listed(true, [
    column("selector", "SELECTOR", 18, (object) => labelText(read(object.spec, "selector", "matchLabels")), true),
  ]), true),
  prom(current, "podmonitors", "PodMonitor", listed(true, [
    column("selector", "SELECTOR", 18, (object) => labelText(read(object.spec, "selector", "matchLabels")), true),
  ]), true),
  prom(current, "probes", "Probe", listed(true, [
    column("url", "PROBER", 18, (object) => show(read(object.spec, "prober", "url")), true),
    column("module", "MODULE", 12, (object) => show(read(object.spec, "module"))),
  ])),
  prom(current, "prometheusrules", "PrometheusRule", listed(true, [
    column("groups", "GROUPS", 6, (object) => lengthOf(read(object.spec, "groups"))),
  ]), true),
  prom(["v1beta1", "v1alpha1"], "scrapeconfigs", "ScrapeConfig", listed(true, [
    column("job", "JOB", 16, (object) => show(read(object.spec, "jobName")), true),
  ])),
  prom(["v1beta1", "v1alpha1"], "alertmanagerconfigs", "AlertmanagerConfig", listed(true, [
    column("receiver", "RECEIVER", 16, (object) => show(read(object.spec, "route", "receiver")), true),
  ])),
])

function prom(versions: readonly string[], plural: string, kind: string, columns: CustomResource["columns"], sidebar = false): CustomResource {
  return { group, versions, plural, kind, namespaced: true, columns, ...(sidebar ? { sidebar: true } : {}) }
}

function replicas(object: KubernetesObject): string {
  const ready = show(read(object.status, "availableReplicas")) || "0"
  const desired = show(read(object.spec, "replicas")) || "0"
  return `${ready}/${desired}`
}


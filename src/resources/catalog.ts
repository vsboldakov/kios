import { ageColumn, column, count, labelText, listed, nameColumn, namespaceColumn, show } from "./columns"
import { hpaReplicas, hpaTargets } from "./hpa"
import { formatAge } from "./format"
import { formatCpu, formatMemory, formatPercent } from "./quantity"
import { podColumns } from "./pods"
import type { Cell, Column, KubernetesObject, ResourceKind } from "./types"

interface Counts {
  ready: number
  desired: number
}

function replicaCounts(object: KubernetesObject): Counts {
  return {
    ready: count(object.status?.readyReplicas),
    desired: count(object.spec?.replicas),
  }
}

function daemonCounts(object: KubernetesObject): Counts {
  return {
    ready: count(object.status?.numberReady),
    desired: count(object.status?.desiredNumberScheduled),
  }
}

function statusCell(counts: Counts): Cell {
  if (counts.ready === counts.desired) return { text: "Ready", tone: "ready" }
  return { text: "Progressing", tone: "progress" }
}

function workloadColumns(readCounts: (object: KubernetesObject) => Counts): Column[] {
  return [
    namespaceColumn,
    nameColumn,
    {
      id: "ready",
      header: "READY",
      width: 7,
      cell: (object) => {
        const counts = readCounts(object)
        return { text: `${counts.ready}/${counts.desired}` }
      },
    },
    {
      id: "status",
      header: "STATUS",
      width: 12,
      cell: (object) => statusCell(readCounts(object)),
    },
    ageColumn,
  ]
}

// shortcut: a final s stays (Endpoints, PodMetrics); extend this when a kind needs Analyses
export function pluralKind(name: string): string {
  if (name.endsWith("Status")) return `${name.slice(0, -6)}Statuses`
  if (/(?:ss|x|z|ch|sh)$/.test(name)) return `${name}es`
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`
  if (name.endsWith("s")) return name
  return `${name}s`
}

// shortcut: initials already ending in S stay (FooBarSecrets → FBS); pluralize that S when such a kind is shown
export function sidebarLabel(label: string): string {
  const words = label.match(/[A-Z]+(?![a-z])|[A-Z][a-z]*/g) ?? []
  if (words.length <= 2) return label
  const initials = words.map((word) => word[0]).join("")
  if (label.endsWith("s") && !initials.endsWith("s")) return `${initials}s`
  return initials
}

const kubernetesKinds: Record<string, string> = {
  nodes: "Node",
  pods: "Pod",
  deployments: "Deployment",
  statefulsets: "StatefulSet",
  daemonsets: "DaemonSet",
  replicasets: "ReplicaSet",
  jobs: "Job",
  cronjobs: "CronJob",
  configmaps: "ConfigMap",
  secrets: "Secret",
  hpas: "HorizontalPodAutoscaler",
  pdbs: "PodDisruptionBudget",
  services: "Service",
  ingresses: "Ingress",
  networkpolicies: "NetworkPolicy",
  storageclasses: "StorageClass",
  pvcs: "PersistentVolumeClaim",
  pvs: "PersistentVolume",
  namespaces: "Namespace",
  resourcequotas: "ResourceQuota",
  limitranges: "LimitRange",
  serviceaccounts: "ServiceAccount",
  rolebindings: "RoleBinding",
  events: "Event",
}

function kindLabel(id: string): string {
  const name = kubernetesKinds[id]
  return name ? pluralKind(name) : id
}

function workload(id: string, readCounts: (object: KubernetesObject) => Counts): ResourceKind {
  return {
    id,
    label: kindLabel(id),
    resource: id,
    namespaced: true,
    group: 1,
    columns: workloadColumns(readCounts),
  }
}

function kind(
  group: number,
  id: string,
  resource: string,
  namespaced: boolean,
  columns: Column[],
): ResourceKind {
  return { id, label: kindLabel(id), resource, namespaced, group, columns }
}

function nodeStatus(object: KubernetesObject): Cell {
  const ready = object.status?.conditions?.find((condition) => condition.type === "Ready")?.status === "True"
  const text = `${ready ? "Ready" : "NotReady"}${object.spec?.unschedulable ? ",SchedulingDisabled" : ""}`
  return { text, tone: ready && !object.spec?.unschedulable ? "ready" : "progress" }
}

function nodeRoles(object: KubernetesObject): string {
  const prefix = "node-role.kubernetes.io/"
  const roles = Object.keys(object.metadata?.labels ?? {}).flatMap((key) =>
    key.startsWith(prefix) && key.length > prefix.length ? [key.slice(prefix.length)] : [],
  )
  return roles.length ? roles.join(",") : "<none>"
}

function jobStatus(object: KubernetesObject): Cell {
  if (count(object.status?.failed) > 0) return { text: "Failed", tone: "progress" }
  const completions = count(object.spec?.completions)
  if (completions > 0 && count(object.status?.succeeded) >= completions) return { text: "Complete", tone: "ready" }
  return { text: "Running", tone: "progress" }
}

const eventAge: Column = {
  id: "age",
  header: "AGE",
  width: 5,
  cell: (object, now) => ({ text: formatAge(object.lastTimestamp ?? object.metadata?.creationTimestamp, now), tone: "muted" }),
}

export function isWorkload(id: string): boolean {
  const group = findKind(id)?.group
  return group === 0 || group === 1
}

export const resourceKinds: readonly ResourceKind[] = [
  // -1 stays above pods and outside the workload groups that offer logs
  kind(-1, "nodes", "nodes", false, listed(false, [
    { id: "status", header: "STATUS", width: 8, cell: nodeStatus },
    column("roles", "ROLES", 14, nodeRoles),
    column("version", "VERSION", 10, (object) => object.status?.nodeInfo?.kubeletVersion ?? ""),
    column("cpu", "CPU", 8, (object) => formatCpu(object.usage?.cpu)),
    column("cpuPercent", "CPU%", 5, (object) => formatPercent(object.usage?.cpu, object.status?.allocatable?.cpu)),
    column("memory", "MEM", 8, (object) => formatMemory(object.usage?.memory)),
    column("memoryPercent", "MEM%", 5, (object) => formatPercent(object.usage?.memory, object.status?.allocatable?.memory)),
  ])),
  kind(0, "pods", "pods", true, podColumns),
  workload("deployments", replicaCounts),
  workload("statefulsets", replicaCounts),
  workload("daemonsets", daemonCounts),
  kind(1, "replicasets", "replicasets", true, workloadColumns(replicaCounts)),
  kind(1, "jobs", "jobs", true, listed(true, [
    column("completions", "COMPLETIONS", 11, (object) => `${count(object.status?.succeeded)}/${count(object.spec?.completions)}`),
    { id: "status", header: "STATUS", width: 12, cell: jobStatus },
  ])),
  kind(1, "cronjobs", "cronjobs", true, listed(true, [
    column("schedule", "SCHEDULE", 12, (object) => object.spec?.schedule ?? ""),
    column("suspend", "SUSPEND", 8, (object) => (object.spec?.suspend ? "True" : "False")),
  ])),
  kind(2, "configmaps", "configmaps", true, listed(true, [
    column("data", "DATA", 6, (object) => String(Object.keys(object.data ?? {}).length)),
  ])),
  kind(2, "secrets", "secrets", true, listed(true, [
    column("type", "TYPE", 16, (object) => object.type ?? ""),
    column("data", "DATA", 6, (object) => String(Object.keys(object.data ?? {}).length)),
  ])),
  kind(2, "hpas", "horizontalpodautoscalers", true, [
    namespaceColumn,
    { ...nameColumn, width: 18, grow: false },
    {
      id: "reference",
      header: "REFERENCE",
      width: 18,
      grow: true,
      cell: (object) => {
        const target = object.spec?.scaleTargetRef
        return { text: target?.name ? `${target.kind ?? ""}/${target.name}` : "" }
      },
    },
    column("targets", "TARGETS", 16, hpaTargets, true),
    column("min", "MINPODS", 7, (object) => (typeof object.spec?.minReplicas === "number" ? String(object.spec.minReplicas) : "<unset>")),
    column("max", "MAXPODS", 7, (object) => show(object.spec?.maxReplicas)),
    { id: "replicas", header: "REPLICAS", width: 8, cell: hpaReplicas },
    ageColumn,
  ]),
  kind(2, "pdbs", "poddisruptionbudgets", true, listed(true, [
    column("min", "MIN", 8, (object) => show(object.spec?.minAvailable)),
    column("allowed", "ALLOWED", 8, (object) => show(object.status?.disruptionsAllowed)),
  ])),
  kind(3, "services", "services", true, listed(true, [
    column("type", "TYPE", 12, (object) => object.spec?.type ?? ""),
    column("clusterIP", "CLUSTER-IP", 16, (object) => object.spec?.clusterIP ?? ""),
  ])),
  kind(3, "ingresses", "ingresses", true, listed(true, [
    column("class", "CLASS", 12, (object) => object.spec?.ingressClassName ?? ""),
    column("hosts", "HOSTS", 18, (object) => (object.spec?.rules ?? []).map((rule) => rule.host ?? "").filter(Boolean).join(",")),
  ])),
  kind(3, "networkpolicies", "networkpolicies", true, listed(true, [
    column("selector", "SELECTOR", 18, (object) => labelText(object.spec?.podSelector?.matchLabels)),
  ])),
  kind(4, "storageclasses", "storageclasses", false, listed(false, [
    column("provisioner", "PROVISIONER", 18, (object) => object.provisioner ?? ""),
  ])),
  kind(4, "pvcs", "persistentvolumeclaims", true, listed(true, [
    column("status", "STATUS", 12, (object) => object.status?.phase ?? ""),
    column("volume", "VOLUME", 16, (object) => object.spec?.volumeName ?? ""),
    column("capacity", "CAPACITY", 10, (object) => object.status?.capacity?.storage ?? ""),
  ])),
  kind(4, "pvs", "persistentvolumes", false, listed(false, [
    column("status", "STATUS", 12, (object) => object.status?.phase ?? ""),
    column("capacity", "CAPACITY", 10, (object) => object.spec?.capacity?.storage ?? ""),
    column("claim", "CLAIM", 18, (object) => {
      const claim = object.spec?.claimRef
      return claim?.name ? `${claim.namespace ?? ""}/${claim.name}` : ""
    }),
  ])),
  kind(5, "namespaces", "namespaces", false, listed(false, [])),
  kind(5, "resourcequotas", "resourcequotas", true, listed(true, [])),
  kind(5, "limitranges", "limitranges", true, listed(true, [])),
  kind(5, "serviceaccounts", "serviceaccounts", true, listed(true, [])),
  kind(5, "rolebindings", "rolebindings", true, listed(true, [])),
  kind(6, "events", "events", true, [
    namespaceColumn,
    column("type", "TYPE", 8, (object) => object.type ?? ""),
    column("reason", "REASON", 14, (object) => object.reason ?? ""),
    column("object", "OBJECT", 18, (object) => {
      const involved = object.involvedObject
      return involved?.name ? `${involved.kind ?? ""}/${involved.name}` : ""
    }),
    column("message", "MESSAGE", 12, (object) => object.message ?? "", true),
    eventAge,
  ]),
]

const sidebarHidden = new Set(["replicasets", "resourcequotas", "limitranges"])

export const menuKinds = resourceKinds.filter((item) => !sidebarHidden.has(item.id))

export function sidebarKinds(extra: readonly ResourceKind[]): readonly ResourceKind[] {
  return [...menuKinds, ...extra.filter((kind) => kind.sidebar)]
}

export function findKind(id: string, extra: readonly ResourceKind[] = []): ResourceKind | undefined {
  return resourceKinds.find((kind) => kind.id === id) ?? extra.find((kind) => kind.id === id)
}

const kindIds = Object.fromEntries(Object.entries(kubernetesKinds).map(([id, name]) => [name, id]))

export function kubernetesKind(id: string): string | undefined {
  return kubernetesKinds[id]
}

export function kindIdFor(kind: string): string | undefined {
  return kindIds[kind]
}

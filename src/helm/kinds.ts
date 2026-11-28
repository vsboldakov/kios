import { column, nameColumn, namespaceColumn } from "../resources/columns"
import { formatAge } from "../resources/format"
import type { Cell, Column, KubernetesObject, ResourceKind } from "../resources/types"

function statusCell(object: KubernetesObject): Cell {
  const status = object.helm?.status ?? ""
  const tone = statusTone(status)
  return tone ? { text: status, tone } : { text: status }
}

function statusTone(status: string): Cell["tone"] | undefined {
  if (status === "deployed" || status === "Ready") return "ready"
  if (status === "failed" || status === "Failed" || status === "Progressing" || status === "uninstalling" || status.startsWith("pending-")) return "progress"
  return undefined
}

const updatedColumn: Column = {
  id: "age",
  header: "AGE",
  width: 5,
  cell: (object, now) => ({ text: formatAge(object.helm?.updated, now), tone: "muted" }),
}

const chartNameColumn: Column = {
  id: "name",
  header: "NAME",
  width: 12,
  grow: true,
  cell: (object) => ({ text: object.helm?.chartName ?? object.metadata?.name ?? "" }),
}

const releaseColumns: Column[] = [
  namespaceColumn,
  nameColumn,
  { id: "status", header: "STATUS", width: 16, cell: statusCell },
  column("chart", "CHART", 18, (object) => object.helm?.chart ?? ""),
  column("app", "APP", 12, (object) => object.helm?.appVersion ?? ""),
  column("revision", "REV", 4, (object) => object.helm?.revision ?? ""),
  updatedColumn,
]

const chartColumns: Column[] = [
  chartNameColumn,
  column("version", "VERSION", 12, (object) => object.helm?.version ?? ""),
  column("app", "APP", 12, (object) => object.helm?.appVersion ?? ""),
  column("releases", "RELEASES", 8, (object) => String(object.helm?.releases ?? 0)),
  { id: "status", header: "STATUS", width: 12, cell: statusCell },
]

export const helmKinds: readonly ResourceKind[] = [
  {
    id: "charts",
    label: "Charts",
    resource: "helm-charts",
    namespaced: false,
    group: 7,
    sidebar: true,
    mark: "Helm",
    aliases: ["helm"],
    columns: chartColumns,
  },
  {
    id: "releases",
    label: "Releases",
    resource: "helm-releases",
    namespaced: true,
    group: 7,
    sidebar: true,
    mark: "Helm",
    aliases: ["helm"],
    columns: releaseColumns,
  },
]

export function isHelmKind(id: string): boolean {
  return id === "charts" || id === "releases"
}

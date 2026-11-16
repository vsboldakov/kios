import type { Cluster } from "../cluster/cluster"
import { findKind, ownedItems, podContainers, type KubernetesObject, type PodContainer } from "../resources"
import { orderedContainers } from "./containers"
import { nameMatches, rowAfterFilter } from "./filter"
import type { Session } from "./session"
import { sortByText } from "./sort"

export type VisibleRows =
  | { type: "containers"; scope: { name: string; namespace: string }; rows: readonly PodContainer[]; shown: readonly PodContainer[]; query: string }
  | { type: "resources"; rows: readonly KubernetesObject[]; shown: readonly KubernetesObject[]; query: string }

export function visibleRows(session: Session, cluster: Cluster): VisibleRows | null {
  const scope = session.activeId() === "pods" ? session.containerScope() : null
  if (scope) {
    const pod = scopedPod(session, cluster)
    const rows = pod ? podContainers(pod) : []
    const query = session.containerFilter()
    const matched = rows.filter((row) => nameMatches(row.name, query))
    return { type: "containers", scope, rows, shown: orderedContainers(matched, session.containerSort()), query }
  }
  const id = session.activeId()
  if (!id) return null
  const rows = ownedItems(cluster.snapshot(id).items, session.activeTab()?.owner ?? null)
  const query = session.filter()
  return { type: "resources", rows, shown: listedItems(session, cluster, id), query }
}

export function rowAt<T>(rows: readonly T[], index: number): T | undefined {
  if (rows.length === 0) return undefined
  return rows[Math.min(Math.max(index, 0), rows.length - 1)]
}

export function nextVisibleIndex(session: Session, cluster: Cluster, next: string): number | null {
  const visible = visibleRows(session, cluster)
  if (!visible) return null
  if (visible.type === "containers") {
    const ordered = orderedContainers(visible.rows, session.containerSort())
    return rowAfterFilter(ordered, session.containerIndex(), visible.query, next, (row) => row.name)
  }
  const id = session.activeId()
  if (!id) return null
  return rowAfterFilter(sortedObjects(session, cluster, id, visible.rows), session.rowIndex(id), visible.query, next, (row) => row.metadata?.name ?? "")
}

export function scopedPod(session: Session, cluster: Cluster): KubernetesObject | null {
  const scope = session.containerScope()
  if (!scope || session.activeId() !== "pods") return null
  return (
    cluster.snapshot("pods").items.find((item) => item.metadata?.name === scope.name && (item.metadata?.namespace ?? "") === scope.namespace) ??
    null
  )
}

export function listedItems(session: Session, cluster: Cluster, id: string): readonly KubernetesObject[] {
  const owner = session.activeId() === id ? (session.activeTab()?.owner ?? null) : null
  const items = ownedItems(cluster.snapshot(id).items, owner)
  const query = session.activeId() === id ? session.filter() : ""
  const matched = query ? items.filter((item) => nameMatches(item.metadata?.name ?? "", query)) : items
  return sortedObjects(session, cluster, id, matched)
}

function sortedObjects(session: Session, cluster: Cluster, id: string, items: readonly KubernetesObject[]): readonly KubernetesObject[] {
  const sort = session.activeId() === id ? session.sort() : null
  if (!sort) return items
  const column = findKind(id, cluster.extraKinds())?.columns.find((item) => item.id === sort.column)
  if (!column) return items
  const now = cluster.now()
  return sortByText(items, (item) => column.cell(item, now).text, sort.desc)
}

export function currentTarget(session: Session, cluster: Cluster): { kindId: string; name: string; namespace: string; object: KubernetesObject } | null {
  if (session.focus() === "detail") {
    const detail = session.detail()
    if (!detail) return null
    const object = cluster.snapshot(detail.kindId).items.find((item) => item.metadata?.name === detail.name && (item.metadata?.namespace ?? "") === detail.namespace)
    return { kindId: detail.kindId, name: detail.name, namespace: detail.namespace, object: object ?? {} }
  }
  const kindId = session.activeId()
  if (!kindId) return null
  const items = listedItems(session, cluster, kindId)
  const item = rowAt(items, session.rowIndex(kindId))
  const name = item?.metadata?.name
  if (!item || !name) return null
  return { kindId, name, namespace: item.metadata?.namespace ?? "", object: item }
}

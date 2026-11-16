import { createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { findKind, sidebarLabel } from "../resources"
import { listedItems, rowAt, visibleRows } from "../workspace/selection"
import { filteredNamespaces, namespaceLabel } from "./namespace-list"
import { theme } from "./theme"

export function StatusBar(props: { filtering: boolean }) {
  const session = useSession()
  const cluster = useCluster()

  const selection = createMemo(() => {
    const tab = session.activeTab()
    if (tab?.resource && session.focus() === "detail") {
      return tab.resource.namespace ? `${tab.resource.namespace}/${tab.resource.name}` : tab.resource.name
    }
    if (session.focus() === "namespaces") {
      const names = filteredNamespaces(cluster.namespaceLocked(), cluster.namespaces(), session.namespaceFilter())
      if (names.length === 0) return ""
      return namespaceLabel(names[Math.min(session.namespaceIndex(), names.length - 1)] ?? "")
    }
    if (session.focus() === "sidebar") return sidebarLabel(findKind(session.menu()[session.sidebarIndex()]?.id ?? "", cluster.extraKinds())?.label ?? "")
    const visible = visibleRows(session, cluster)
    if (visible?.type === "containers" && session.focus() === "list") {
      const row = rowAt(visible.shown, session.containerIndex())
      const prefix = visible.scope.namespace ? `${visible.scope.namespace}/${visible.scope.name}` : visible.scope.name
      return row ? `${prefix}/${row.name}` : prefix
    }
    const id = session.activeId()
    if (!id) return ""
    const items = listedItems(session, cluster, id)
    if (items.length === 0) return findKind(id, cluster.extraKinds())?.label ?? ""
    const item = rowAt(items, session.rowIndex(id))
    if (!item) return ""
    const namespace = item.metadata?.namespace ?? ""
    const name = item.metadata?.name ?? ""
    return namespace ? `${namespace}/${name}` : name
  })

  const logsHint = () => {
    const id = session.activeId()
    const items = id ? listedItems(session, cluster, id) : []
    return session.logTarget(items) ? "   l logs" : ""
  }

  const closeHint = () => (session.tabs().length > 1 ? "   q close" : "")

  const hints = () => {
    if (props.filtering) return "enter list   esc clear"
    const focus = session.focus()
    if (session.activeId() === "pods" && session.containerScope() && focus === "list") {
      return session.containerFilter() ? "d describe   f filter   esc clear" : "d describe   f filter   shift sort"
    }
    if (focus === "detail" && session.detail()?.logs) {
      return `d describe   c copy   f ${session.detail()?.follow ? "following" : "follow"}   [ ] tabs${closeHint()}   esc back`
    }
    if (focus === "detail") return `d describe   c copy   ← → view   esc back${logsHint()}   [ ] tabs${closeHint()}`
    if (focus === "namespaces") {
      return `enter select   f filter${session.namespaceFilter() ? "   esc clear" : ""}   [ ] tabs${closeHint()}`
    }
    if (focus === "sidebar") return `enter open   t new   [ ] tabs${closeHint()}`
    return `← parent   → child   d describe   t new   [ ] tabs${closeHint()}   e edit${logsHint()}   / menu   shift sort`
  }

  return (
    <box
      height={1}
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={theme.bg}
    >
      <text fg={theme.fg} selectable={false}>
        {selection()}
      </text>
      <text fg={theme.muted} selectable={false}>
        {hints()}
      </text>
    </box>
  )
}

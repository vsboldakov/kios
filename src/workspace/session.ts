import { createSignal } from "solid-js"
import { findKind, isWorkload, type OwnerScope, type ResourceKind } from "../resources"
import type { ColumnSort } from "./sort"

export type FocusZone = "sidebar" | "list" | "namespaces" | "detail"

export const detailTabs = ["describe", "yaml", "json"] as const

export type DetailTab = (typeof detailTabs)[number]

export interface Detail {
  kindId: string
  name: string
  namespace: string
  tab: DetailTab
  logs: boolean
  follow: boolean
}

export interface LogTarget {
  kindId: string
  name: string
  namespace: string
}

export interface ResourcePick {
  tabId: string
  kindId: string
  name: string
  namespace: string
}

export interface ContainerScope {
  name: string
  namespace: string
}

export interface WorkspaceTab {
  id: string
  kindId: string
  resource: { name: string; namespace: string; format: DetailTab; logs: boolean; follow: boolean } | null
  owner: OwnerScope | null
  containers: ContainerScope | null
  filter: string
  containerFilter: string
  sort: ColumnSort | null
  containerSort: ColumnSort | null
}

export interface Session {
  focus: () => FocusZone
  sidebarIndex: () => number
  openIds: () => readonly string[]
  tabs: () => readonly WorkspaceTab[]
  activeTab: () => WorkspaceTab | null
  activeId: () => string | null
  rowIndex: (id: string) => number
  setFocus: (zone: FocusZone) => void
  moveSidebar: (delta: number) => void
  openSidebar: () => void
  newTab: () => void
  activate: (id: string) => void
  openKind: (id: string) => void
  focusTab: (id: string) => void
  closeTab: (id?: string) => void
  cycleTab: (delta: number) => void
  showController: (kindId: string, name: string, namespace: string) => void
  showControlled: (kindId: string, owner: OwnerScope) => void
  containerScope: () => ContainerScope | null
  showContainers: (name: string, namespace: string) => void
  closeContainers: () => void
  containerIndex: () => number
  selectContainer: (index: number) => void
  pick: () => ResourcePick | null
  clearPick: () => void
  moveRow: (delta: number, count: number) => void
  selectRow: (id: string, index: number) => void
  detail: () => Detail | null
  openDetail: (kindId: string, name: string, namespace: string) => void
  openLogs: (kindId: string, name: string, namespace: string) => void
  toggleFollow: () => void
  logTarget: (items: readonly { metadata?: { name?: string; namespace?: string } }[]) => LogTarget | null
  closeDetail: () => void
  cycleDetail: (delta: number) => void
  setDetailTab: (tab: DetailTab) => void
  filter: () => string
  containerFilter: () => string
  setFilter: (query: string) => void
  setContainerFilter: (query: string) => void
  sort: () => ColumnSort | null
  containerSort: () => ColumnSort | null
  sortBy: (column: string) => void
  setActiveRow: (index: number) => void
  listToken: () => string
  menu: () => readonly { id: string }[]
  setMenu: (kinds: readonly { id: string }[]) => void
  setExtra: (kinds: readonly ResourceKind[]) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function createSession(initial: readonly { id: string }[]): Session {
  const [menu, setMenuItems] = createSignal(initial)
  const [extra, setExtra] = createSignal<readonly ResourceKind[]>([])
  const first = initial[0]?.id
  let sequence = 0
  const [focus, setFocus] = createSignal<FocusZone>(first ? "list" : "sidebar")
  const [sidebarIndex, setSidebarIndex] = createSignal(0)
  const [tabs, setTabs] = createSignal<WorkspaceTab[]>(first ? [blankTab(first)] : [])
  const [activeTabId, setActiveTabId] = createSignal<string | null>(first ? "1" : null)
  const [listToken, setListToken] = createSignal(tokenFor(tabs()[0] ?? null))
  const [rows, setRows] = createSignal<Record<string, number>>({})
  const [pick, setPick] = createSignal<ResourcePick | null>(null)

  function setMenu(next: readonly { id: string }[]) {
    setMenuItems(next)
    setSidebarIndex((index) => clamp(index, 0, Math.max(next.length - 1, 0)))
  }

  function kindIndex(id: string): number {
    return menu().findIndex((kind) => kind.id === id)
  }

  function currentTab(): WorkspaceTab | undefined {
    const id = activeTabId()
    return tabs().find((tab) => tab.id === id)
  }

  function changeFocus(zone: FocusZone) {
    if (zone !== focus()) setPick(null)
    setFocus(zone)
  }

  function focusKind(id: string) {
    const index = kindIndex(id)
    if (index >= 0) setSidebarIndex(index)
  }

  function commitTabs(update: WorkspaceTab[] | ((current: WorkspaceTab[]) => WorkspaceTab[])) {
    setTabs(update)
    setListToken(tokenFor(currentTab() ?? null))
  }

  function blankTab(kindId: string): WorkspaceTab {
    sequence += 1
    return { id: String(sequence), kindId, resource: null, owner: null, containers: null, filter: "", containerFilter: "", sort: null, containerSort: null }
  }

  function canOpen(id: string): boolean {
    return kindIndex(id) >= 0 || findKind(id, extra()) !== undefined
  }

  function retarget(id: string, owner: OwnerScope | null) {
    if (!canOpen(id)) return
    const active = activeTabId()
    commitTabs((current) =>
      current.map((tab) => {
        if (tab.id !== active) return tab
        const same = tab.kindId === id && ownerSame(tab.owner, owner)
        return {
          ...tab,
          kindId: id,
          resource: null,
          owner,
          containers: null,
          filter: same ? tab.filter : "",
          containerFilter: same ? tab.containerFilter : "",
          sort: same ? tab.sort : null,
          containerSort: null,
        }
      }),
    )
    setFocus("list")
    focusKind(id)
  }

  function focusTab(id: string) {
    setPick(null)
    const tab = tabs().find((item) => item.id === id)
    if (!tab) return
    setActiveTabId(tab.id)
    setFocus(tab.resource ? "detail" : "list")
    focusKind(tab.kindId)
    setListToken(tokenFor(tab))
  }

  function activate(id: string) {
    const tab = tabs().find((item) => item.kindId === id)
    if (tab) focusTab(tab.id)
  }

  function openKind(id: string) {
    setPick(null)
    retarget(id, null)
  }

  function openSidebar() {
    const kind = menu()[sidebarIndex()]
    if (kind) openKind(kind.id)
  }

  function newTab() {
    const current = menu()
    const kind = current[sidebarIndex()] ?? current[0]
    if (!kind) return
    const tab = blankTab(kind.id)
    commitTabs((current) => [...current, tab])
    focusTab(tab.id)
  }

  function closeTab(id?: string) {
    const current = tabs()
    if (current.length <= 1) return
    const active = activeTabId()
    const named = id ? current.filter((tab) => tab.id === id || tab.kindId === id) : current.filter((tab) => tab.id === active)
    // Two tabs can show one kind, so a kind id closes the open tab rather than the first match.
    const target = named.find((tab) => tab.id === active) ?? named[0]
    if (!target) return
    const index = current.findIndex((tab) => tab.id === target.id)
    const next = current.filter((tab) => tab.id !== target.id)
    commitTabs(next)
    if (activeTabId() === target.id) {
      const neighbor = next[Math.min(index, next.length - 1)]
      if (neighbor) focusTab(neighbor.id)
    }
  }

  function cycleTab(delta: number) {
    const current = tabs()
    if (current.length === 0) return
    const index = current.findIndex((tab) => tab.id === activeTabId())
    const start = index < 0 ? 0 : index
    const next = current[(start + delta + current.length) % current.length]
    if (next) focusTab(next.id)
  }

  function showController(kindId: string, name: string, namespace: string) {
    const tabId = activeTabId()
    if (!tabId || !canOpen(kindId)) return
    retarget(kindId, null)
    setPick({ tabId, kindId, name, namespace })
  }

  function showControlled(kindId: string, owner: OwnerScope) {
    setPick(null)
    retarget(kindId, owner)
    const tab = currentTab()
    if (!tab || tab.kindId !== kindId) return
    setRows((current) => ({ ...current, [listRow(tab)]: 0 }))
  }

  function moveSidebar(delta: number) {
    const count = menu().length
    if (count === 0) return
    setSidebarIndex((index) => clamp(index + delta, 0, count - 1))
  }

  function listRow(tab: WorkspaceTab): string {
    return `${tab.id}:${tab.kindId}`
  }

  function containerRow(tab: WorkspaceTab): string {
    return `${tab.id}:${tab.containers?.namespace ?? ""}/${tab.containers?.name ?? ""}`
  }

  function rowKey(): string | undefined {
    const tab = currentTab()
    if (!tab) return undefined
    if (tab.containers) return containerRow(tab)
    return listRow(tab)
  }

  function indexFor(id: string): number {
    const tab = currentTab()
    if (!tab || tab.kindId !== id) return 0
    return rows()[listRow(tab)] ?? 0
  }

  function showContainers(name: string, namespace: string) {
    const active = activeTabId()
    const previous = currentTab()?.containers
    const switching = Boolean(previous && (previous.name !== name || previous.namespace !== namespace))
    setPick(null)
    commitTabs((current) =>
      current.map((tab) =>
        tab.id === active
          ? {
              ...tab,
              resource: null,
              containers: switching || !previous ? { name, namespace } : previous,
              containerFilter: switching ? "" : tab.containerFilter,
              containerSort: switching ? null : tab.containerSort,
            }
          : tab,
      ),
    )
    const opened = currentTab()
    if (opened?.containers) setRows((current) => ({ ...current, [containerRow(opened)]: 0 }))
    setFocus("list")
  }

  function closeContainers() {
    const active = activeTabId()
    if (!currentTab()?.containers) return
    commitTabs((current) => current.map((tab) => (tab.id === active ? { ...tab, containers: null } : tab)))
    setFocus("list")
  }

  function selectContainer(index: number) {
    const tab = currentTab()
    if (!tab?.containers) return
    setPick(null)
    setFocus("list")
    setRows((current) => ({ ...current, [containerRow(tab)]: Math.max(0, index) }))
  }

  function moveRow(delta: number, count: number) {
    setPick(null)
    const id = rowKey()
    if (!id || count <= 0) return
    setRows((current) => {
      const previous = current[id] ?? 0
      const next = clamp(previous + delta, 0, count - 1)
      if (next === previous) return current
      return { ...current, [id]: next }
    })
  }

  function openDetail(kindId: string, name: string, namespace: string) {
    setPick(null)
    const active = activeTabId()
    commitTabs((current) =>
      current.map((tab) => (tab.id === active ? { ...tab, kindId, resource: { name, namespace, format: "describe", logs: false, follow: false } } : tab)),
    )
    setFocus("detail")
    focusKind(kindId)
  }

  function openLogs(kindId: string, name: string, namespace: string) {
    setPick(null)
    const active = activeTabId()
    commitTabs((current) =>
      current.map((tab) =>
        tab.id === active ? { ...tab, kindId, resource: { name, namespace, format: tab.resource?.format ?? "describe", logs: true, follow: false } } : tab,
      ),
    )
    setFocus("detail")
    focusKind(kindId)
  }

  function toggleFollow() {
    const active = activeTabId()
    commitTabs((current) =>
      current.map((tab) =>
        tab.id === active && tab.resource?.logs ? { ...tab, resource: { ...tab.resource, follow: !tab.resource.follow } } : tab,
      ),
    )
  }

  function logTarget(items: readonly { metadata?: { name?: string; namespace?: string } }[]): LogTarget | null {
    if (focus() === "detail") {
      const current = detail()
      if (!current || current.logs || !isWorkload(current.kindId)) return null
      return { kindId: current.kindId, name: current.name, namespace: current.namespace }
    }
    if (focus() !== "list") return null
    const id = currentTab()?.kindId
    if (!id || !isWorkload(id) || items.length === 0) return null
    const item = items[Math.min(indexFor(id), items.length - 1)]
    const name = item?.metadata?.name
    if (!name) return null
    return { kindId: id, name, namespace: item.metadata?.namespace ?? "" }
  }

  function updateFormat(format: DetailTab) {
    const id = activeTabId()
    commitTabs((current) =>
      current.map((tab) =>
        tab.id === id && tab.resource && tab.resource.format !== format
          ? { ...tab, resource: { ...tab.resource, format } }
          : tab,
      ),
    )
  }

  function closeDetail() {
    const active = activeTabId()
    if (!currentTab()?.resource) return
    commitTabs((current) => current.map((tab) => (tab.id === active ? { ...tab, resource: null } : tab)))
    setFocus("list")
  }

  function cycleDetail(delta: number) {
    const resource = currentTab()?.resource
    if (!resource || resource.logs) return
    const index = detailTabs.indexOf(resource.format)
    const format = detailTabs[(index + delta + detailTabs.length) % detailTabs.length] ?? resource.format
    updateFormat(format)
  }

  function setDetailTab(tab: DetailTab) {
    updateFormat(tab)
  }

  function selectRow(id: string, index: number) {
    setPick(null)
    const tab = currentTab()
    retarget(id, tab?.kindId === id ? (tab.owner ?? null) : null)
    const next = currentTab()
    if (!next || next.kindId !== id) return
    setRows((current) => ({ ...current, [listRow(next)]: Math.max(0, index) }))
  }

  function setFilter(query: string) {
    const active = activeTabId()
    commitTabs((current) => {
      const tab = current.find((item) => item.id === active)
      if (!tab || tab.filter === query) return current
      return current.map((item) => (item.id === active ? { ...item, filter: query } : item))
    })
  }

  function setContainerFilter(query: string) {
    const active = activeTabId()
    commitTabs((current) => {
      const tab = current.find((item) => item.id === active)
      if (!tab || tab.containerFilter === query) return current
      return current.map((item) => (item.id === active ? { ...item, containerFilter: query } : item))
    })
  }

  function sortBy(column: string) {
    const active = activeTabId()
    const containers = Boolean(currentTab()?.containers)
    commitTabs((current) =>
      current.map((tab) => {
        if (tab.id !== active) return tab
        if (containers) return { ...tab, containerSort: nextSort(tab.containerSort, column) }
        return { ...tab, sort: nextSort(tab.sort, column) }
      }),
    )
  }

  function setActiveRow(index: number) {
    const id = rowKey()
    if (!id) return
    const next = Math.max(0, index)
    setRows((current) => ((current[id] ?? 0) === next ? current : { ...current, [id]: next }))
  }

  function detail(): Detail | null {
    const tab = currentTab()
    if (!tab?.resource) return null
    return {
      kindId: tab.kindId,
      name: tab.resource.name,
      namespace: tab.resource.namespace,
      tab: tab.resource.format,
      logs: tab.resource.logs,
      follow: tab.resource.follow,
    }
  }

  return {
    focus,
    sidebarIndex,
    openIds: () => tabs().map((tab) => tab.kindId),
    tabs,
    activeTab: () => currentTab() ?? null,
    activeId: () => currentTab()?.kindId ?? null,
    rowIndex: indexFor,
    setFocus: changeFocus,
    moveSidebar,
    openSidebar,
    newTab,
    activate,
    openKind,
    focusTab,
    closeTab,
    cycleTab,
    showController,
    showControlled,
    containerScope: () => currentTab()?.containers ?? null,
    showContainers,
    closeContainers,
    containerIndex: () => {
      const tab = currentTab()
      if (!tab?.containers) return 0
      return rows()[containerRow(tab)] ?? 0
    },
    selectContainer,
    pick,
    clearPick: () => setPick(null),
    moveRow,
    selectRow,
    detail,
    openDetail,
    openLogs,
    toggleFollow,
    logTarget,
    closeDetail,
    cycleDetail,
    setDetailTab,
    filter: () => currentTab()?.filter ?? "",
    containerFilter: () => currentTab()?.containerFilter ?? "",
    setFilter,
    setContainerFilter,
    sort: () => currentTab()?.sort ?? null,
    containerSort: () => currentTab()?.containerSort ?? null,
    sortBy,
    setActiveRow,
    listToken,
    menu,
    setMenu,
    setExtra,
  }
}

function nextSort(previous: ColumnSort | null, column: string): ColumnSort {
  if (previous?.column === column) return { column, desc: !previous.desc }
  return { column, desc: false }
}

function tokenFor(tab: WorkspaceTab | null): string {
  if (!tab) return ""
  const owner = tab.owner
  const containers = tab.containers
  return [tab.id, tab.kindId, owner ? `${owner.uid}:${owner.kind}:${owner.namespace}/${owner.name}` : "", containers ? `${containers.namespace}/${containers.name}` : ""].join("|")
}

function ownerSame(left: OwnerScope | null, right: OwnerScope | null): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return left.uid === right.uid && left.kind === right.kind && left.name === right.name && left.namespace === right.namespace
}

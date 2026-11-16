import { createHostClipboard, type KeyEvent } from "@opentui/core"
import { onBlur, useKeyboard, useRenderer, useSelectionHandler } from "@opentui/solid"
import { Show, createEffect, createMemo, createSignal, on } from "solid-js"
import { ActionBar } from "./screen/action-bar"
import { ConfirmDialog } from "./screen/confirm-dialog"
import { scrollDetail } from "./screen/detail-scroll"
import { LogView } from "./screen/log-view"
import { NamespaceList, namespaceOptions } from "./screen/namespace-list"
import { ContainerList, containerColumns, orderedContainers } from "./screen/container-list"
import { ResourceList } from "./screen/resource-list"
import { ResourceView } from "./screen/resource-view"
import { Sidebar } from "./screen/sidebar"
import { ListFilter } from "./screen/list-filter"
import { SlashMenu } from "./screen/slash-menu"
import { StatusBar } from "./screen/status-bar"
import { WorkspaceTabs } from "./screen/workspace-tabs"
import type { ResourceSnapshot } from "./cluster/cluster"
import { useCluster, useSession } from "./context"
import { createEditMode } from "./workspace/edit"
import { rowAfterFilter } from "./workspace/filter"
import { runKey } from "./workspace/input"
import { controlledKind, controllerOf, findKind, formatAge, kindIdFor, kubernetesKind } from "./resources"
import { currentTarget, listedItems, visibleRows } from "./workspace/selection"
import { columnLetters } from "./workspace/sort"
import { splitBorder, theme } from "./screen/theme"

export function Shell() {
  const session = useSession()
  const cluster = useCluster()
  const renderer = useRenderer()
  const [filtering, setFiltering] = createSignal(false)
  const shifts = new Set<string>()
  const [shiftHeld, setShiftHeld] = createSignal(false)
  useKeyboard((key) => {
    if (key.name !== "leftshift" && key.name !== "rightshift") return
    if (key.eventType === "release") shifts.delete(key.name)
    else shifts.add(key.name)
    setShiftHeld(shifts.size > 0)
  }, { release: true })
  onBlur(() => {
    shifts.clear()
    setShiftHeld(false)
  })
  createEffect(
    on(
      () => [session.focus(), session.listToken()] as const,
      (next, prev) => {
        if (!prev) return
        const [focus, token] = next
        const [previousFocus, previousToken] = prev
        if (focus !== "list" || token !== previousToken) setFiltering(false)
      },
      { defer: true },
    ),
  )
  let clipboard: ReturnType<typeof createHostClipboard> | undefined
  const copyText = (text: string) => {
    if (renderer.capabilities?.osc52_support === "supported") {
      try {
        renderer.copyToClipboardOSC52(text)
      } catch {
        // A refused write must not take down the session.
      }
    }
    try {
      clipboard ??= createHostClipboard()
      void clipboard.writeText(text).catch(() => {})
    } catch {
      // Host clipboard is unavailable in this process.
    }
  }
  useSelectionHandler((selection) => {
    // A plain click starts a zero-width selection. Word and line clicks still copy.
    if (selection.isStart && selection.behavior === "cell") return
    const text = selection.getSelectedText()
    if (!text) return
    copyText(text)
  })
  const edit = createEditMode({
    session,
    cluster,
    suspend: () => renderer.suspend(),
    resume: () => renderer.resume(),
  })
  const activeKind = createMemo(() => {
    const id = session.activeId()
    return id ? findKind(id, cluster.extraKinds()) : undefined
  })
  const viewing = () => (session.focus() === "detail" ? session.detail() : null)
  const containerScope = () => (session.activeId() === "pods" ? session.containerScope() : null)
  const mark = createMemo(() => {
    if (viewing()) return null
    const kind = activeKind()
    if (!kind) return null
    return listFreshness(cluster.snapshot(kind.id), cluster.now())
  })
  const summary = createMemo(() => {
    if (viewing()) return ""
    const visible = visibleRows(session, cluster)
    if (!visible) return ""
    if (visible.type === "containers") {
      const count = visible.shown.length
      const total = visible.rows.length
      return visible.query ? `${count}/${total} containers in ${visible.scope.name}` : `${count} containers in ${visible.scope.name}`
    }
    const kind = activeKind()
    if (!kind) return ""
    const current = cluster.snapshot(kind.id)
    if (current.status === "loading" && current.items.length === 0) return "loading"
    if (current.status === "error" && current.items.length === 0) return "error"
    const owner = session.activeTab()?.owner
    const count = visible.shown.length
    const total = visible.rows.length
    if (visible.query) return owner ? `${count}/${total} owned by ${owner.name}` : `${count}/${total}`
    return owner ? `${count} owned by ${owner.name}` : String(count)
  })
  const target = createMemo(() => currentTarget(session, cluster))
  let slashKey = (_key: KeyEvent): boolean => false

  const showOwner = () => {
    if (session.focus() !== "detail" && containerScope()) {
      session.closeContainers()
      return
    }
    const current = target()
    if (!current) return
    const owner = controllerOf(current.object)
    if (!owner) return
    const kindId = kindIdFor(owner.kind)
    if (!kindId) return
    const namespace = findKind(kindId, cluster.extraKinds())?.namespaced ? current.namespace : ""
    session.showController(kindId, owner.name, namespace)
    const index = listedItems(session, cluster, kindId).findIndex((item) => item.metadata?.name === owner.name && (item.metadata?.namespace ?? "") === namespace)
    if (index >= 0) session.selectRow(kindId, index)
  }

  const showControlled = () => {
    const current = target()
    if (!current) return
    if (current.kindId === "pods" && (session.focus() === "detail" || !session.containerScope())) {
      session.showContainers(current.name, current.namespace)
      return
    }
    if (session.containerScope()) return
    const kindId = controlledKind(current.kindId)
    const kind = kubernetesKind(current.kindId)
    if (!kindId || !kind) return
    session.showControlled(kindId, {
      uid: current.object.metadata?.uid ?? "",
      kind,
      name: current.name,
      namespace: current.namespace,
    })
  }

  createEffect(() => {
    const wanted = session.pick()
    if (!wanted || session.activeTab()?.id !== wanted.tabId || session.activeId() !== wanted.kindId) return
    const current = cluster.snapshot(wanted.kindId)
    if (current.status === "loading" && current.items.length === 0) return
    const index = listedItems(session, cluster, wanted.kindId).findIndex((item) => item.metadata?.name === wanted.name && (item.metadata?.namespace ?? "") === wanted.namespace)
    if (index < 0) return
    session.clearPick()
    session.selectRow(wanted.kindId, index)
  })

  const applyFilter = (next: string) => {
    const visible = visibleRows(session, cluster)
    if (!visible) return
    if (visible.type === "containers") {
      const index = rowAfterFilter(visible.rows, session.containerIndex(), visible.query, next, (row) => row.name)
      session.setContainerFilter(next)
      session.setActiveRow(index)
      return
    }
    const id = session.activeId()
    if (!id) return
    const index = rowAfterFilter(visible.rows, session.rowIndex(id), visible.query, next, (row) => row.metadata?.name ?? "")
    session.setFilter(next)
    session.setActiveRow(index)
  }

  const columnForLetter = (letter: string): string | null => {
    const headers = containerScope() ? containerColumns.map((column) => column.header) : activeKind()?.columns.map((column) => column.header)
    const ids = containerScope() ? containerColumns.map((column) => column.id) : activeKind()?.columns.map((column) => column.id)
    if (!headers || !ids) return null
    const index = columnLetters(headers).indexOf(letter)
    if (index < 0) return null
    return ids[index] ?? null
  }

  const sortByColumn = (column: string) => {
    const visible = visibleRows(session, cluster)
    if (!visible) return
    if (visible.type === "containers") {
      const ordered = orderedContainers(visible.shown, session.containerSort())
      const selected = ordered[Math.min(session.containerIndex(), Math.max(ordered.length - 1, 0))]
      session.sortBy(column)
      const next = visibleRows(session, cluster)
      if (!selected || next?.type !== "containers") return
      const found = orderedContainers(next.shown, session.containerSort()).findIndex((row) => row.name === selected.name && row.type === selected.type)
      if (found >= 0) session.setActiveRow(found)
      return
    }
    const id = session.activeId()
    if (!id) return
    const selected = visible.shown[Math.min(session.rowIndex(id), Math.max(visible.shown.length - 1, 0))]
    session.sortBy(column)
    const next = visibleRows(session, cluster)
    if (!selected || next?.type !== "resources") return
    const found = next.shown.indexOf(selected)
    if (found >= 0) session.setActiveRow(found)
  }

  useKeyboard((key) => {
    if (renderer.getSelection()?.getSelectedText()) renderer.clearSelection()
    // ConfirmDialog mounts later and owns this key. Stopping here would swallow it.
    if (edit.pending() || edit.prompt()) {
      edit.handleKey(key)
      return
    }
    // The focused input reads the key after this handler. stopPropagation would swallow it.
    if (filtering() && session.focus() === "list") {
      if (!key.ctrl && !key.meta && !key.super && key.name === "escape") {
        applyFilter("")
        setFiltering(false)
      }
      return
    }
    if (slashKey(key)) {
      key.stopPropagation()
      return
    }
    if (key.name === "leftshift" || key.name === "rightshift") return
    if (session.focus() === "list" && shiftHeld() && !key.ctrl && !key.meta && !key.super && !key.repeated && key.name.length === 1) {
      const column = columnForLetter(key.name)
      if (column) sortByColumn(column)
      return
    }
    if (edit.handleKey(key)) return
    if (key.name === "f" && !key.ctrl && !key.meta && !key.super && session.focus() === "list") key.preventDefault()
    if (key.name === "escape" && session.focus() === "list" && (containerScope() ? session.containerFilter() : session.filter())) {
      applyFilter("")
      return
    }
    runKey(key, {
      focus: session.focus,
      toggleFocus: () => {
        const main = session.detail() ? "detail" : "list"
        session.setFocus(session.focus() === main ? "sidebar" : main)
      },
      toggleNamespaces: () => {
        if (session.focus() === "namespaces") {
          session.setFocus("list")
          return
        }
        const names = namespaceOptions(cluster.namespaceLocked(), cluster.namespaces())
        session.setNamespaceIndex(Math.max(0, names.indexOf(cluster.namespace())))
        session.setFocus("namespaces")
      },
      closeNamespaces: () => session.setFocus("list"),
      moveNamespace: (delta) => {
        session.moveNamespace(delta, namespaceOptions(cluster.namespaceLocked(), cluster.namespaces()).length)
      },
      openNamespace: () => {
        const names = namespaceOptions(cluster.namespaceLocked(), cluster.namespaces())
        const index = Math.min(session.namespaceIndex(), Math.max(names.length - 1, 0))
        cluster.setNamespace(names[index] ?? "")
        session.setFocus("list")
      },
      moveSidebar: session.moveSidebar,
      openSidebar: session.openSidebar,
      moveRow: (delta) => {
        session.moveRow(delta, visibleRows(session, cluster)?.shown.length ?? 0)
      },
      cycleTab: session.cycleTab,
      showOwner,
      showControlled,
      closeTab: () => session.closeTab(),
      openDetail: () => {
        if (session.focus() === "detail") {
          const current = session.detail()
          if (current) {
            session.openDetail(current.kindId, current.name, current.namespace)
            return
          }
        }
        const scope = containerScope()
        if (scope) {
          session.openDetail("pods", scope.name, scope.namespace)
          return
        }
        const id = session.activeId()
        if (!id) return
        const items = listedItems(session, cluster, id)
        const item = items[Math.min(session.rowIndex(id), Math.max(items.length - 1, 0))]
        const name = item?.metadata?.name
        if (!name) return
        session.openDetail(id, name, item.metadata?.namespace ?? "")
      },
      closeDetail: session.closeDetail,
      formatView: () => {
        const current = session.detail()
        return Boolean(current && !current.logs)
      },
      cycleDetail: session.cycleDetail,
      scrollDetail,
      openNewTab: session.newTab,
      openLogs: () => {
        const visible = visibleRows(session, cluster)
        if (visible?.type === "containers" && session.focus() === "list") {
          session.openLogs("pods", visible.scope.name, visible.scope.namespace)
          return
        }
        const rows = visible?.type === "resources" ? visible.shown : []
        const target = session.logTarget(rows)
        if (target) session.openLogs(target.kindId, target.name, target.namespace)
      },
      toggleFollow: session.toggleFollow,
      startFilter: () => setFiltering(true),
    })
  })

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.bg}>
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.bg}
      >
        <box flexDirection="row" flexShrink={1}>
          <text fg={theme.primary} selectable={false}>
            kios
          </text>
          <text fg={theme.muted} selectable={false}>
            {`  ${cluster.contextName()}`}
          </text>
        </box>
        <EditToggle on={edit.editing()} onToggle={edit.toggle} />
      </box>
      <box flexGrow={1} flexDirection="row" minHeight={0} backgroundColor={theme.bg}>
        <Sidebar />
        <box
          flexGrow={1}
          flexDirection="column"
          minWidth={0}
          minHeight={0}
          border={["left"]}
          borderColor={session.focus() === "list" || session.focus() === "detail" ? theme.primary : theme.border}
          customBorderChars={splitBorder}
          backgroundColor={theme.panel}
        >
          <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingRight={1}>
            <WorkspaceTabs />
            <text selectable={false}>
              <span style={{ fg: theme.muted }}>{summary()}</span>
              <span style={{ fg: mark()?.fg ?? theme.muted }}>{mark()?.text ?? ""}</span>
            </text>
          </box>
          <Show when={!viewing() && activeKind()}>
            <ListFilter
              query={containerScope() ? session.containerFilter() : session.filter()}
              editing={filtering()}
              onInput={applyFilter}
              onSubmit={() => setFiltering(false)}
              onEdit={() => {
                session.setFocus("list")
                setFiltering(true)
              }}
            />
          </Show>
          <Show
            when={viewing()}
            fallback={
              <Show when={activeKind()} keyed fallback={<EmptyMain />}>
                {(kind) => (
                  <Show when={containerScope()} fallback={<ResourceList kind={kind} letters={shiftHeld() && session.focus() === "list" && !filtering()} />}>
                    {(scope) => <ContainerList name={scope().name} namespace={scope().namespace} letters={shiftHeld() && session.focus() === "list" && !filtering()} />}
                  </Show>
                )}
              </Show>
            }
          >
            {(detail) => (
              <Show
                when={detail().logs}
                fallback={
                  <ResourceView kindId={detail().kindId} name={detail().name} namespace={detail().namespace} tab={detail().tab} />
                }
              >
                <LogView kindId={detail().kindId} name={detail().name} namespace={detail().namespace} />
              </Show>
            )}
          </Show>
        </box>
        <NamespaceList />
      </box>
      <Show when={edit.editing() && edit.actions().length > 0}>
        <ActionBar
          actions={edit.actions()}
          notice={edit.notice()}
          busy={edit.busy()}
          prompt={edit.prompt()}
          onPrompt={edit.submitPrompt}
        />
      </Show>
      <StatusBar filtering={filtering()} />
      <SlashMenu
        register={(handle) => {
          slashKey = handle
        }}
        editing={edit.editing()}
        editActions={edit.actions()}
        onEdit={edit.run}
      />
      <Show when={edit.pending()}>
        {(item) => (
          <ConfirmDialog title={item().title} message={item().line} onConfirm={edit.accept} onCancel={edit.cancel} onCopy={copyText} />
        )}
      </Show>
    </box>
  )
}

function EditToggle(props: { on: boolean; onToggle: () => void }) {
  return (
    <box
      height={1}
      flexShrink={0}
      onMouseDown={(event) => {
        event.stopPropagation()
        props.onToggle()
      }}
    >
      <text selectable={false}>
        <span style={{ fg: theme.muted }}>e </span>
        <span style={{ fg: props.on ? theme.error : theme.fg }}>
          edit mode <b>{props.on ? "on" : "off"}</b>
        </span>
      </text>
    </box>
  )
}

export function listFreshness(snapshot: ResourceSnapshot, now: number): { text: string; fg: string } | null {
  if (snapshot.status === "loading" && snapshot.items.length === 0) return null
  if (snapshot.status === "error" && snapshot.items.length === 0) return null
  const updatedAt = snapshot.updatedAt
  const fresh = updatedAt != null && now - updatedAt <= 30_000
  const age = updatedAt == null ? "" : formatAge(new Date(updatedAt).toISOString(), now)
  if (snapshot.cached && age) return { text: `  cached ${age}`, fg: theme.progress }
  if (snapshot.status === "error") return { text: "  stale", fg: theme.error }
  if (snapshot.live && fresh) return { text: "  live", fg: theme.dot }
  if (!age || updatedAt == null) return null
  return { text: `  ${age}`, fg: fresh ? theme.muted : theme.progress }
}

function EmptyMain() {
  return (
    <box flexGrow={1} padding={1}>
      <text fg={theme.muted} selectable={false}>
        Select a kind from the sidebar
      </text>
    </box>
  )
}

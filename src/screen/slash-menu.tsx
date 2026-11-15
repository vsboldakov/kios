import { RGBA, type KeyEvent } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { Show, createMemo, createSignal, onMount } from "solid-js"
import { useCluster, useSession } from "../context"
import { Keyed } from "./keyed"
import { isWorkload, resourceKinds } from "../resources"
import { currentTarget, listedItems } from "../workspace/selection"
import { matchSlash, slashItems, type SlashItem } from "../workspace/slash"
import { theme } from "./theme"

// shortcut: 8 rows, raise it when the menu should show a longer page
const windowSize = 8
const submit = new Set(["return", "enter", "linefeed", "tab"])

export function SlashMenu(props: {
  register: (handle: (key: KeyEvent) => boolean) => void
  editing: boolean
  editActions: readonly { id: string; label: string }[]
  onEdit: (id: string) => void
}) {
  const session = useSession()
  const cluster = useCluster()
  const dimensions = useTerminalDimensions()
  const [shown, setShown] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [index, setIndex] = createSignal(0)
  const actions = createMemo(() => {
    const current = currentTarget(session, cluster)
    if (!current) return []
    const read = [
      { id: "describe", label: "Describe" },
      { id: "yaml", label: "YAML" },
      { id: "json", label: "JSON" },
    ]
    if (isWorkload(current.kindId)) read.push({ id: "logs", label: "Logs" })
    if (!props.editing) return read
    return [...read, ...props.editActions]
  })
  const resources = createMemo(() => {
    const id = session.activeId()
    if (!id) return []
    return listedItems(session, cluster, id).flatMap((object) => {
      const name = object.metadata?.name
      if (!name) return []
      return [{ name, namespace: object.metadata?.namespace ?? "" }]
    })
  })
  const kinds = createMemo(() => [...resourceKinds, ...cluster.extraKinds()])
  const items = createMemo(() =>
    slashItems({
      kinds: kinds(),
      actions: actions(),
      namespaces: cluster.namespaces(),
      resources: resources(),
      qualifyNames: cluster.namespace() === "",
      includeAll: !cluster.namespaceLocked(),
    }),
  )
  const matches = createMemo(() => matchSlash(items(), query()))
  const page = createMemo(() => {
    const all = matches()
    const count = all.length
    if (count === 0) return { cursor: 0, rows: [] as { item: SlashItem; index: number }[] }
    const cursor = Math.min(index(), count - 1)
    const start = Math.max(0, Math.min(cursor - windowSize + 1, count - windowSize))
    return {
      cursor,
      rows: all.slice(start, start + windowSize).map((item, offset) => ({ item, index: start + offset })),
    }
  })
  const panelWidth = () => Math.min(64, Math.max(36, dimensions().width - 4))
  const panelHeight = () => Math.min(dimensions().height - 2, Math.max(page().rows.length, 1) + 8)

  const setFilter = (next: string) => {
    setQuery(next)
    setIndex(0)
  }

  const move = (delta: number) => {
    const count = matches().length
    if (count === 0) return
    const cursor = Math.min(index(), count - 1)
    setIndex((cursor + delta + count) % count)
  }

  const choose = (item: SlashItem) => {
    setShown(false)
    if (item.type === "kind") {
      session.openKind(item.value)
      return
    }
    if (item.type === "namespace") {
      cluster.setNamespace(item.value)
      return
    }
    if (item.type === "resource") {
      const kindId = session.activeId()
      if (!kindId) return
      const slash = item.value.indexOf("/")
      const namespace = item.value.slice(0, slash)
      const name = item.value.slice(slash + 1)
      const index = listedItems(session, cluster, kindId).findIndex(
        (object) => object.metadata?.name === name && (object.metadata?.namespace ?? "") === namespace,
      )
      if (index < 0) return
      session.selectRow(kindId, index)
      return
    }
    if (item.value === "logs") {
      const current = currentTarget(session, cluster)
      if (!current) return
      session.openLogs(current.kindId, current.name, current.namespace)
      return
    }
    if (item.value === "describe" || item.value === "yaml" || item.value === "json") {
      const current = currentTarget(session, cluster)
      if (!current) return
      session.openDetail(current.kindId, current.name, current.namespace)
      if (item.value !== "describe") session.setDetailTab(item.value)
      return
    }
    props.onEdit(item.value)
  }

  const accept = () => {
    const all = matches()
    const item = all[Math.min(index(), all.length - 1)]
    if (item) choose(item)
  }

  onMount(() => props.register((key) => {
    if (!shown()) {
      if (key.ctrl || key.meta || key.super || key.repeated || key.name !== "/") return false
      setQuery("")
      setIndex(0)
      setShown(true)
      return true
    }
    if (key.name === "escape") {
      setShown(false)
      return true
    }
    if (key.name === "up") {
      move(-1)
      return true
    }
    if (key.name === "down") {
      move(1)
      return true
    }
    if (key.name === "backspace") {
      if (!query()) {
        setShown(false)
        return true
      }
      setFilter(query().slice(0, -1))
      return true
    }
    if (submit.has(key.name)) {
      accept()
      return true
    }
    const char = key.name === "space" ? " " : key.name
    if (key.ctrl || key.meta || key.super || char.length !== 1 || char < " " || char > "~" || char === "/") return true
    setFilter(query() + char)
    return true
  }))

  return (
    <Show when={shown()}>
      <box
        position="absolute"
        left={0}
        top={0}
        width={dimensions().width}
        height={dimensions().height}
        alignItems="center"
        paddingTop={Math.max(0, Math.floor((dimensions().height - panelHeight()) / 2))}
        backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
        zIndex={2}
        onMouseUp={() => setShown(false)}
      >
        <box
          width={panelWidth()}
          height={panelHeight()}
          flexDirection="column"
          backgroundColor={theme.element}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          <box height={1} />
          <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
            <text fg={theme.fg} selectable={false}>
              Commands
            </text>
            <text fg={theme.muted} selectable={false}>
              esc
            </text>
          </box>
          <box height={1} />
          <box height={1} flexShrink={0} paddingLeft={2} paddingRight={2}>
            <Show
              when={query()}
              fallback={
                <text selectable={false}>
                  <span style={{ bg: theme.primary, fg: theme.selected }}>S</span>
                  <span style={{ fg: theme.muted }}>earch</span>
                </text>
              }
            >
              <text selectable={false}>
                <span style={{ fg: theme.fg }}>{query()}</span>
                <span style={{ bg: theme.primary, fg: theme.selected }}> </span>
              </text>
            </Show>
          </box>
          <box height={1} />
          <Show
            when={page().rows.length > 0}
            fallback={
              <box height={1} paddingLeft={2}>
                <text fg={theme.muted} selectable={false}>
                  no matches
                </text>
              </box>
            }
          >
            <Keyed each={page().rows} by={(row) => `${row.item.type}:${row.item.value}`}>
              {(row) => (
                <SlashRow
                  item={row().item}
                  width={panelWidth()}
                  selected={row().index === page().cursor}
                  onPick={() => choose(row().item)}
                />
              )}
            </Keyed>
          </Show>
          <box height={1} />
          <box height={1} flexShrink={0} paddingLeft={2} paddingRight={2}>
            <text selectable={false}>
              <span style={{ fg: theme.fg }}>enter</span>
              <span style={{ fg: theme.muted }}> open    </span>
              <span style={{ fg: theme.fg }}>↑↓</span>
              <span style={{ fg: theme.muted }}> move</span>
            </text>
          </box>
          <box height={1} />
        </box>
      </box>
    </Show>
  )
}

function SlashRow(props: { item: SlashItem; width: number; selected: boolean; onPick: () => void }) {
  const line = createMemo(() => {
    const room = Math.max(1, props.width - props.item.type.length - 7)
    const mark = props.selected ? "● " : "  "
    const version = props.item.apiVersion ?? ""
    const name = props.item.label.length > room ? props.item.label.slice(0, room) : props.item.label
    if (!version || name.length + 2 >= room) return { mark, name, version: "" }
    const versionRoom = room - name.length - 2
    return { mark, name, version: version.length > versionRoom ? version.slice(0, versionRoom) : version }
  })

  return (
    <box
      height={1}
      width="100%"
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={2}
      paddingRight={2}
      backgroundColor={props.selected ? theme.primary : theme.element}
      onMouseDown={(event) => {
        event.stopPropagation()
        props.onPick()
      }}
    >
      <text selectable={false}>
        <span style={{ fg: props.selected ? theme.selected : theme.fg }}>{line().mark}{line().name}</span>
        <Show when={line().version}>
          <span style={{ fg: props.selected ? theme.selected : theme.muted }}>{`  ${line().version}`}</span>
        </Show>
      </text>
      <text fg={props.selected ? theme.selected : theme.muted} selectable={false}>
        {props.item.type}
      </text>
    </box>
  )
}

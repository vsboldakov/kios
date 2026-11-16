import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { Show, createEffect, createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { Keyed } from "./keyed"
import { columnWidth, objectId, ownedItems, resolveWidths, type KubernetesObject, type ResourceKind } from "../resources"
import { listedItems } from "../workspace/selection"
import { columnHeader, columnLetters } from "../workspace/sort"
import { Cells } from "./cells"
import { listGutter, listWidth, theme } from "./theme"

export function ResourceList(props: { kind: ResourceKind; letters: boolean }) {
  const session = useSession()
  const cluster = useCluster()
  const dimensions = useTerminalDimensions()
  let scroller: ScrollBoxRenderable | undefined

  const snapshot = createMemo(() => cluster.snapshot(props.kind.id))
  const owned = createMemo(() => ownedItems(snapshot().items, session.activeTab()?.owner ?? null))
  const items = createMemo(() => listedItems(session, cluster, props.kind.id))
  const widths = createMemo(() => {
    const columns = props.kind.columns.map((column) =>
      column.id === "containers" ? { ...column, width: columnWidth(column, owned(), 0) } : column,
    )
    return resolveWidths(columns, listWidth(dimensions().width))
  })
  const selected = createMemo(() => {
    const count = items().length
    if (count === 0) return -1
    return Math.min(session.rowIndex(props.kind.id), count - 1)
  })
  const banner = createMemo(() => {
    const current = snapshot()
    const query = session.filter()
    if (current.status === "error" && current.items.length === 0) return current.error ?? "Failed to load resources"
    if (current.items.length === 0 && current.status === "loading") return `Loading ${props.kind.label}...`
    if (query && owned().length > 0 && items().length === 0) return `No ${props.kind.label} matching ${query}`
    const owner = session.activeTab()?.owner
    if (items().length === 0 && owner) return `No ${props.kind.label} owned by ${owner.name}`
    if (current.items.length === 0) return `No ${props.kind.label}`
    return ""
  })
  const letters = createMemo(() => columnLetters(props.kind.columns.map((column) => column.header)))
  const headers = createMemo(() => {
    const sort = session.sort()
    return props.kind.columns.map((column, index) => ({
      text: columnHeader(column.header, props.letters ? letters()[index] ?? "" : "", sort?.column === column.id ? sort.desc : null),
      tone: "muted" as const,
    }))
  })

  createEffect(() => {
    const index = selected()
    if (index < 0) return
    const id = rowId(props.kind.id, index)
    scroller?.afterLayout(() => scroller?.scrollChildIntoView(id))
  })

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} backgroundColor={theme.panel}>
      <Cells columns={props.kind.columns} widths={widths()} values={headers()} background={theme.element} />
      <Show when={banner()}>
        <text fg={snapshot().status === "error" ? theme.error : theme.muted} flexShrink={0}>
          {" "}
          {banner()}
        </text>
      </Show>
      <Show when={snapshot().status === "error" && snapshot().items.length > 0}>
        <text fg={theme.error} flexShrink={0}>
          {" "}
          {snapshot().error}
        </text>
      </Show>
      <scrollbox
        ref={(value: ScrollBoxRenderable) => {
          scroller = value
        }}
        flexGrow={1}
        flexBasis={0}
        minHeight={0}
        backgroundColor={theme.panel}
        contentOptions={{ backgroundColor: theme.panel, flexDirection: "column" }}
        viewportOptions={{ backgroundColor: theme.panel, paddingRight: listGutter }}
        verticalScrollbarOptions={{ paddingLeft: listGutter - 1, position: "absolute" }}
      >
        <Keyed each={items()} by={objectId}>
          {(item, index) => (
            <ResourceRow
              kind={props.kind}
              item={item()}
              index={index()}
              widths={widths()}
              selected={index() === selected()}
            />
          )}
        </Keyed>
      </scrollbox>
    </box>
  )
}

function ResourceRow(props: {
  kind: ResourceKind
  item: KubernetesObject
  index: number
  widths: number[]
  selected: boolean
}) {
  const session = useSession()
  const cluster = useCluster()
  const values = () => props.kind.columns.map((column) => column.cell(props.item, cluster.now()))
  const focused = () => props.selected && session.focus() === "list"
  const background = () => (focused() ? theme.primary : props.selected ? theme.element : theme.panel)

  return (
    <box
      id={rowId(props.kind.id, props.index)}
      onMouseDown={(event) => {
        event.stopPropagation()
        session.selectRow(props.kind.id, props.index)
      }}
    >
      <Cells
        columns={props.kind.columns}
        widths={props.widths}
        values={values()}
        background={background()}
        fg={focused() ? theme.selected : undefined}
        query={session.filter()}
      />
    </box>
  )
}

function rowId(kindId: string, index: number): string {
  return `row-${kindId}-${index}`
}

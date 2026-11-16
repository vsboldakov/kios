import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { containerColumns } from "../workspace/containers"
import { columnHeader, columnLetters } from "../workspace/sort"
import { resolveWidths } from "../resources"
import { scopedPod, visibleRows } from "../workspace/selection"
import { Cells } from "./cells"
import { listGutter, listWidth, theme } from "./theme"

export function ContainerList(props: { name: string; namespace: string; letters: boolean }) {
  const session = useSession()
  const cluster = useCluster()
  const dimensions = useTerminalDimensions()
  let scroller: ScrollBoxRenderable | undefined

  const pod = createMemo(() => scopedPod(session, cluster))
  const listed = createMemo(() => {
    const current = visibleRows(session, cluster)
    if (current?.type !== "containers") return null
    return current
  })
  const all = () => listed()?.rows ?? []
  const items = () => listed()?.shown ?? []
  const widths = createMemo(() => resolveWidths(containerColumns, listWidth(dimensions().width)))
  const selected = createMemo(() => {
    const count = items().length
    if (count === 0) return -1
    return Math.min(session.containerIndex(), count - 1)
  })
  const letters = createMemo(() => columnLetters(containerColumns.map((column) => column.header)))
  const headers = createMemo(() => {
    const sort = session.containerSort()
    return containerColumns.map((column, index) => ({
      text: columnHeader(column.header, props.letters ? letters()[index] ?? "" : "", sort?.column === column.id ? sort.desc : null),
      tone: "muted" as const,
    }))
  })
  const banner = createMemo(() => {
    if (!pod()) return `Pod ${props.name} is not in the list`
    if (all().length === 0) return `No containers in ${props.name}`
    const query = session.containerFilter()
    if (query && items().length === 0) return `No containers matching ${query}`
    return ""
  })

  createEffect(() => {
    const index = selected()
    if (index < 0) return
    scroller?.afterLayout(() => scroller?.scrollChildIntoView(`container-${index}`))
  })

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} backgroundColor={theme.panel}>
      <Cells columns={containerColumns} widths={widths()} values={headers()} background={theme.element} />
      <Show when={banner()}>
        <text fg={theme.muted} flexShrink={0}>
          {" "}
          {banner()}
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
        <For each={items()}>
          {(item, index) => (
            <box
              id={`container-${index()}`}
              onMouseDown={(event) => {
                event.stopPropagation()
                session.selectContainer(index())
              }}
            >
              <Cells
                columns={containerColumns}
                widths={widths()}
                values={containerColumns.map((column) => column.cell(item))}
                background={rowBackground(index() === selected(), session.focus() === "list")}
                fg={index() === selected() && session.focus() === "list" ? theme.selected : undefined}
                query={session.containerFilter()}
              />
            </box>
          )}
        </For>
      </scrollbox>
    </box>
  )
}

function rowBackground(selected: boolean, focused: boolean): string {
  if (selected && focused) return theme.primary
  if (selected) return theme.element
  return theme.panel
}


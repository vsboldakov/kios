import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { nameMatches } from "../workspace/filter"
import { columnHeader, columnLetters, sortByText, type ColumnSort } from "../workspace/sort"
import { fit, podContainers, resolveWidths, type Cell, type Column, type PodContainer } from "../resources"
import { MatchedText } from "./list-filter"
import { kindSidebarWidth, listGutter, sidebarWidth, theme, toneColor } from "./theme"

export const containerColumns: { id: string; header: string; width: number; grow?: boolean; cell: (row: PodContainer) => Cell }[] = [
  { id: "name", header: "NAME", width: 12, grow: true, cell: (row) => ({ text: row.name }) },
  { id: "type", header: "TYPE", width: 10, cell: (row) => ({ text: row.type }) },
  { id: "status", header: "STATUS", width: 12, cell: (row) => ({ text: row.status, tone: row.tone }) },
  { id: "restarts", header: "RESTARTS", width: 8, cell: (row) => ({ text: String(row.restarts) }) },
  { id: "cpu", header: "CPU", width: 12, cell: (row) => ({ text: row.cpu }) },
  { id: "memory", header: "MEM", width: 14, cell: (row) => ({ text: row.memory }) },
  { id: "image", header: "IMAGE", width: 16, grow: true, cell: (row) => ({ text: row.image }) },
]

export function orderedContainers(rows: readonly PodContainer[], sort: ColumnSort | null): readonly PodContainer[] {
  if (!sort) return rows
  const column = containerColumns.find((item) => item.id === sort.column)
  if (!column) return rows
  return sortByText(rows, (row) => column.cell(row).text, sort.desc)
}

export function ContainerList(props: { name: string; namespace: string; letters: boolean }) {
  const session = useSession()
  const cluster = useCluster()
  const dimensions = useTerminalDimensions()
  let scroller: ScrollBoxRenderable | undefined

  const pod = createMemo(() =>
    cluster.snapshot("pods").items.find((item) => item.metadata?.name === props.name && (item.metadata?.namespace ?? "") === props.namespace),
  )
  const all = createMemo(() => {
    const current = pod()
    return current ? podContainers(current) : []
  })
  const items = createMemo(() => {
    const query = session.containerFilter()
    const rows = all()
    const matched = query ? rows.filter((row) => nameMatches(row.name, query)) : rows
    return orderedContainers(matched, session.containerSort())
  })
  const widths = createMemo(() =>
    resolveWidths(
      containerColumns.map((column) => ({ ...column, cell: () => ({ text: "" }) }) satisfies Column),
      Math.max(20, dimensions().width - kindSidebarWidth - sidebarWidth - 4 - listGutter),
    ),
  )
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
      <Cells widths={widths()} values={headers()} background={theme.element} />
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

function Cells(props: { widths: number[]; values: Cell[]; background: string; fg?: string; query?: string }) {
  return (
    <box height={1} width="100%" flexShrink={0} flexDirection="row" backgroundColor={props.background} paddingLeft={2}>
      <For each={containerColumns}>
        {(column, index) => (
          <text fg={props.fg ?? toneColor(props.values[index()]?.tone)} bg={props.background}>
            {index() === 0 && props.query ? (
              <MatchedText
                text={props.values[index()]?.text ?? ""}
                query={props.query}
                width={props.widths[index()] ?? column.width}
                covered={Boolean(props.fg)}
              />
            ) : (
              fit(props.values[index()]?.text ?? "", props.widths[index()] ?? column.width)
            )}
            {index() < containerColumns.length - 1 ? "  " : ""}
          </text>
        )}
      </For>
    </box>
  )
}

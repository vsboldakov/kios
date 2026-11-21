import type { ScrollBoxRenderable } from "@opentui/core"
import { Show, createEffect, createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { nameMatches } from "../workspace/filter"
import { Keyed } from "./keyed"
import { Loader } from "./loader"
import { ListFilter, MatchedText } from "./list-filter"
import { fit } from "../resources"
import { sidebarWidth, splitBorder, theme } from "./theme"

export function namespaceOptions(locked: boolean, names: readonly string[]): readonly string[] {
  return locked ? names : ["", ...names]
}

export function namespaceLabel(name: string): string {
  return name || "all namespaces"
}

export function filteredNamespaces(locked: boolean, names: readonly string[], query: string): readonly string[] {
  const options = namespaceOptions(locked, names)
  if (!query) return options
  return options.filter((name) => nameMatches(namespaceLabel(name), query))
}

export function NamespaceList(props: {
  filtering: boolean
  onFilter: (value: string) => void
  onSubmit: () => void
  onEdit: () => void
}) {
  const session = useSession()
  const cluster = useCluster()
  const options = createMemo(() => filteredNamespaces(cluster.namespaceLocked(), cluster.namespaces(), session.namespaceFilter()))
  const cursor = createMemo(() => {
    const count = options().length
    if (count === 0) return 0
    return Math.min(session.namespaceIndex(), count - 1)
  })
  let scroller: ScrollBoxRenderable | undefined

  createEffect(() => {
    const name = session.focus() === "namespaces" ? options()[cursor()] ?? "" : cluster.namespace()
    const id = rowId(name)
    scroller?.afterLayout(() => scroller?.scrollChildIntoView(id))
  })

  return (
    <box
      width={sidebarWidth}
      border={["left"]}
      borderColor={session.focus() === "namespaces" ? theme.primary : theme.border}
      customBorderChars={splitBorder}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexShrink={0}
    >
      <box height={1} paddingLeft={2} flexShrink={0}>
        <text fg={theme.primary} selectable={false}>
          Namespaces
        </text>
      </box>
      <ListFilter
        query={session.namespaceFilter()}
        editing={props.filtering}
        onInput={props.onFilter}
        onSubmit={props.onSubmit}
        onEdit={props.onEdit}
      />
      <scrollbox
        ref={(value: ScrollBoxRenderable) => {
          scroller = value
        }}
        flexGrow={1}
        flexBasis={0}
        minHeight={0}
        backgroundColor={theme.panel}
        contentOptions={{ backgroundColor: theme.panel, flexDirection: "column" }}
        viewportOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ paddingLeft: 1 }}
      >
        <Show
          when={cluster.namespacesReady()}
          fallback={
            <box height={1} paddingLeft={1} flexShrink={0}>
              <Loader label="Loading..." />
            </box>
          }
        >
          <Keyed each={options()} by={(name) => name || "all"}>
            {(name, index) => <NamespaceRow name={name()} index={index()} cursor={cursor()} />}
          </Keyed>
        </Show>
      </scrollbox>
    </box>
  )
}

function NamespaceRow(props: { name: string; index: number; cursor: number }) {
  const session = useSession()
  const cluster = useCluster()
  const cursor = () => session.focus() === "namespaces" && props.cursor === props.index
  const selected = () => cluster.namespace() === props.name

  return (
    <box
      id={rowId(props.name)}
      height={1}
      width="100%"
      backgroundColor={cursor() ? theme.primary : theme.panel}
      paddingLeft={1}
      onMouseDown={(event) => {
        event.stopPropagation()
        session.setNamespaceIndex(props.index)
        cluster.setNamespace(props.name)
        session.setFocus("list")
      }}
    >
      {/* shortcut: names longer than the column are cut, widen sidebarWidth when a namespace needs its full name */}
      <text fg={cursor() ? theme.selected : selected() ? theme.primary : theme.fg}>
        {session.namespaceFilter() ? (
          <MatchedText text={namespaceLabel(props.name)} query={session.namespaceFilter()} width={sidebarWidth - 3} covered={cursor()} />
        ) : (
          fit(namespaceLabel(props.name), sidebarWidth - 3)
        )}
      </text>
    </box>
  )
}

function rowId(name: string): string {
  return name ? `namespace-${name}` : "namespace-all"
}

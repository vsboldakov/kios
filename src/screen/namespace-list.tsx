import type { ScrollBoxRenderable } from "@opentui/core"
import { createEffect, createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { Keyed } from "./keyed"
import { fit } from "../resources"
import { sidebarWidth, splitBorder, theme } from "./theme"

export function NamespaceList() {
  const session = useSession()
  const cluster = useCluster()
  const options = createMemo(() => (cluster.namespaceLocked() ? [...cluster.namespaces()] : ["", ...cluster.namespaces()]))
  let scroller: ScrollBoxRenderable | undefined

  createEffect(() => {
    const id = rowId(cluster.namespace())
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
        <Keyed each={options()} by={(name) => name || "all"}>
          {(name) => <NamespaceRow name={name()} />}
        </Keyed>
      </scrollbox>
    </box>
  )
}

function NamespaceRow(props: { name: string }) {
  const session = useSession()
  const cluster = useCluster()
  const selected = () => cluster.namespace() === props.name
  const focused = () => session.focus() === "namespaces"

  return (
    <box
      id={rowId(props.name)}
      height={1}
      width="100%"
      backgroundColor={selected() && focused() ? theme.primary : theme.panel}
      paddingLeft={1}
      onMouseDown={(event) => {
        event.stopPropagation()
        cluster.setNamespace(props.name)
        session.setFocus("list")
      }}
    >
      {/* shortcut: names longer than the column are cut, widen sidebarWidth when a namespace needs its full name */}
      <text fg={selected() && focused() ? theme.selected : selected() ? theme.primary : theme.fg}>
        {fit(props.name || "all namespaces", sidebarWidth - 3)}
      </text>
    </box>
  )
}

function rowId(name: string): string {
  return name ? `namespace-${name}` : "namespace-all"
}

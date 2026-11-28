import type { ScrollBoxRenderable } from "@opentui/core"
import { Show, createEffect, createMemo } from "solid-js"
import { useCluster, useSession } from "../context"
import { Keyed } from "./keyed"
import { Loader } from "./loader"
import { findKind, sidebarLabel, type ResourceKind } from "../resources"
import { kindSidebarWidth, splitBorder, theme } from "./theme"

export function Sidebar() {
  const session = useSession()
  const cluster = useCluster()
  const kinds = createMemo(() => session.menu().flatMap((item) => {
    const kind = findKind(item.id, cluster.extraKinds())
    return kind ? [kind] : []
  }))
  let scroller: ScrollBoxRenderable | undefined

  createEffect(() => {
    const id = kinds()[session.sidebarIndex()]?.id
    if (!id) return
    scroller?.afterLayout(() => scroller?.scrollChildIntoView(`kind-${id}`))
  })

  return (
    <box
      width={kindSidebarWidth}
      border={["left"]}
      borderColor={session.focus() === "sidebar" ? theme.primary : theme.border}
      customBorderChars={splitBorder}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexShrink={0}
    >
      <box height={1} flexShrink={0} backgroundColor={theme.panel} />
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
        <Keyed each={kinds()} by={(kind) => kind.id}>
          {(kind, index) => (
            <box flexDirection="column" flexShrink={0}>
              <Show when={index() > 0 && kinds()[index() - 1]?.group !== kind().group}>
                <box height={1} backgroundColor={theme.panel} />
              </Show>
              <SidebarItem kind={kind()} index={index()} />
            </box>
          )}
        </Keyed>
        <Show when={!cluster.kindsReady()}>
          <box height={1} backgroundColor={theme.panel} />
          <box height={1} paddingLeft={1} flexShrink={0}>
            <Loader label="CRDs" />
          </box>
        </Show>
      </scrollbox>
    </box>
  )
}

function SidebarItem(props: { kind: ResourceKind; index: number }) {
  const session = useSession()
  const cursor = () => session.sidebarIndex() === props.index
  const active = () => session.activeId() === props.kind.id
  const focused = () => session.focus() === "sidebar"

  return (
    <box
      id={`kind-${props.kind.id}`}
      height={1}
      width="100%"
      backgroundColor={cursor() && focused() ? theme.primary : theme.panel}
      paddingLeft={1}
      onMouseDown={(event) => {
        event.stopPropagation()
        session.openKind(props.kind.id)
      }}
    >
      <text fg={cursor() && focused() ? theme.selected : active() ? theme.primary : theme.fg}>
        {sidebarLabel(props.kind.label)}
        <Show when={props.kind.mark}>
          <span style={{ fg: cursor() && focused() ? theme.selected : theme.muted }}>{` ${props.kind.mark}`}</span>
        </Show>
      </text>
    </box>
  )
}

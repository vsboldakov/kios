import { Show } from "solid-js"
import { useCluster, useSession } from "../context"
import { Keyed } from "./keyed"
import { findKind } from "../resources"
import type { WorkspaceTab } from "../workspace/session"
import { theme } from "./theme"

export function WorkspaceTabs() {
  const session = useSession()

  return (
    <box height={1} flexShrink={1} flexDirection="row" backgroundColor={theme.panel}>
      <Keyed each={session.tabs()} by={(tab) => tab.id}>
        {(tab) => <WorkspaceTabChip tab={tab()} />}
      </Keyed>
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.panel}
        onMouseDown={(event) => {
          event.stopPropagation()
          session.newTab()
        }}
      >
        <text fg={theme.primary} selectable={false}>
          +
        </text>
      </box>
    </box>
  )
}

function WorkspaceTabChip(props: { tab: WorkspaceTab }) {
  const session = useSession()
  const cluster = useCluster()
  const active = () => session.activeTab()?.id === props.tab.id
  const label = () => {
    if (props.tab.resource) return props.tab.resource.namespace ? `${props.tab.resource.namespace}/${props.tab.resource.name}` : props.tab.resource.name
    if (props.tab.containers) return "Containers"
    const kind = findKind(props.tab.kindId, cluster.extraKinds())?.label ?? props.tab.kindId
    const namespace = cluster.namespace()
    return namespace ? `${namespace}/${kind}` : kind
  }

  const color = () => (active() ? theme.selected : theme.muted)
  const closable = () => session.tabs().length > 1

  return (
    <box
      height={1}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={closable() ? 0 : 1}
      backgroundColor={active() ? theme.primary : theme.panel}
      onMouseDown={(event) => {
        event.stopPropagation()
        session.focusTab(props.tab.id)
      }}
    >
      <text fg={color()} selectable={false}>
        {clip(label(), 22)}
      </text>
      <Show when={closable()}>
        <box
          height={1}
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={active() ? theme.primary : theme.panel}
          onMouseDown={(event) => {
            event.stopPropagation()
            session.closeTab(props.tab.id)
          }}
        >
          <text fg={color()} selectable={false}>
            x
          </text>
        </box>
      </Show>
    </box>
  )
}

function clip(value: string, width: number): string {
  return value.length <= width ? value : value.slice(0, width)
}

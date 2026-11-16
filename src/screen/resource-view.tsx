import type { ScrollBoxRenderable } from "@opentui/core"
import { For, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { ObjectView } from "../cluster/cluster"
import { useCluster, useSession } from "../context"
import { bindDetailContent } from "./detail-content"
import { highlight } from "./highlight"
import { findKind } from "../resources"
import type { DetailTab } from "../workspace/session"
import { theme } from "./theme"
import { bindDetailScroll, resetDetailScroll } from "./detail-scroll"

const labels: Record<DetailTab, string> = {
  describe: "Describe",
  yaml: "YAML",
  json: "JSON",
}

export function ResourceView(props: { kindId: string; name: string; namespace: string; tab: DetailTab }) {
  const session = useSession()
  const cluster = useCluster()
  const [view, setView] = createSignal<ObjectView | null>(null)
  const [error, setError] = createSignal("")
  const lines = createMemo(() => (view()?.[props.tab] ?? (error() || "Loading...")).split("\n"))
  const releaseDetail = bindDetailContent(() => {
    const loaded = view()
    if (loaded) return loaded[props.tab]
    if (error()) return error()
    return null
  })
  onCleanup(releaseDetail)

  createEffect(() => {
    const kind = findKind(props.kindId, cluster.extraKinds())
    const name = props.name
    const namespace = props.namespace
    if (!kind) return
    let stale = false
    setView(null)
    setError("")
    void cluster.inspect(kind, name, namespace).then(
      (next) => {
        if (!stale) setView(next)
      },
      (reason: unknown) => {
        if (!stale) setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
    onCleanup(() => {
      stale = true
    })
  })

  createEffect(() => {
    props.tab
    resetDetailScroll()
  })

  onCleanup(() => {
    bindDetailScroll(undefined)
  })

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} backgroundColor={theme.panel}>
      <box height={1} flexShrink={0} flexDirection="row" backgroundColor={theme.panel} paddingLeft={1}>
        <DetailTabButton tab="describe" current={props.tab} />
        <DetailTabButton tab="yaml" current={props.tab} />
        <DetailTabButton tab="json" current={props.tab} />
      </box>
      <scrollbox
        ref={(value: ScrollBoxRenderable) => {
          bindDetailScroll(value)
        }}
        flexGrow={1}
        flexBasis={0}
        minHeight={0}
        backgroundColor={theme.panel}
        contentOptions={{ backgroundColor: theme.panel, flexDirection: "column" }}
        viewportOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ paddingLeft: 1 }}
      >
        <For each={lines()}>
          {(line) => <HighlightedLine tab={props.tab} line={line} />}
        </For>
      </scrollbox>
    </box>
  )
}

function HighlightedLine(props: { tab: DetailTab; line: string }) {
  return (
    <text>
      <For each={highlight(props.tab, props.line)}>
        {(span) => <span style={{ fg: span.fg }}>{span.text}</span>}
      </For>
    </text>
  )
}

function DetailTabButton(props: { tab: DetailTab; current: DetailTab }) {
  const session = useSession()
  const active = () => props.current === props.tab

  return (
    <box
      height={1}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={active() ? theme.primary : theme.panel}
      onMouseDown={(event) => {
        event.stopPropagation()
        session.setDetailTab(props.tab)
      }}
    >
      <text fg={active() ? theme.selected : theme.muted} selectable={false}>
        {labels[props.tab]}
      </text>
    </box>
  )
}

import type { ScrollBoxRenderable } from "@opentui/core"
import { For, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useCluster, useSession } from "../context"
import { findKind, logContainerNames } from "../resources"
import { bindDetailContent } from "./detail-content"
import { theme } from "./theme"
import { bindDetailScroll, stickDetailScroll } from "./detail-scroll"

export function LogView(props: { kindId: string; name: string; namespace: string }) {
  const session = useSession()
  const cluster = useCluster()
  const [text, setText] = createSignal<string | null>(null)
  const lines = createMemo(() => {
    const current = text()
    if (current == null) return ["Loading..."]
    return (current || "No logs").split("\n")
  })
  const releaseDetail = bindDetailContent(() => text())
  onCleanup(releaseDetail)
  const live = () => session.detail()?.follow ?? false
  const previous = () => session.detail()?.previous ?? false
  const container = () => {
    const selected = session.detail()?.container ?? ""
    if (!selected) return ""
    const object = cluster.snapshot(props.kindId).items.find((item) => item.metadata?.name === props.name && (item.metadata?.namespace ?? "") === props.namespace)
    return object && logContainerNames(props.kindId, object).includes(selected) ? selected : ""
  }

  createEffect(() => {
    const kind = findKind(props.kindId, cluster.extraKinds())
    const name = props.name
    const namespace = props.namespace
    const follow = live()
    const showPrevious = previous()
    const selected = container()
    if (!kind) return
    let stale = false
    let stop = () => {}
    setText(null)
    if (follow) stop = cluster.followLogs(kind, name, namespace, (next) => {
      if (!stale) setText(next)
    }, selected)
    else {
      void cluster.logs(kind, name, namespace, showPrevious, selected).then((next) => {
        if (!stale) setText(next)
      })
    }
    onCleanup(() => {
      stale = true
      stop()
    })
  })

  createEffect(() => {
    lines()
    if (live()) stickDetailScroll()
  })

  onCleanup(() => {
    bindDetailScroll(undefined)
  })

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} backgroundColor={theme.panel}>
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
          {(line) => (
            <text fg={theme.fg}>
              {line || " "}
            </text>
          )}
        </For>
      </scrollbox>
    </box>
  )
}

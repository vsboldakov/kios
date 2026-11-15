import type { ScrollBoxRenderable } from "@opentui/core"
import { For, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useCluster, useSession } from "../context"
import { findKind } from "../resources"
import { theme } from "./theme"
import { bindDetailScroll, stickDetailScroll } from "./detail-scroll"

export function LogView(props: { kindId: string; name: string; namespace: string }) {
  const session = useSession()
  const cluster = useCluster()
  const [text, setText] = createSignal("Loading...")
  const lines = createMemo(() => (text() || "No logs").split("\n"))
  const live = () => session.detail()?.follow ?? false

  createEffect(() => {
    const kind = findKind(props.kindId, cluster.extraKinds())
    const name = props.name
    const namespace = props.namespace
    const follow = live()
    if (!kind) return
    let stale = false
    let stop = () => {}
    setText("Loading...")
    if (follow) stop = cluster.followLogs(kind, name, namespace, (next) => {
      if (!stale) setText(next)
    })
    else {
      void cluster.logs(kind, name, namespace).then((next) => {
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

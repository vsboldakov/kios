import { createTimer } from "@solid-primitives/timer"
import type { JSX } from "@opentui/solid"
import { createEffect, onCleanup } from "solid-js"
import { createCluster, type ClusterClient } from "./cluster/cluster"
import { ClusterContext, SessionContext, useSession } from "./context"
import { menuKinds, sidebarKinds } from "./resources"
import { createSession } from "./workspace/session"
import { Shell } from "./shell"

export function App(props: { client: ClusterClient }) {
  const session = createSession(menuKinds)
  return (
    <SessionContext.Provider value={session}>
      <ClusterProvider client={props.client}>
        <Shell />
      </ClusterProvider>
    </SessionContext.Provider>
  )
}

function ClusterProvider(props: { client: ClusterClient; children: JSX.Element }) {
  const session = useSession()
  const cluster = createCluster(props.client)

  createEffect(() => {
    const extra = cluster.extraKinds()
    session.setExtra(extra)
    session.setMenu(sidebarKinds(extra))
  })

  createEffect(() => {
    cluster.syncWatches(session.openIds())
  })

  onCleanup(() => {
    cluster.syncWatches([])
  })

  createTimer(() => {
    void cluster.refreshNamespaces()
  }, 2000, setInterval)

  return <ClusterContext.Provider value={cluster}>{props.children}</ClusterContext.Provider>
}

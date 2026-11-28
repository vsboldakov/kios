import { createTimer } from "@solid-primitives/timer"
import type { JSX } from "@opentui/solid"
import { createEffect, onCleanup } from "solid-js"
import { createCluster, type ClusterClient } from "./cluster/cluster"
import { ClusterContext, SessionContext, useSession } from "./context"
import { helmKinds } from "./helm/kinds"
import { menuKinds, sidebarKinds } from "./resources"
import { createSession } from "./workspace/session"
import { Shell } from "./shell"

// edit fixes edit mode on or off and hides its toggle. Leave it undefined to let the user toggle.
export function App(props: { client: ClusterClient; namespace?: string; edit?: boolean; helm?: boolean }) {
  const session = createSession(menuKinds)
  return (
    <SessionContext.Provider value={session}>
      <ClusterProvider client={props.client} namespace={props.namespace ?? ""} helm={props.helm === true}>
        <Shell edit={props.edit} />
      </ClusterProvider>
    </SessionContext.Provider>
  )
}

function ClusterProvider(props: { client: ClusterClient; namespace: string; helm: boolean; children: JSX.Element }) {
  const session = useSession()
  const cluster = createCluster(props.client, props.namespace, props.helm ? helmKinds : [])

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

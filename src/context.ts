import { createContext, useContext } from "solid-js"
import type { Cluster } from "./cluster/cluster"
import type { Session } from "./workspace/session"

export const SessionContext = createContext<Session>()
export const ClusterContext = createContext<Cluster>()

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error("Session is missing")
  return session
}

export function useCluster(): Cluster {
  const cluster = useContext(ClusterContext)
  if (!cluster) throw new Error("Cluster is missing")
  return cluster
}

export interface KubernetesObject {
  metadata?: {
    uid?: string
    name?: string
    namespace?: string
    creationTimestamp?: string
    labels?: Record<string, string>
    ownerReferences?: { uid?: string; kind?: string; name?: string; controller?: boolean }[]
  }
  spec?: {
    replicas?: number
    completions?: number
    schedule?: string
    suspend?: boolean
    type?: string
    clusterIP?: string
    ingressClassName?: string
    minReplicas?: number
    maxReplicas?: number
    metrics?: unknown
    targetCPUUtilizationPercentage?: number
    minAvailable?: number | string
    volumeName?: string
    storageClassName?: string
    unschedulable?: boolean
    containers?: ContainerSpec[]
    initContainers?: ContainerSpec[]
    ephemeralContainers?: ContainerSpec[]
    ports?: { port?: number }[]
    rules?: { host?: string }[]
    scaleTargetRef?: { kind?: string; name?: string }
    podSelector?: { matchLabels?: Record<string, string> }
    capacity?: { storage?: string }
    claimRef?: { namespace?: string; name?: string }
  }
  status?: {
    readyReplicas?: number
    desiredNumberScheduled?: number
    numberReady?: number
    phase?: string
    succeeded?: number
    failed?: number
    currentReplicas?: number
    desiredReplicas?: number
    currentMetrics?: unknown
    currentCPUUtilizationPercentage?: number
    disruptionsAllowed?: number
    capacity?: { cpu?: string; memory?: string; storage?: string }
    allocatable?: { cpu?: string; memory?: string }
    containerStatuses?: ContainerStatus[]
    initContainerStatuses?: ContainerStatus[]
    ephemeralContainerStatuses?: ContainerStatus[]
    conditions?: { type?: string; status?: string; message?: string }[]
    nodeInfo?: { kubeletVersion?: string }
  }
  data?: Record<string, string>
  type?: string
  reason?: string
  message?: string
  involvedObject?: { kind?: string; name?: string }
  lastTimestamp?: string
  provisioner?: string
  usage?: { cpu?: string; memory?: string }
}

export interface CellPart {
  text: string
  tone?: "ready" | "progress" | "muted"
}

export interface Cell {
  text: string
  tone?: "ready" | "progress" | "muted"
  parts?: CellPart[]
}

export interface Column {
  id: string
  header: string
  width: number
  grow?: boolean
  cell: (object: KubernetesObject, now: number) => Cell
}

export interface KindCommand {
  bin: string
  args: string[]
  stdin?: string
  interactive?: boolean
}

export interface KindAction {
  key: string
  label: string
  id: string
  command: (kind: ResourceKind, target: { name: string; namespace: string }, now: number) => KindCommand | null
}

export interface ResourceKind {
  id: string
  label: string
  resource: string
  apiVersion?: string
  namespaced: boolean
  group: number
  deletable?: boolean
  sidebar?: boolean
  aliases?: readonly string[]
  columns: Column[]
  actions?: readonly KindAction[]
}

export interface OwnerScope {
  uid: string
  kind: string
  name: string
  namespace: string
}

export interface ContainerSpec {
  name?: string
  image?: string
  restartPolicy?: string
  ports?: { containerPort?: number }[]
  resources?: {
    requests?: { cpu?: string; memory?: string }
    limits?: { cpu?: string; memory?: string }
  }
}

export interface ContainerStatus {
  name?: string
  ready?: boolean
  restartCount?: number
  state?: {
    running?: { startedAt?: string }
    waiting?: { reason?: string }
    terminated?: { reason?: string; exitCode?: number }
  }
}

import { ageColumn, column, count, nameColumn, namespaceColumn } from "./columns"
import type { Cell, CellPart, Column, ContainerSpec, ContainerStatus, KubernetesObject } from "./types"

export interface PodContainer {
  name: string
  type: "init" | "sidecar" | "container" | "ephemeral"
  image: string
  status: string
  tone: NonNullable<Cell["tone"]>
  restarts: number
  cpu: string
  memory: string
}

export const podColumns: Column[] = [
  namespaceColumn,
  nameColumn,
  column("ready", "READY", 7, (object) => {
    const statuses = object.status?.containerStatuses ?? []
    return `${statuses.filter((item) => item.ready).length}/${object.spec?.containers?.length ?? statuses.length}`
  }),
  { id: "containers", header: "CONTAINERS", width: 11, cell: containerMarks },
  { id: "status", header: "STATUS", width: 12, cell: podPhase },
  column("restarts", "RESTARTS", 8, (object) => String(restartTotal(object))),
  ageColumn,
]

export function podContainers(object: KubernetesObject): PodContainer[] {
  return [
    ...containerRows(object.spec?.containers, object.status?.containerStatuses, "container"),
    ...containerRows(object.spec?.initContainers, object.status?.initContainerStatuses, "init"),
    ...containerRows(object.spec?.ephemeralContainers, object.status?.ephemeralContainerStatuses, "ephemeral"),
  ]
}

function listedContainers(spec: { name?: string }[] | undefined, statuses: ContainerStatus[] | undefined): (ContainerStatus | undefined)[] {
  const reported = statuses ?? []
  if (!spec?.length) return reported
  const byName = spec.some((item) => item.name) && reported.some((item) => item.name)
  if (!byName) return spec.map((_, index) => reported[index])
  return spec.map((item) => reported.find((status) => status.name === item.name))
}

function containerTone(status: ContainerStatus | undefined): NonNullable<Cell["tone"]> {
  const terminated = status?.state?.terminated
  if (terminated && (terminated.exitCode === 0 || terminated.reason === "Completed")) return "muted"
  if (status?.ready) return "ready"
  return "progress"
}

function containerMarks(object: KubernetesObject): Cell {
  const items = [
    ...listedContainers(object.spec?.containers, object.status?.containerStatuses),
    ...listedContainers(object.spec?.initContainers, object.status?.initContainerStatuses),
  ]
  if (items.length === 0) return { text: "" }
  const parts: CellPart[] = []
  for (const [index, item] of items.entries()) {
    if (index > 0) parts.push({ text: " " })
    const tone = containerTone(item)
    parts.push({ text: tone === "muted" ? "○" : "●", tone })
  }
  return { text: parts.map((part) => part.text).join(""), parts }
}

function containerState(status: ContainerStatus | undefined): { text: string; tone: NonNullable<Cell["tone"]> } {
  const terminated = status?.state?.terminated
  if (terminated) {
    const done = terminated.exitCode === 0 || terminated.reason === "Completed"
    return containerLabel(terminated.reason || (done ? "Completed" : "Error"), done ? "muted" : "progress")
  }
  if (status?.state?.waiting) return containerLabel(status.state.waiting.reason || "Waiting", "progress")
  if (status?.state?.running || status?.ready) return containerLabel("Running", status?.ready ? "ready" : "progress")
  return containerLabel("Pending", "muted")
}

function containerLabel(text: string, tone: NonNullable<Cell["tone"]>) {
  return { text, tone }
}

// shortcut: request/limit from the pod spec; switch to metrics-server when live usage is required
function resourcePair(resources: ContainerSpec["resources"], key: "cpu" | "memory"): string {
  const request = resources?.requests?.[key] ?? ""
  const limit = resources?.limits?.[key] ?? ""
  if (!request && !limit) return "-"
  return `${request || "-"}/${limit || "-"}`
}

function containerRows(
  spec: ContainerSpec[] | undefined,
  statuses: ContainerStatus[] | undefined,
  type: "init" | "container" | "ephemeral",
): PodContainer[] {
  const aligned = listedContainers(spec, statuses)
  const source = spec?.length ? spec : (statuses ?? [])
  return source.map((item, index) => {
    const status = spec?.length ? aligned[index] : statuses?.[index]
    const declared = spec?.[index]
    const state = containerState(status)
    return {
      name: item.name ?? status?.name ?? "",
      type: type === "init" && declared?.restartPolicy === "Always" ? "sidecar" : type,
      image: declared?.image ?? "",
      status: state.text,
      tone: state.tone,
      restarts: count(status?.restartCount),
      cpu: resourcePair(declared?.resources, "cpu"),
      memory: resourcePair(declared?.resources, "memory"),
    }
  })
}

function restartTotal(object: KubernetesObject): number {
  return [...(object.status?.initContainerStatuses ?? []), ...(object.status?.containerStatuses ?? [])].reduce(
    (sum, item) => sum + count(item.restartCount),
    0,
  )
}

function podPhase(object: KubernetesObject): Cell {
  const phase = object.status?.phase ?? ""
  if (phase === "Running" || phase === "Succeeded") return { text: phase, tone: "ready" }
  return { text: phase, tone: phase ? "progress" : "muted" }
}

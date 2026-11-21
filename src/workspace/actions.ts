import { kubectlBin } from "../cluster/kubectl"
import { findKind, resourceKinds, type KindCommand, type KubernetesObject, type ResourceKind } from "../resources"

export interface EditAction {
  key: string
  label: string
  id: string
}

export interface EditTarget {
  name: string
  namespace: string
  replicas?: number
  container?: string
  ports?: string[]
}

const deleteAction: EditAction = { key: "d", label: "Delete", id: "delete" }

export function editActions(kindId: string, suspended = false, extra: readonly ResourceKind[] = []): EditAction[] {
  const actions = kindActions(kindId, suspended, extra)
  if (actions.length === 0 && !builtinEditable(kindId)) return []
  return [...actions, { key: "e", label: "Edit", id: "edit" }]
}

function kindActions(kindId: string, suspended: boolean, extra: readonly ResourceKind[]): EditAction[] {
  if (kindId === "pods") {
    return [
      deleteAction,
      { key: "f", label: "Force", id: "force" },
      { key: "y", label: "Evict", id: "evict" },
      { key: "s", label: "Shell", id: "shell" },
      { key: "p", label: "Port-forward", id: "port-forward" },
    ]
  }
  if (kindId === "services") return [deleteAction, { key: "p", label: "Port-forward", id: "port-forward" }]
  if (kindId === "deployments") {
    return [
      deleteAction,
      { key: "r", label: "Restart", id: "restart" },
      { key: "u", label: "Undo", id: "undo" },
      { key: "s", label: "Scale", id: "scale" },
    ]
  }
  if (kindId === "statefulsets" || kindId === "daemonsets") {
    return [deleteAction, { key: "r", label: "Restart", id: "restart" }, { key: "u", label: "Undo", id: "undo" }]
  }
  if (kindId === "replicasets") return [deleteAction, { key: "s", label: "Scale", id: "scale" }]
  if (kindId === "jobs") return [deleteAction, suspendAction(suspended)]
  if (kindId === "cronjobs") {
    return [deleteAction, { key: "t", label: "Trigger", id: "trigger" }, suspendAction(suspended)]
  }
  if (kindId === "nodes") {
    return [
      // ctrl+c quits the app, so cordon takes o
      { key: "o", label: "Cordon", id: "cordon" },
      { key: "u", label: "Uncordon", id: "uncordon" },
      { key: "d", label: "Drain", id: "drain" },
      { key: "s", label: "Shell", id: "shell" },
    ]
  }
  const kind = findKind(kindId, extra)
  if (kind?.deletable) {
    const extraActions = (kind.actions ?? []).map((action) => ({ key: action.key, label: action.label, id: action.id }))
    return [deleteAction, ...extraActions]
  }
  return []
}

export function triggeredJobName(cron: string, now: number): string {
  const suffix = now.toString(36)
  return `${cron}-manual-${suffix}`.slice(0, 63).replace(/[^a-z0-9-]/g, "").replace(/-+$/g, "")
}

export function editCommand(kindId: string, actionId: string, target: EditTarget, now = Date.now(), extra: readonly ResourceKind[] = []): KindCommand | null {
  const kind = findKind(kindId, extra)
  if (!kind || !known(kindId, actionId, extra)) return null
  const scope = kind.namespaced && target.namespace ? ["-n", target.namespace] : []
  if (actionId === "delete") return deleteCommand(kind, target, scope)
  if (actionId === "force") {
    return { bin: "kubectl", args: ["delete", kind.resource, target.name, ...scope, "--force", "--grace-period=0", "--wait=false"] }
  }
  const custom = kind.actions?.find((action) => action.id === actionId)
  if (custom) return custom.command(kind, target, now)
  if (actionId === "evict") {
    return {
      bin: "kubectl",
      args: ["create", "-f", "-"],
      stdin: JSON.stringify({
        apiVersion: "policy/v1",
        kind: "Eviction",
        metadata: { name: target.name, namespace: target.namespace },
      }),
    }
  }
  if (actionId === "restart") return { bin: "kubectl", args: ["rollout", "restart", `${kind.resource}/${target.name}`, ...scope] }
  if (actionId === "undo") return { bin: "kubectl", args: ["rollout", "undo", `${kind.resource}/${target.name}`, ...scope] }
  if (actionId === "scale") {
    if (!Number.isInteger(target.replicas) || (target.replicas ?? -1) < 0) return null
    return { bin: "kubectl", args: ["scale", `${kind.resource}/${target.name}`, `--replicas=${target.replicas}`, ...scope] }
  }
  if (actionId === "trigger") {
    return { bin: "kubectl", args: ["create", "job", `--from=cronjob/${target.name}`, triggeredJobName(target.name, now), ...scope] }
  }
  if (actionId === "suspend" || actionId === "resume") {
    return {
      bin: "kubectl",
      args: ["patch", kind.resource, target.name, ...scope, "--type=merge", "-p", JSON.stringify({ spec: { suspend: actionId === "suspend" } })],
    }
  }
  if (actionId === "cordon") return { bin: "kubectl", args: ["cordon", target.name] }
  if (actionId === "uncordon") return { bin: "kubectl", args: ["uncordon", target.name] }
  if (actionId === "drain") {
    // shortcut: ignores daemonsets and emptyDir, drop the flags when a drain must stop for them
    return { bin: "kubectl", args: ["drain", target.name, "--ignore-daemonsets", "--delete-emptydir-data"] }
  }
  if (actionId === "edit") {
    return { bin: "kubectl", args: ["edit", kind.resource, target.name, ...scope], interactive: true }
  }
  if (actionId === "shell" && kindId === "pods") return podShell(target)
  if (actionId === "port-forward") return portForward(kindId, target)
  if (actionId === "shell") {
    // shortcut: busybox sysadmin profile, switch the image when the node needs another shell
    return {
      bin: "kubectl",
      args: ["debug", `node/${target.name}`, "-it", "--image=busybox", "--profile=sysadmin"],
      interactive: true,
    }
  }
  return null
}

export function commandLine(command: KindCommand, context = ""): string {
  const scope = context ? ["--context", context] : []
  const line = [shellWord(kubectlBin()), ...scope.map(shellWord), ...command.args.map(shellWord)].join(" ")
  if (command.stdin === undefined) return line
  return `${line} <<'EOF'\n${command.stdin}\nEOF`
}

// A selected row or the only app container is named. Several containers omit -c and kubectl chooses.
export function shellContainer(object: KubernetesObject, selected?: string): string | undefined {
  if (selected) return selected
  const names = (object.spec?.containers ?? []).flatMap((item) => (item.name ? [item.name] : []))
  if (names.length === 1) return names[0]
  return undefined
}

export function declaredPorts(kindId: string, object: KubernetesObject): number[] {
  const ports =
    kindId === "services"
      ? (object.spec?.ports ?? []).flatMap((port) => (typeof port.port === "number" ? [port.port] : []))
      : (object.spec?.containers ?? []).flatMap((container) =>
          (container.ports ?? []).flatMap((port) => (typeof port.containerPort === "number" ? [port.containerPort] : [])),
        )
  return [...new Set(ports)]
}

export function portMappings(value: string): string[] | null {
  const ports = value.trim().split(/\s+/).filter(Boolean)
  if (ports.length === 0 || ports.some((port) => !portOk(port))) return null
  return ports
}

function portOk(value: string): boolean {
  const parts = value.split(":")
  if (parts.length > 2) return false
  return parts.every((part) => {
    const port = Number(part)
    return /^\d+$/.test(part) && port >= 1 && port <= 65535
  })
}

function podShell(target: EditTarget): KindCommand | null {
  if (!target.namespace) return null
  const container = target.container ? ["-c", target.container] : []
  return {
    bin: "kubectl",
    args: ["exec", "-i", "-t", "-n", target.namespace, target.name, ...container, "--", "sh", "-c", "clear; (bash || ash || sh)"],
    interactive: true,
  }
}

function portForward(kindId: string, target: EditTarget): KindCommand | null {
  if (!target.namespace || !target.ports?.length) return null
  const resource = kindId === "services" ? "svc" : "pod"
  return {
    bin: "kubectl",
    args: ["port-forward", "-n", target.namespace, `${resource}/${target.name}`, ...target.ports],
    interactive: true,
  }
}

function shellWord(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

// Events are records. Every other catalog kind can be changed with kubectl edit.
function builtinEditable(kindId: string): boolean {
  return kindId !== "events" && resourceKinds.some((kind) => kind.id === kindId)
}

function known(kindId: string, actionId: string, extra: readonly ResourceKind[]): boolean {
  return editActions(kindId, actionId === "resume", extra).some((action) => action.id === actionId)
}

function suspendAction(suspended: boolean): EditAction {
  if (suspended) return { key: "s", label: "Resume", id: "resume" }
  return { key: "s", label: "Suspend", id: "suspend" }
}

function deleteCommand(kind: ResourceKind, target: EditTarget, scope: string[]): KindCommand {
  return { bin: "kubectl", args: ["delete", kind.resource, target.name, ...scope, "--wait=false"] }
}

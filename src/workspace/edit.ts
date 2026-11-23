import type { KeyEvent } from "@opentui/core"
import { createMemo, createSignal } from "solid-js"
import { commandLine, declaredPorts, editActions, editCommand, portMappings, shellContainer } from "./actions"
import type { Cluster } from "../cluster/cluster"
import { findKind, type KindCommand } from "../resources"
import { currentTarget, rowAt, scopedPod, visibleRows } from "./selection"
import type { Session } from "./session"

export function createEditMode({
  session,
  cluster,
  fixed,
  suspend,
  resume,
}: {
  session: Session
  cluster: Cluster
  fixed?: boolean
  suspend: () => Promise<void>
  resume: () => Promise<void>
}) {
  const [editing, setEditing] = createSignal(fixed ?? false)
  const [prompt, setPrompt] = createSignal<{ actionId: string; label: string; value: string; width: number } | null>(null)
  const [notice, setNotice] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [pending, setPending] = createSignal<{ title: string; line: string; command: KindCommand; kind: string; actionId: string } | null>(null)
  let request = 0
  const extra = () => cluster.extraKinds()
  const kindId = createMemo(() => {
    if (session.focus() === "detail") return session.detail()?.kindId ?? session.activeId() ?? ""
    return session.activeId() ?? ""
  })
  const target = createMemo(() => {
    const scope = session.activeId() === "pods" && session.focus() === "list" ? session.containerScope() : null
    if (!scope) return currentTarget(session, cluster)
    const pod = scopedPod(session, cluster)
    const name = pod?.metadata?.name
    if (!pod || !name) return null
    return { kindId: "pods", name, namespace: pod.metadata?.namespace ?? "", object: pod }
  })
  const actions = createMemo(() => {
    const listed = editActions(kindId(), target()?.object.spec?.suspend === true, extra())
    if (session.activeId() === "pods" && session.containerScope() && session.focus() === "list") {
      return listed.filter((action) => action.id === "shell" || action.id === "port-forward")
    }
    return listed
  })
  const pendingView = createMemo(() => {
    const current = pending()
    if (!current) return null
    return { title: current.title, line: current.line }
  })

  const toggle = () => {
    if (fixed !== undefined) return
    setEditing((value) => !value)
    setPrompt(null)
    setPending(null)
    setNotice("")
  }

  const perform = async (command: KindCommand) => {
    if (!command.interactive) {
      await cluster.execute(command)
      return
    }
    await suspend()
    try {
      await cluster.execute(command)
    } finally {
      await resume()
    }
  }

  const finish = (kind: string) => {
    const found = findKind(kind, extra())
    if (!found) return
    void cluster.refresh(found)
    if (found.id === "namespaces") void cluster.refreshNamespaces()
  }

  const pickedContainer = () => {
    const visible = visibleRows(session, cluster)
    if (visible?.type !== "containers" || session.focus() !== "list") return undefined
    return rowAt(visible.shown, session.containerIndex())?.name
  }

  const runEdit = (actionId: string) => {
    if (busy()) return
    const current = target()
    if (!current) {
      setNotice("nothing selected")
      return
    }
    if (actionId === "scale") {
      setNotice("")
      setPrompt({
        actionId,
        label: "replicas",
        value: current.object.spec?.replicas === undefined ? "" : String(current.object.spec.replicas),
        width: 8,
      })
      return
    }
    if (actionId === "port-forward") {
      setNotice("")
      setPrompt({ actionId, label: "ports", value: declaredPorts(current.kindId, current.object).join(" "), width: 24 })
      return
    }
    const action = actions().find((item) => item.id === actionId)
    if (!action) return
    const container = shellContainer(current.object, pickedContainer())
    ask(editCommand(current.kindId, actionId, { name: current.name, namespace: current.namespace, container }, undefined, extra()), current.kindId, action)
  }

  const submitPrompt = (value: string) => {
    const current = prompt()
    const selected = target()
    if (!current || !selected) return
    if (current.actionId === "scale") {
      const replicas = Number(value)
      if (!Number.isInteger(replicas) || replicas < 0) {
        setNotice("replicas must be a whole number")
        return
      }
      setPrompt(null)
      const action = actions().find((item) => item.id === "scale")
      if (!action) return
      ask(editCommand(selected.kindId, "scale", { name: selected.name, namespace: selected.namespace, replicas }, undefined, extra()), selected.kindId, action)
      return
    }
    const ports = portMappings(value)
    if (!ports) {
      setNotice("ports must look like 8080 or 8080:80")
      return
    }
    setPrompt(null)
    const action = actions().find((item) => item.id === "port-forward")
    if (!action) return
    ask(editCommand(selected.kindId, "port-forward", { name: selected.name, namespace: selected.namespace, ports }, undefined, extra()), selected.kindId, action)
  }

  const ask = (command: KindCommand | null, kind: string, action: { id: string; label: string }) => {
    if (!command) return
    setNotice("")
    setPending({ title: action.label, line: commandLine(command, cluster.launchContext()), command, kind, actionId: action.id })
  }

  const accept = () => {
    const current = pending()
    if (!current) return
    setPending(null)
    start(current.command, current.kind, current.actionId)
  }

  const start = (command: KindCommand | null, kind: string, label: string) => {
    if (!command) return
    const token = ++request
    setBusy(true)
    setNotice(`${label}…`)
    void perform(command)
      .then(() => {
        if (token !== request) return
        setNotice("")
        finish(kind)
      })
      .catch((error: unknown) => {
        if (token !== request) return
        setNotice(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (token === request) setBusy(false)
      })
  }

  const handleKey = (key: KeyEvent) => {
    if (pending()) return true
    if (prompt()) {
      if (key.name === "escape") setPrompt(null)
      return true
    }
    if (fixed === undefined && key.name === "e" && !key.ctrl && !key.meta && !key.super && !key.repeated) {
      toggle()
      return true
    }
    if (editing() && key.ctrl && !key.meta && !key.super && !key.repeated) {
      const action = actions().find((item) => item.key === key.name)
      if (action) {
        runEdit(action.id)
        return true
      }
    }
    return false
  }

  return {
    editing,
    toggle,
    actions,
    notice,
    busy,
    prompt,
    submitPrompt,
    pending: pendingView,
    accept,
    cancel: () => setPending(null),
    handleKey,
    run: runEdit,
  }
}

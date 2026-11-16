import type { FocusZone } from "./session"

export interface KeyCommand {
  name: string
  ctrl?: boolean
  meta?: boolean
  super?: boolean
}

export interface WorkspaceActions {
  focus: () => FocusZone
  toggleFocus: () => void
  moveSidebar: (delta: number) => void
  openSidebar: () => void
  moveRow: (delta: number) => void
  cycleTab: (delta: number) => void
  showOwner: () => void
  showControlled: () => void
  closeTab: () => void
  toggleNamespaces: () => void
  moveNamespace: (delta: number) => void
  openNamespace: () => void
  closeNamespaces: () => void
  openDetail: () => void
  closeDetail: () => void
  formatView: () => boolean
  cycleDetail: (delta: number) => void
  scrollDetail: (delta: number) => void
  openNewTab: () => void
  openLogs: () => void
  toggleFollow: () => void
  startFilter: () => void
}

const down = new Set(["down", "j"])
const up = new Set(["up", "k"])
const open = new Set(["return", "enter", "linefeed"])
const close = new Set(["backspace"])

export function runKey(key: KeyCommand, actions: WorkspaceActions): void {
  if (key.ctrl || key.meta || key.super) return

  if (key.name === "]") {
    actions.cycleTab(1)
    return
  }

  if (key.name === "[") {
    actions.cycleTab(-1)
    return
  }

  if (key.name === "q") {
    actions.closeTab()
    return
  }

  if (key.name === "n") {
    actions.toggleNamespaces()
    return
  }

  if (key.name === "t") {
    actions.openNewTab()
    return
  }

  if (key.name === "l") {
    actions.openLogs()
    return
  }

  if (key.name === "d") {
    actions.openDetail()
    return
  }

  if (key.name === "f") {
    if (actions.focus() === "list") {
      actions.startFilter()
      return
    }
    actions.toggleFollow()
    return
  }

  if (key.name === "tab") {
    actions.toggleFocus()
    return
  }

  if (actions.focus() === "detail") {
    if (down.has(key.name)) actions.scrollDetail(1)
    if (up.has(key.name)) actions.scrollDetail(-1)
    if (actions.formatView() && key.name === "left") actions.cycleDetail(-1)
    if (actions.formatView() && key.name === "right") actions.cycleDetail(1)
    if (!actions.formatView() && key.name === "left") actions.showOwner()
    if (!actions.formatView() && key.name === "right") actions.showControlled()
    if (close.has(key.name) || key.name === "escape") actions.closeDetail()
    return
  }

  if (actions.focus() === "namespaces") {
    if (down.has(key.name)) actions.moveNamespace(1)
    if (up.has(key.name)) actions.moveNamespace(-1)
    if (open.has(key.name)) actions.openNamespace()
    if (key.name === "escape") actions.closeNamespaces()
    return
  }

  if (actions.focus() === "sidebar") {
    if (down.has(key.name)) actions.moveSidebar(1)
    if (up.has(key.name)) actions.moveSidebar(-1)
    if (open.has(key.name)) actions.openSidebar()
    return
  }

  if (down.has(key.name)) actions.moveRow(1)
  if (up.has(key.name)) actions.moveRow(-1)
  if (key.name === "left") actions.showOwner()
  if (key.name === "right") actions.showControlled()
  if (close.has(key.name)) actions.closeTab()
  if (open.has(key.name)) actions.openDetail()
}

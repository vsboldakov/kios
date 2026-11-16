export const sidebarWidth = 22
export const kindSidebarWidth = 24 // text budget is width - 3; AuthorizationPolicies is 21
// Empty columns on the right of a resource table. Scrollbar position "absolute" draws over them.
export const listGutter = 2

export function listWidth(terminalWidth: number): number {
  return Math.max(20, terminalWidth - kindSidebarWidth - sidebarWidth - 4 - listGutter)
}

export const theme = {
  bg: "#0a0a0a",
  panel: "#141414",
  element: "#1e1e1e",
  border: "#484848",
  primary: "#fab283",
  fg: "#eeeeee",
  muted: "#808080",
  selected: "#0a0a0a",
  ready: "#7fd88f",
  dot: "#5dae78",
  progress: "#f5a742",
  error: "#e06c75",
}

export const splitBorder = {
  topLeft: "",
  topRight: "",
  bottomLeft: "╹",
  bottomRight: "",
  horizontal: " ",
  vertical: "┃",
  topT: "",
  bottomT: "",
  leftT: "",
  rightT: "",
  cross: "",
}

export function toneColor(tone: "ready" | "progress" | "muted" | undefined): string {
  if (tone === "ready") return theme.ready
  if (tone === "progress") return theme.progress
  if (tone === "muted") return theme.muted
  return theme.fg
}

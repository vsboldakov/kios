import { RGBA } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { Show, createSignal } from "solid-js"
import { CopiedToast } from "./copied-toast"
import { theme } from "./theme"

const submit = new Set(["return", "enter", "linefeed"])

const choices = ["copy", "cancel", "confirm"] as const

export function ConfirmDialog(props: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  onCopy: (text: string) => void
}) {
  const dimensions = useTerminalDimensions()
  const [active, setActive] = createSignal<(typeof choices)[number]>("confirm")
  const [copied, setCopied] = createSignal(0)
  const panelWidth = () => Math.min(60, Math.max(24, dimensions().width - 2))
  const copy = () => {
    props.onCopy(props.message)
    setCopied((count) => count + 1)
  }

  useKeyboard((key) => {
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") {
      props.onCancel()
      return
    }
    if (key.name === "left" || key.name === "right") {
      const next = choices.indexOf(active()) + (key.name === "right" ? 1 : -1)
      const choice = choices[next]
      if (choice) setActive(choice)
      return
    }
    if (!submit.has(key.name)) return
    const choice = active()
    if (choice === "confirm") props.onConfirm()
    if (choice === "cancel") props.onCancel()
    if (choice === "copy") copy()
  })

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      paddingTop={Math.floor(dimensions().height / 4)}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      zIndex={2}
      onMouseUp={props.onCancel}
    >
      <box
        width={panelWidth()}
        backgroundColor={theme.panel}
        paddingTop={1}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
      >
        <box paddingLeft={2} paddingRight={2} gap={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.fg} selectable={false}>
              <b>{props.title}</b>
            </text>
            <text fg={theme.muted} selectable={false} onMouseUp={props.onCancel}>
              esc
            </text>
          </box>
          <box paddingBottom={1}>
            <text fg={theme.muted} wrapMode="char" width={panelWidth() - 4}>
              {props.message}
            </text>
          </box>
          <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
            <Choice label="Copy" on={active() === "copy"} onHover={() => setActive("copy")} onPick={copy} />
            <box flexDirection="row">
              <Choice label="Cancel" on={active() === "cancel"} onHover={() => setActive("cancel")} onPick={props.onCancel} />
              <Choice label="Confirm" on={active() === "confirm"} onHover={() => setActive("confirm")} onPick={props.onConfirm} />
            </box>
          </box>
        </box>
      </box>
      <Show when={copied()}>
        <CopiedToast pulse={copied()} onDismiss={() => setCopied(0)} />
      </Show>
    </box>
  )
}

function Choice(props: { label: string; on: boolean; onHover: () => void; onPick: () => void }) {
  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={props.on ? theme.primary : theme.panel}
      onMouseOver={props.onHover}
      onMouseUp={(event) => {
        event.stopPropagation()
        props.onPick()
      }}
    >
      <text fg={props.on ? theme.selected : theme.muted} selectable={false}>
        {props.label}
      </text>
    </box>
  )
}

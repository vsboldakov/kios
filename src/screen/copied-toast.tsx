import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, onCleanup } from "solid-js"
import { theme } from "./theme"

const toastMs = 5000

// Only the side bars are drawn; the other edges stay empty.
const toastBorder = {
  topLeft: "",
  topRight: "",
  bottomLeft: "",
  bottomRight: "",
  horizontal: " ",
  vertical: "┃",
  topT: "",
  bottomT: "",
  leftT: "",
  rightT: "",
  cross: "",
}

export function CopiedToast(props: { pulse: number; onDismiss: () => void }) {
  const dimensions = useTerminalDimensions()
  let hide: ReturnType<typeof setTimeout> | undefined
  const clearHide = () => {
    if (!hide) return
    clearTimeout(hide)
    hide = undefined
  }
  const arm = () => {
    clearHide()
    hide = setTimeout(() => props.onDismiss(), toastMs)
  }
  createEffect(() => {
    props.pulse
    arm()
  })
  onCleanup(clearHide)

  return (
    <box
      position="absolute"
      top={1}
      right={2}
      maxWidth={Math.min(60, dimensions().width - 6)}
      border={["left", "right"]}
      borderColor={theme.primary}
      customBorderChars={toastBorder}
      zIndex={1}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseOver={clearHide}
      onMouseOut={arm}
      onMouseUp={(event) => {
        event.stopPropagation()
        clearHide()
        props.onDismiss()
      }}
    >
      <box
        width="100%"
        flexDirection="row"
        gap={2}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={theme.panel}
      >
        <text fg={theme.fg} wrapMode="word" selectable={false}>
          Copied to clipboard
        </text>
        <text fg={theme.muted} selectable={false}>
          x
        </text>
      </box>
    </box>
  )
}

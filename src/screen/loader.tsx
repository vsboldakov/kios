import { createIntervalCounter } from "@solid-primitives/timer"
import { theme } from "./theme"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Loader(props: { label: string }) {
  const tick = createIntervalCounter(80)
  return (
    <text fg={theme.muted} selectable={false}>
      {`${frames[tick() % frames.length]} ${props.label}`}
    </text>
  )
}

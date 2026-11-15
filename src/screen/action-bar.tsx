import type { InputRenderable } from "@opentui/core"
import { Show } from "solid-js"
import type { EditAction } from "../workspace/actions"
import { theme } from "./theme"

export function ActionBar(props: {
  actions: readonly EditAction[]
  notice: string
  busy: boolean
  prompt: { label: string; value: string; width: number } | null
  onPrompt: (value: string) => void
}) {
  return (
    <box
      height={1}
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={theme.bg}
    >
      <Show
        when={props.prompt}
        fallback={
          <text fg={props.busy ? theme.muted : theme.error} selectable={false}>
            {props.notice}
          </text>
        }
      >
        {(prompt) => (
          <box flexDirection="row" height={1}>
            <text fg={theme.fg} selectable={false}>
              {prompt().label}{" "}
            </text>
            <input
              ref={(value: InputRenderable) => {
                value.value = prompt().value
                value.focus()
              }}
              focused
              width={prompt().width}
              backgroundColor={theme.bg}
              textColor={theme.fg}
              focusedTextColor={theme.fg}
              onSubmit={props.onPrompt}
            />
          </box>
        )}
      </Show>
      <Show when={!props.prompt}>
        <text fg={theme.fg} selectable={false}>
          {props.actions.toReversed().map((action) => `ctrl+${action.key} ${action.label}`).join("   ")}
        </text>
      </Show>
    </box>
  )
}

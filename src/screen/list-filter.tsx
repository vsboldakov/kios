import type { InputRenderable } from "@opentui/core"
import { For, Show } from "solid-js"
import { fitMatch } from "../workspace/filter"
import { theme } from "./theme"

export function ListFilter(props: {
  query: string
  editing: boolean
  onInput: (value: string) => void
  onSubmit: () => void
  onEdit: () => void
}) {
  return (
    <Show when={props.editing || props.query}>
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        paddingLeft={2}
        paddingRight={1}
        backgroundColor={theme.panel}
        onMouseDown={(event) => {
          event.stopPropagation()
          props.onEdit()
        }}
      >
        <text fg={theme.muted} selectable={false}>
          filter:{" "}
        </text>
        <Show
          when={props.editing}
          fallback={
            <box flexGrow={1} flexDirection="row" justifyContent="space-between">
              <text fg={theme.fg} selectable={false}>
                {props.query}
              </text>
              <text fg={theme.muted} selectable={false}>
                esc
              </text>
            </box>
          }
        >
          <box flexGrow={1} minWidth={0}>
            <input
              ref={(value: InputRenderable) => {
                value.value = props.query
                value.focus()
              }}
              focused
              width="100%"
              placeholder="name"
              placeholderColor={theme.muted}
              backgroundColor={theme.panel}
              focusedBackgroundColor={theme.panel}
              textColor={theme.fg}
              focusedTextColor={theme.fg}
              onInput={props.onInput}
              onSubmit={props.onSubmit}
            />
          </box>
        </Show>
      </box>
    </Show>
  )
}

export function MatchedText(props: { text: string; query: string; width: number; covered: boolean }) {
  return (
    <For each={fitMatch(props.text, props.query, props.width)}>
      {(part) => (
        <span style={{ fg: part.match ? theme.primary : undefined, bg: part.match && props.covered ? theme.bg : undefined }}>{part.text}</span>
      )}
    </For>
  )
}

import { For } from "solid-js"
import { fit, fitParts, type Cell } from "../resources"
import { MatchedText } from "./list-filter"
import { theme, toneColor } from "./theme"

export function Cells(props: {
  columns: readonly { id: string; width: number }[]
  widths: number[]
  values: Cell[]
  background: string
  fg?: string
  query?: string
}) {
  return (
    <box height={1} width="100%" flexShrink={0} flexDirection="row" backgroundColor={props.background} paddingLeft={2}>
      <For each={props.columns}>
        {(column, index) => (
          <text
            fg={props.fg ?? (props.values[index()]?.parts ? undefined : toneColor(props.values[index()]?.tone))}
            bg={props.background}
          >
            {column.id === "name" && props.query ? (
              <MatchedText
                text={props.values[index()]?.text ?? ""}
                query={props.query}
                width={props.widths[index()] ?? column.width}
                covered={Boolean(props.fg)}
              />
            ) : (
              renderCell(props.values[index()], props.widths[index()] ?? column.width)
            )}
            {index() < props.columns.length - 1 ? "  " : ""}
          </text>
        )}
      </For>
    </box>
  )
}

function renderCell(value: Cell | undefined, width: number) {
  const parts = value?.parts
  if (!parts) return fit(value?.text ?? "", width)
  return (
    <For each={fitParts(parts, width)}>
      {(part) => <span style={{ fg: part.tone === "ready" ? theme.dot : part.tone ? toneColor(part.tone) : undefined }}>{part.text}</span>}
    </For>
  )
}

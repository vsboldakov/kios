import type { Cell, PodContainer } from "../resources"
import { sortByText, type ColumnSort } from "./sort"

export const containerColumns: { id: string; header: string; width: number; grow?: boolean; cell: (row: PodContainer) => Cell }[] = [
  { id: "name", header: "NAME", width: 12, grow: true, cell: (row) => ({ text: row.name }) },
  { id: "type", header: "TYPE", width: 10, cell: (row) => ({ text: row.type }) },
  { id: "status", header: "STATUS", width: 12, cell: (row) => ({ text: row.status, tone: row.tone }) },
  { id: "restarts", header: "RESTARTS", width: 8, cell: (row) => ({ text: String(row.restarts) }) },
  { id: "cpu", header: "CPU", width: 12, cell: (row) => ({ text: row.cpu }) },
  { id: "memory", header: "MEM", width: 14, cell: (row) => ({ text: row.memory }) },
  { id: "image", header: "IMAGE", width: 16, grow: true, cell: (row) => ({ text: row.image }) },
]

export function orderedContainers(rows: readonly PodContainer[], sort: ColumnSort | null): readonly PodContainer[] {
  if (!sort) return rows
  const column = containerColumns.find((item) => item.id === sort.column)
  if (!column) return rows
  return sortByText(rows, (row) => column.cell(row).text, sort.desc)
}

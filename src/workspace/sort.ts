import { parseQuantity } from "../resources/quantity"

export interface ColumnSort {
  column: string
  desc: boolean
}

const alphabet = "abcdefghijklmnopqrstuvwxyz"

export function columnLetters(headers: readonly string[]): string[] {
  const choices = headers.map(headerLetters)
  const letters = choices.map(() => "")
  const used = new Set<string>()
  const firsts = choices.map((choice) => choice[0] ?? "")
  choices.forEach((choice, index) => {
    const letter = choice[0]
    if (!letter || firsts.filter((item) => item === letter).length !== 1) return
    letters[index] = letter
    used.add(letter)
  })
  const pending = choices
    .map((choice, index) => ({ choice, index }))
    .filter((item) => !letters[item.index])
    .sort((left, right) => headers[left.index].length - headers[right.index].length || left.index - right.index)
  for (const item of pending) {
    const letter = item.choice.find((char) => !used.has(char)) ?? [...alphabet].find((char) => !used.has(char))
    if (!letter) continue
    letters[item.index] = letter
    used.add(letter)
  }
  return letters
}

export function columnHeader(header: string, hint: string, desc: boolean | null): string {
  const prefix = hint ? `[${hint}] ` : ""
  const mark = desc === null ? "" : desc ? " ↓" : " ↑"
  return `${prefix}${header}${mark}`
}

export function sortByText<T>(items: readonly T[], text: (item: T) => string, desc: boolean): T[] {
  return items
    .map((item, index) => ({ item, index, value: text(item) }))
    .sort((left, right) => compareEntries(left, right, desc))
    .map((entry) => entry.item)
}

function headerLetters(header: string): string[] {
  return [...header.toLowerCase()].filter((char, index, all) => char >= "a" && char <= "z" && all.indexOf(char) === index)
}

function compareEntries(left: { index: number; value: string }, right: { index: number; value: string }, desc: boolean): number {
  if (left.value === right.value) return left.index - right.index
  if (!left.value) return 1
  if (!right.value) return -1
  const order = comparePresent(left.value, right.value)
  return desc ? -order : order
}

function comparePresent(left: string, right: string): number {
  const leftQuantity = parseQuantity(left)
  const rightQuantity = parseQuantity(right)
  if (leftQuantity !== undefined && rightQuantity !== undefined && leftQuantity !== rightQuantity) return leftQuantity - rightQuantity
  const leftAge = ageSeconds(left)
  const rightAge = ageSeconds(right)
  if (leftAge !== undefined && rightAge !== undefined && leftAge !== rightAge) return leftAge - rightAge
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
}

function ageSeconds(value: string): number | undefined {
  const match = /^(\d+)([smhd])$/.exec(value)
  if (!match) return undefined
  const amount = Number(match[1])
  const unit = match[2]
  const scale = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400
  return amount * scale
}

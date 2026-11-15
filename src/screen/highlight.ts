import type { DetailTab } from "../workspace/session"
import { theme } from "./theme"

export interface HighlightSpan {
  text: string
  fg: string
}

// shortcut: one line at a time, switch to a grammar when a document needs strings that cross lines
export function highlight(format: DetailTab, line: string): HighlightSpan[] {
  if (!line) return [{ text: " ", fg: theme.fg }]
  if (format === "json") return scanJson(line)
  if (format === "yaml") return scanYaml(line)
  return scanDescribe(line)
}

function collector() {
  const list: HighlightSpan[] = []
  return {
    list,
    push(text: string, fg: string) {
      if (!text) return
      const last = list[list.length - 1]
      if (last && last.fg === fg) last.text += text
      else list.push({ text, fg })
    },
  }
}

function scanJson(line: string): HighlightSpan[] {
  const out = collector()
  let i = 0
  while (i < line.length) {
    const ch = line[i]!
    if (ch === '"') {
      const start = i
      i = endString(line, i)
      let j = i
      while (line[j] === " ") j++
      out.push(line.slice(start, i), line[j] === ":" ? theme.primary : theme.ready)
      continue
    }
    const word = keyword(line, i, ["false", "true", "null"])
    if (word) {
      out.push(word, word === "true" ? theme.ready : word === "false" ? theme.error : theme.muted)
      i += word.length
      continue
    }
    if (isNumber(line, i)) {
      const start = i
      i = endNumber(line, i)
      out.push(line.slice(start, i), theme.progress)
      continue
    }
    out.push(ch, "{}[]:,".includes(ch) ? theme.muted : theme.fg)
    i++
  }
  return out.list
}

function scanYaml(line: string): HighlightSpan[] {
  const key = /^(\s*(?:-\s+)?)((?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[A-Za-z0-9_./-]+))(\s*:\s*)(.*)$/.exec(line)
  if (!key) return scanValue(line)
  const out = collector()
  out.push(key[1] ?? "", theme.muted)
  out.push(key[2] ?? "", theme.primary)
  out.push(key[3] ?? "", theme.muted)
  for (const span of scanValue(key[4] ?? "")) out.push(span.text, span.fg)
  return out.list
}

function scanDescribe(line: string): HighlightSpan[] {
  const key = /^(\s*)([A-Za-z][\w ./-]*?)(:\s*)(.*)$/.exec(line)
  if (!key) return [{ text: line, fg: /^-{3,}$/.test(line.trim()) ? theme.muted : theme.fg }]
  const out = collector()
  out.push(key[1] ?? "", theme.fg)
  out.push(key[2] ?? "", theme.primary)
  out.push(key[3] ?? "", theme.muted)
  out.push(key[4] ?? "", describeValue(key[4] ?? ""))
  return out.list
}

function scanValue(line: string): HighlightSpan[] {
  const out = collector()
  let i = 0
  while (i < line.length) {
    const ch = line[i]!
    if (ch === "#") {
      out.push(line.slice(i), theme.muted)
      break
    }
    if (ch === '"' || ch === "'") {
      const start = i
      i = endString(line, i)
      out.push(line.slice(start, i), theme.ready)
      continue
    }
    const word = keyword(line, i, ["false", "true", "null", "yes", "no"])
    if (word) {
      const on = word === "true" || word === "yes"
      out.push(word, on ? theme.ready : word === "null" ? theme.muted : theme.error)
      i += word.length
      continue
    }
    if (ch === "~" && !ident(line[i + 1])) {
      out.push("~", theme.muted)
      i++
      continue
    }
    if (isNumber(line, i)) {
      const start = i
      i = endNumber(line, i)
      out.push(line.slice(start, i), theme.progress)
      continue
    }
    out.push(ch, theme.fg)
    i++
  }
  return out.list
}

function describeValue(value: string): string {
  const word = value.trim()
  if (word === "<none>" || word === "<unset>") return theme.muted
  if (/^(Running|True|Ready|Bound|Active|Succeeded|Completed|Normal)$/.test(word)) return theme.ready
  if (/^(False|Error|Failed|CrashLoopBackOff|Pending|Unknown|Warning|Evicted|OOMKilled)$/.test(word)) return theme.error
  return theme.fg
}

function keyword(line: string, index: number, words: string[]): string | null {
  if (ident(line[index - 1])) return null
  for (const word of words) {
    if (!line.startsWith(word, index)) continue
    if (ident(line[index + word.length])) continue
    return word
  }
  return null
}

function ident(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch)
}

function isNumber(line: string, index: number): boolean {
  if (ident(line[index - 1])) return false
  const ch = line[index]
  if (ch === "-") return /[0-9]/.test(line[index + 1] ?? "")
  return ch !== undefined && ch >= "0" && ch <= "9"
}

function endNumber(line: string, index: number): number {
  let i = index + 1
  while (i < line.length && /[0-9.eE+-]/.test(line[i]!)) i++
  return i
}

function endString(line: string, index: number): number {
  const quote = line[index]
  let i = index + 1
  while (i < line.length) {
    if (line[i] === "\\") {
      i += 2
      continue
    }
    if (line[i] === quote) return i + 1
    i++
  }
  return line.length
}

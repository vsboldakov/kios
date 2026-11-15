import type { JSX } from "@opentui/solid"
import { keyArray } from "@solid-primitives/keyed"
import type { Accessor } from "solid-js"

export function Keyed<T>(props: {
  each: readonly T[] | null | undefined | false
  by: (item: T) => string
  fallback?: JSX.Element
  children: (item: Accessor<T>, index: Accessor<number>) => JSX.Element
}): JSX.Element {
  const rendered = keyArray(
    () => props.each,
    (item) => props.by(item),
    (item, index) => props.children(item, index),
    props.fallback !== undefined ? { fallback: () => props.fallback } : undefined,
  )
  return rendered as unknown as JSX.Element
}

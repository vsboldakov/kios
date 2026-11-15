import type { ScrollBoxRenderable } from "@opentui/core"

let scroller: ScrollBoxRenderable | undefined

export function scrollDetail(delta: number) {
  scroller?.scrollBy(delta * 3)
}

export function stickDetailScroll() {
  scroller?.scrollTo(Number.POSITIVE_INFINITY)
}

export function bindDetailScroll(value: ScrollBoxRenderable | undefined) {
  scroller = value
}

export function resetDetailScroll() {
  scroller?.scrollTo(0)
}

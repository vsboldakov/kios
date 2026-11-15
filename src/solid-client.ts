import { plugin } from "bun"
import { readFile } from "node:fs/promises"

// @opentui/solid rewrites solid-js and solid-js/store. solid-primitives still reads isServer from solid-js/web.
const key = Symbol.for("kios.solid-web")
const state = globalThis as Record<symbol, { installed?: boolean }>
if (!state[key]?.installed) {
  plugin({
    name: "kios-solid-web",
    setup(build) {
      build.onLoad({ filter: /[/\\]solid-js[/\\]web[/\\]dist[/\\]server\.js(?:[?#].*)?$/ }, async (args) => {
        const path = args.path.replace(/[?#].*$/, "").replace(/server\.js$/, "web.js")
        return { contents: await readFile(path, "utf8"), loader: "js" }
      })
    },
  })
  state[key] = { installed: true }
}

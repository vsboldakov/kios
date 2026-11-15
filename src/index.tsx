#!/usr/bin/env bun
import "@opentui/solid/preload"
import "./solid-client"

const { render } = await import("@opentui/solid")
const { App } = await import("./app")
const { createKubectlClient } = await import("./cluster/kubectl")

// shortcut: letters show only if the terminal reports shift itself, drop these flags when the renderer exposes that directly
await render(() => <App client={createKubectlClient()} />, {
  exitOnCtrlC: true,
  useKittyKeyboard: { events: true, allKeysAsEscapes: true },
})

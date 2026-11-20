// Bun resolves a bunfig preload from the cwd, so import the plugin from this package.
// Dynamic import: index.tsx is JSX and must compile after the plugin is registered.
import "@opentui/solid/preload"
import "../src/solid-client.ts"

await import("../src/index.tsx")

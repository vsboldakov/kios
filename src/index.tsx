#!/usr/bin/env bun
import "@opentui/solid/preload"
import "./solid-client"
import arg from "arg"

const usage = `Usage: kios [--context name] [-n namespace] [--readonly | --allowedit]

  -c, --context <name>    kubeconfig context
  -n, --namespace <name>  namespace to open
      --readonly          keep edit mode off
      --allowedit         keep edit mode on
  -h, --help              show this help`

const flags = readFlags(Bun.argv.slice(2))
if ("help" in flags) {
  console.log(usage)
  process.exit(0)
}
if ("error" in flags) {
  console.error(flags.error)
  console.error(`\n${usage}`)
  process.exit(1)
}

// Same binary kubectlBin() spawns. Fail before render() takes the terminal.
const bin = process.env.KIOS_KUBECTL?.trim() || "kubectl"
if (!Bun.which(bin)) {
  console.error(missingExecutable(bin))
  process.exit(1)
}

const { render } = await import("@opentui/solid")
const { App } = await import("./app")
const { createKubectlClient } = await import("./cluster/kubectl")

// shortcut: letters show only if the terminal reports shift itself, drop these flags when the renderer exposes that directly
await render(() => <App client={createKubectlClient(flags.context)} namespace={flags.namespace} edit={flags.edit} />, {
  exitOnCtrlC: true,
  useKittyKeyboard: { events: true, allKeysAsEscapes: true },
})

function missingExecutable(bin: string): string {
  try {
    Bun.spawnSync([bin], { stdout: "ignore", stderr: "ignore" })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return `Executable not found in $PATH: "${bin}"`
}

function readFlags(argv: string[]) {
  try {
    const parsed = arg(
      {
        "--help": Boolean,
        "--context": requiredValue,
        "--namespace": requiredValue,
        "--readonly": Boolean,
        "--allowedit": Boolean,
        "-h": "--help",
        "-c": "--context",
        "-n": "--namespace",
      },
      { argv },
    )
    if (parsed["--help"]) return { help: true }
    const extra = parsed._[0]
    if (extra) return { error: `unexpected argument: ${extra}` }
    if (parsed["--readonly"] && parsed["--allowedit"]) return { error: "--readonly and --allowedit cannot be used together" }
    return {
      context: parsed["--context"] ?? "",
      namespace: parsed["--namespace"] ?? "",
      edit: parsed["--readonly"] ? false : parsed["--allowedit"] ? true : undefined,
    }
  } catch (error) {
    if (error instanceof arg.ArgError) return { error: error.message }
    throw error
  }
}

function requiredValue(input: string, name: string) {
  const value = input.trim()
  if (value) return value
  throw new arg.ArgError(`option requires argument: ${name}`, "ARG_MISSING_REQUIRED_LONGARG")
}

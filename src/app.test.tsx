import { setRendererCapabilities } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { editCommand } from "./workspace/actions"
import { App } from "./app"
import type { ClusterClient } from "./cluster/cluster"
import type { KubernetesObject, ResourceKind } from "./resources"
import { builtinKinds } from "./resources/builtin"

function resource(name: string, ready: number, desired: number, daemon = false, namespace = "default"): KubernetesObject {
  return {
    metadata: {
      uid: `${namespace}/${name}`,
      name,
      namespace,
      creationTimestamp: new Date(Date.now() - 3_600_000).toISOString(),
    },
    spec: daemon ? undefined : { replicas: desired },
    status: daemon ? { numberReady: ready, desiredNumberScheduled: desired } : { readyReplicas: ready },
  }
}

const client: ClusterClient = {
  async currentContext() {
    return "demo"
  },
  async namespaces() {
    return ["default"]
  },
  async list(kind: ResourceKind) {
    if (kind.id === "deployments") return [resource("worker", 1, 2), resource("api", 2, 2)]
    if (kind.id === "statefulsets") return [resource("db", 1, 1)]
    return [resource("logger", 3, 3, true)]
  },
  async inspect() {
    return { describe: "", yaml: "", json: "" }
  },
  async logs() {
    return ""
  },
  followLogs() {
    return () => {}
  },
  async execute() {},
}

test("shows kinds in the sidebar and resources in the active tab", async () => {
  const setup = await testRender(() => <App client={client} />, { width: 112, height: 28 })
  try {
    const alone = await setup.waitForFrame((frame) => frame.includes("Pods"))
    expect(alone).not.toContain("x")
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressKey("t")
    const first = await setup.waitForFrame((frame) => frame.includes("default/api"))
    expect(first).toContain("x")
    expect(first).toContain("Pods")
    expect(first).toContain("Deployments")
    expect(first).toContain("StatefulSets")
    expect(first).toContain("DaemonSets")
    expect(first).toContain("HPAs")
    expect(first).not.toContain("HorizontalPodAutoscalers")
    expect(first).toContain("NAMESPACE")
    expect(first).toContain("api")
    expect(first).toContain("worker")

    setup.mockInput.pressArrow("down")
    await setup.waitForFrame((frame) => frame.includes("default/worker"))

    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    const stateful = await setup.waitForFrame((frame) => frame.includes("default/db"))
    expect(stateful).toContain("Ready")

    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/logger"))
  } finally {
    await setup.dispose()
  }
})

test("filters the active list by part of a name", async () => {
  const setup = await testRender(() => <App client={client} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("worker") && frame.includes("api"))
    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("enter list"))
    await setup.mockInput.typeText("api")
    const filtered = await setup.waitForFrame((frame) => frame.includes("api") && !frame.includes("worker"))
    expect(filtered).toContain("filter:")
    expect(filtered).toContain("1/2")
    setup.mockInput.pressEnter()
    const kept = await setup.waitForFrame((frame) => !frame.includes("enter list") && !frame.includes("worker"))
    expect(kept).toContain("api")
    setup.mockInput.pressEscape()
    await Bun.sleep(80)
    const restored = await setup.waitForFrame((frame) => frame.includes("worker"))
    expect(restored).toContain("api")
    expect(restored).not.toContain("enter list")
  } finally {
    await setup.dispose()
  }
})

test("sorts the list from the column letter shown while shift is held", async () => {
  const setup = await testRender(() => <App client={client} />, {
    width: 112,
    height: 28,
    useKittyKeyboard: { events: true, allKeysAsEscapes: true },
  })
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("worker") && frame.indexOf("api") < frame.indexOf("worker"))
    setup.renderer.stdin.emit("data", Buffer.from("\x1b[57441u"))
    const hinted = await setup.waitForFrame((frame) => frame.includes("[n]") && frame.includes("[r]"))
    expect(hinted).toContain("[a]")
    setup.mockInput.pressKey("r", { shift: true })
    await setup.waitForFrame((frame) => frame.indexOf("worker") < frame.indexOf("api"))
    setup.renderer.stdin.emit("data", Buffer.from("\x1b[57441;1:3u"))
    const released = await setup.waitForFrame((frame) => frame.includes("READY ↑") && !frame.includes("[r]"))
    expect(released.indexOf("worker")).toBeLessThan(released.indexOf("api"))
    setup.renderer.stdin.emit("data", Buffer.from("\x1b[57441u"))
    setup.mockInput.pressKey("r", { shift: true })
    await setup.waitForFrame((frame) => frame.indexOf("api") < frame.indexOf("worker"))
    setup.renderer.stdin.emit("data", Buffer.from("\x1b[57441;1:3u"))
    const reversed = await setup.waitForFrame((frame) => frame.includes("READY ↓") && !frame.includes("[r]"))
    expect(reversed.indexOf("api")).toBeLessThan(reversed.indexOf("worker"))
  } finally {
    await setup.dispose()
  }
})

test("filters the list to the namespace chosen on the right", async () => {
  const namespaced: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["kube-system", "default", "empty-ns"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 2, 2), resource("worker", 1, 1, false, "kube-system")]
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={namespaced} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/api") && frame.includes("worker"))
    setup.mockInput.pressKey("n")
    await setup.waitForFrame((frame) => frame.includes("empty-ns"))
    setup.mockInput.pressArrow("down")
    await setup.waitForVisualIdle()
    const pending = setup.captureCharFrame()
    expect(pending).toContain("api")
    expect(pending).toContain("worker")
    setup.mockInput.pressEnter()
    const onlyDefault = await setup.waitForFrame((frame) => frame.includes("api") && !frame.includes("worker"))
    expect(onlyDefault).toContain("all namespaces")
    expect(onlyDefault).toContain("default/Deployments")
    setup.mockInput.pressKey("n")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    const onlySystem = await setup.waitForFrame((frame) => frame.includes("worker") && !frame.includes("api"))
    expect(onlySystem).toContain("kube-system")
  } finally {
    await setup.dispose()
  }
})

test("opens the context and namespace given at launch", async () => {
  const scoped: ClusterClient = {
    context: "prod",
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default", "payments"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 1, 1, false, "payments"), resource("worker", 1, 1)]
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={scoped} namespace="payments" />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("prod"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressKey("t")
    const opened = await setup.waitForFrame((frame) => frame.includes("payments/api") && !frame.includes("worker"))
    expect(opened).toContain("payments/Deployments")
    expect(opened).toContain("all namespaces")
    expect(opened).not.toContain("demo")
  } finally {
    await setup.dispose()
  }
})

test("filters namespaces by part of a name", async () => {
  const namespaced: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["kube-system", "default", "empty-ns"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 2, 2), resource("worker", 1, 1, false, "kube-system")]
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={namespaced} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/api") && frame.includes("all namespaces"))
    setup.mockInput.pressKey("n")
    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("enter list"))
    await setup.mockInput.typeText("empty")
    const filtered = await setup.waitForFrame((frame) => frame.includes("empty-ns") && !frame.includes("all namespaces"))
    expect(filtered).toContain("filter:")
    expect(filtered).toContain("api")
    setup.mockInput.pressEscape()
    await Bun.sleep(80)
    const restored = await setup.waitForFrame((frame) => frame.includes("all namespaces") && frame.includes("enter select"))
    expect(restored).not.toContain("filter:")
    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("enter list"))
    await setup.mockInput.typeText("kube")
    await setup.waitForFrame((frame) => frame.includes("kube-system") && !frame.includes("all namespaces"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => !frame.includes("enter list") && frame.includes("kube-system"))
    setup.mockInput.pressEnter()
    const onlySystem = await setup.waitForFrame((frame) => frame.includes("worker") && !frame.includes("api"))
    expect(onlySystem).toContain("kube-system/worker")
    expect(onlySystem).toContain("filter:")
  } finally {
    await setup.dispose()
  }
})

test("opens describe, yaml, and json for the selected resource", async () => {
  const inspected: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 2, 2)]
    },
    async inspect() {
      return { describe: "DESCRIBE api", yaml: "YAML api", json: "JSON api" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={inspected} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    const listed = await setup.waitForFrame((frame) => frame.includes("default/api"))
    expect(listed).toContain("d describe")
    setup.mockInput.pressEnter()
    const described = await setup.waitForFrame((frame) => frame.includes("DESCRIBE api"))
    expect(described).toContain("Describe")
    expect(described).toContain("YAML")
    expect(described).toContain("JSON")
    expect(described).toContain("← → view")
    expect(described).toContain("[ ] tabs")
    setup.mockInput.pressTab()
    const sidebar = await setup.waitForFrame((frame) => frame.includes("enter open") && !frame.includes("DESCRIBE api"))
    expect(sidebar).not.toContain("j/k select")
    setup.mockInput.pressTab()
    await setup.waitForFrame((frame) => frame.includes("DESCRIBE api"))
    setup.mockInput.pressKey("]")
    setup.mockInput.pressArrow("right")
    await setup.waitForFrame((frame) => frame.includes("YAML api"))
    setup.mockInput.pressArrow("right")
    await setup.waitForFrame((frame) => frame.includes("JSON api"))
    setup.mockInput.pressKey("d")
    const describedAgain = await setup.waitForFrame((frame) => frame.includes("DESCRIBE api") && !frame.includes("JSON api"))
    expect(describedAgain).toContain("d describe")
    // A lone escape is disambiguated on a timer, so the close has to wait for it.
    setup.mockInput.pressEscape()
    await Bun.sleep(80)
    const closed = await setup.waitForFrame((frame) => frame.includes("default/api") && !frame.includes("DESCRIBE api"))
    expect(closed).not.toContain("YAML api")
    setup.mockInput.pressKey("d")
    await setup.waitForFrame((frame) => frame.includes("DESCRIBE api"))
  } finally {
    await setup.dispose()
  }
})

test("shows logs for a selected workload and hides the hint otherwise", async () => {
  const logged: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id === "pods" || kind.id === "configmaps") return [resource("api", 1, 1)]
      return []
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs(_kind: ResourceKind, name: string, _namespace: string, previous?: boolean) {
      return previous ? `PREV ${name}` : `LOG ${name}`
    },
    followLogs(_kind: ResourceKind, name: string, _namespace: string, onText: (text: string) => void) {
      onText(`FOLLOW ${name}`)
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={logged} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Nodes"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    const pods = await setup.waitForFrame((frame) => frame.includes("default/api"))
    expect(pods).toContain("l logs   / menu")
    setup.mockInput.pressKey("l")
    const logs = await setup.waitForFrame((frame) => frame.includes("LOG api"))
    expect(logs).toContain("f follow")
    const hint = logs.split("\n").find((line) => line.includes("f follow")) ?? ""
    expect(hint).not.toContain("←")
    expect(hint).not.toContain("→")
    setup.mockInput.pressKey("f")
    const followed = await setup.waitForFrame((frame) => frame.includes("FOLLOW api"))
    expect(followed).toContain("f following")
    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("LOG api") && frame.includes("f follow"))
    setup.mockInput.pressKey("p")
    const previous = await setup.waitForFrame((frame) => frame.includes("PREV api"))
    expect(previous).toContain("default/api previous")
    expect(previous).toContain("p current")
    setup.mockInput.pressKey("f")
    const followedAgain = await setup.waitForFrame((frame) => frame.includes("FOLLOW api"))
    expect(followedAgain).toContain("f following")
    expect(followedAgain).not.toContain("PREV api")
    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("LOG api") && frame.includes("p previous"))
    setup.mockInput.pressBackspace()
    await setup.waitForFrame((frame) => frame.includes("default/api") && !frame.includes("LOG api"))
    setup.mockInput.pressTab()
    for (let step = 0; step < 6; step += 1) setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    const maps = await setup.waitForFrame((frame) => frame.includes("DATA") && frame.includes("api"))
    expect(maps).not.toContain("l logs")
    setup.mockInput.pressKey("l")
    await setup.waitForVisualIdle()
    expect(setup.captureCharFrame()).not.toContain("LOG api")
  } finally {
    await setup.dispose()
  }
})

test("switches between one container and every container", async () => {
  const pod: KubernetesObject = {
    metadata: {
      uid: "default/api",
      name: "api",
      namespace: "default",
      creationTimestamp: new Date(Date.now() - 3_600_000).toISOString(),
    },
    spec: { containers: [{ name: "app" }, { name: "sidecar" }] },
    status: { phase: "Running" },
  }
  const logged: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id === "pods") return [pod]
      return []
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs(_kind: ResourceKind, _name: string, _namespace: string, _previous?: boolean, container?: string) {
      return container ? `LOG ${container}` : "LOG all"
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={logged} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Nodes"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/api"))
    setup.mockInput.pressKey("l")
    const logs = await setup.waitForFrame((frame) => frame.includes("LOG all"))
    expect(logs).toContain("← → container")
    expect(logs).not.toContain("default/api/app")
    setup.mockInput.pressArrow("right")
    const app = await setup.waitForFrame((frame) => frame.includes("LOG app"))
    expect(app).toContain("default/api/app")
    setup.mockInput.pressArrow("left")
    const all = await setup.waitForFrame((frame) => frame.includes("LOG all") && !frame.includes("LOG app"))
    expect(all).not.toContain("default/api/app")
  } finally {
    await setup.dispose()
  }
})

test("copies describe, yaml, json, and logs with c", async () => {
  const yaml = "YAML api\nkind: Deployment"
  const json = '{\n  "name": "api"\n}'
  const inspected: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 2, 2)]
    },
    async inspect() {
      return { describe: "DESCRIBE api", yaml, json }
    },
    async logs() {
      return "LOG api"
    },
    followLogs(_kind: ResourceKind, name: string, _namespace: string, onText: (text: string) => void) {
      onText(`FOLLOW ${name}\nready`)
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={inspected} />, { width: 112, height: 28 })
  const copied: string[] = []
  setRendererCapabilities(setup.renderer, { osc52_support: "supported" })
  setup.renderer.copyToClipboardOSC52 = (text: string) => {
    copied.push(text)
    return true
  }
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressKey("c")
    await setup.waitForVisualIdle()
    expect(copied).toEqual([])
    expect(setup.captureCharFrame()).not.toContain("Copied to clipboard")

    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/api"))
    setup.mockInput.pressEnter()
    const described = await setup.waitForFrame((frame) => frame.includes("DESCRIBE api"))
    expect(described).toContain("c copy")
    setup.mockInput.pressKey("c")
    const toast = await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))
    expect(toast).toContain("DESCRIBE api")
    expect(copied).toEqual(["DESCRIBE api"])
    const notice = locate(setup, "Copied to clipboard")
    await setup.mockMouse.click(notice.x, notice.y)
    await setup.waitForFrame((frame) => !frame.includes("Copied to clipboard"))

    setup.mockInput.pressArrow("right")
    const yamlView = await setup.waitForFrame((frame) => frame.includes("kind: Deployment"))
    expect(yamlView).toContain("c copy")
    setup.mockInput.pressKey("c")
    await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))
    expect(copied).toEqual(["DESCRIBE api", yaml])

    setup.mockInput.pressArrow("right")
    await setup.waitForFrame((frame) => frame.includes('"name": "api"'))
    setup.mockInput.pressKey("c")
    await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))
    expect(copied).toEqual(["DESCRIBE api", yaml, json])

    setup.mockInput.pressKey("l")
    const logs = await setup.waitForFrame((frame) => frame.includes("LOG api"))
    expect(logs).toContain("c copy")
    setup.mockInput.pressKey("c")
    await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))
    expect(copied).toEqual(["DESCRIBE api", yaml, json, "LOG api"])

    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("FOLLOW api") && frame.includes("ready"))
    setup.mockInput.pressKey("c")
    await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))
    expect(copied).toEqual(["DESCRIBE api", yaml, json, "LOG api", "FOLLOW api\nready"])

    setup.mockInput.pressEscape()
    await Bun.sleep(80)
    await setup.waitForFrame((frame) => frame.includes("default/api") && !frame.includes("FOLLOW api"))
    setup.mockInput.pressKey("c")
    await setup.waitForVisualIdle()
    expect(copied).toEqual(["DESCRIBE api", yaml, json, "LOG api", "FOLLOW api\nready"])
  } finally {
    await setup.dispose()
  }
})

test("opens the containers of the selected pod", async () => {
  const pods: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "pods") return []
      return [
        {
          metadata: { name: "api", namespace: "default", uid: "pod-api" },
          spec: {
            initContainers: [{ name: "init", image: "busybox", resources: { requests: { cpu: "10m" } } }],
            containers: [
              {
                name: "app",
                image: "nginx:1.27",
                resources: { requests: { cpu: "100m", memory: "64Mi" }, limits: { cpu: "200m", memory: "128Mi" } },
              },
            ],
          },
          status: {
            phase: "Running",
            initContainerStatuses: [{ name: "init", state: { terminated: { reason: "Completed", exitCode: 0 } } }],
            containerStatuses: [{ name: "app", ready: true, restartCount: 4, state: { running: { startedAt: "2026-11-14T00:00:00Z" } } }],
          },
        },
      ]
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={pods} />, { width: 160, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Nodes"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/api") && frame.includes("CONTAINERS"))
    setup.mockInput.pressArrow("right")
    const opened = await setup.waitForFrame((frame) => frame.includes("TYPE") && frame.includes("containers in api"))
    expect(opened).toContain("init")
    expect(opened).toContain("app")
    expect(opened).toContain("Completed")
    expect(opened).toContain("Running")
    expect(opened).toContain("100m/200m")
    expect(opened).toContain("64Mi/128Mi")
    expect(opened).toContain("10m/-")
    expect(opened).toContain("default/api/app")
    expect(opened).toContain("Containers")
    expect(opened).not.toContain("left pods")
    expect(opened).not.toContain("/ menu")
    expect(opened).not.toContain("ctrl+d Delete")
    expect(opened).not.toContain("CONTAINERS")
    setup.mockInput.pressKey("e")
    const editing = await setup.waitForFrame((frame) => frame.includes("edit mode on") && frame.includes("containers in api"))
    expect(editing).toContain("ctrl+s Shell")
    expect(editing).not.toContain("ctrl+d Delete")
    expect(editing).not.toContain("ctrl+y Evict")
    setup.mockInput.pressKey("e")
    await setup.waitForFrame((frame) => frame.includes("edit mode off"))
    setup.mockInput.pressArrow("down")
    await setup.waitForFrame((frame) => frame.includes("default/api/init"))
    setup.mockInput.pressArrow("left")
    const back = await setup.waitForFrame((frame) => frame.includes("CONTAINERS") && frame.includes("default/api"))
    expect(back).not.toContain("TYPE")
    expect(back).not.toContain("containers in api")
    expect(back).not.toContain("Containers")
  } finally {
    await setup.dispose()
  }
})

test("toggles edit mode from the status and the e key", async () => {
  const setup = await testRender(() => <App client={client} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("edit mode off"))
    const off = stateWord(setup, "off")
    await setup.mockMouse.click(off.x, off.y)
    await setup.waitForFrame((frame) => frame.includes("edit mode on"))
    const on = stateWord(setup, "on")
    await setup.mockMouse.click(on.x, on.y)
    await setup.waitForFrame((frame) => frame.includes("edit mode off") && !frame.includes("edit mode on"))
    setup.mockInput.pressKey("e")
    await setup.waitForFrame((frame) => frame.includes("edit mode on"))
    setup.mockInput.pressKey("e")
    await setup.waitForFrame((frame) => frame.includes("edit mode off") && !frame.includes("edit mode on"))
  } finally {
    await setup.dispose()
  }
})

test("shows edit actions above the status bar and runs ctrl+key", async () => {
  const calls: unknown[] = []
  const editing: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id === "nodes") {
        return [{ metadata: { name: "worker" }, status: { conditions: [{ type: "Ready", status: "True" }] } }]
      }
      if (kind.id === "deployments") {
        return [{ metadata: { name: "api", namespace: "default", uid: "deploy-api" }, spec: { replicas: 2 }, status: { readyReplicas: 1 } }]
      }
      if (kind.id === "replicasets") {
        return [{
          metadata: {
            name: "api",
            namespace: "default",
            uid: "rs-api",
            ownerReferences: [{ uid: "deploy-api", kind: "Deployment", name: "api", controller: true }],
          },
          spec: { replicas: 2 },
          status: { readyReplicas: 1 },
        }]
      }
      return []
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute(command) {
      calls.push(command)
    },
  }
  const setup = await testRender(() => <App client={editing} />, { width: 160, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("worker"))
    expect(setup.captureCharFrame()).not.toContain("ctrl+o Cordon")
    const off = stateWord(setup, "off")
    await setup.mockMouse.click(off.x, off.y)
    const row = await setup.waitForFrame((frame) => frame.includes("ctrl+o Cordon"))
    const lines = row.split("\n")
    const actionLine = lines.find((line) => line.includes("ctrl+o Cordon")) ?? ""
    const actions = lines.findIndex((line) => line.includes("ctrl+o Cordon"))
    const status = lines.findIndex((line) => line.includes("← parent"))
    expect(actions).toBe(status - 1)
    expect(actionLine.indexOf("ctrl+o Cordon")).toBeGreaterThan(40)
    expect(actionLine).toContain("ctrl+e Edit   ctrl+s Shell   ctrl+d Drain   ctrl+u Uncordon   ctrl+o Cordon")
    setup.mockInput.pressKey("o", { ctrl: true })
    const ask = await setup.waitForFrame((frame) => frame.includes("kubectl cordon worker"))
    expect(ask).toContain("esc")
    expect(ask).toContain("Copy")
    expect(ask).toContain("Cancel")
    expect(ask).toContain("Confirm")
    setup.mockInput.pressArrow("left")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => !frame.includes("kubectl cordon worker"))
    expect(calls).toEqual([])
    setup.mockInput.pressKey("o", { ctrl: true })
    await setup.waitForFrame((frame) => frame.includes("kubectl cordon worker"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame(() => calls.length > 0)
    expect(calls[0]).toEqual(editCommand("nodes", "cordon", { name: "worker", namespace: "" }))

    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("Deployments") && frame.includes("default/api"))
    setup.mockInput.pressArrow("right")
    const scaled = await setup.waitForFrame((frame) => frame.includes("ReplicaSets") && frame.includes("ctrl+s Scale") && frame.includes("api"))
    expect(scaled).toContain("ctrl+e Edit   ctrl+s Scale   ctrl+d Delete")
    setup.mockInput.pressKey("s", { ctrl: true })
    await setup.waitForFrame((frame) => frame.includes("replicas"))
    setup.mockInput.pressBackspace()
    await setup.mockInput.typeText("3")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("kubectl scale replicasets/api --replicas=3 -n default"))
    expect(calls.length).toBe(1)
    setup.mockInput.pressEnter()
    await setup.waitForFrame(() => calls.length > 1)
    expect(calls[1]).toEqual(editCommand("replicasets", "scale", { name: "api", namespace: "default", replicas: 3 }))
  } finally {
    await setup.dispose()
  }
})

test("opens a slash menu for kinds, namespaces, and actions", async () => {
  const switched: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default", "kube-system"]
    },
    async list(kind: ResourceKind) {
      if (kind.id === "pods") return [resource("logger", 1, 1)]
      if (kind.id === "deployments") return [resource("api", 2, 2), resource("worker", 1, 1, false, "kube-system")]
      return []
    },
    async inspect(_kind: ResourceKind, name: string) {
      return { describe: `DESCRIBE ${name}`, yaml: `YAML ${name}`, json: `JSON ${name}` }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={switched} />, { width: 120, height: 32 })
  const row = (frame: string, label: string, type: string) => frame.split("\n").some((line) => line.includes(label) && line.includes(type))
  // A lone escape is disambiguated on a timer, so the next key has to wait for it.
  const escape = async () => {
    setup.mockInput.pressEscape()
    await Bun.sleep(80)
  }
  try {
    const ready = await setup.waitForFrame((frame) => frame.includes("Nodes") && frame.includes("kube-system"))
    expect(ready).toContain("/ menu")
    setup.mockInput.pressKey("/")
    const kinds = await setup.waitForFrame((frame) => row(frame, "Nodes", "kind") && frame.includes("Search"))
    expect(kinds).toContain("esc")
    expect(kinds).toContain("Commands")
    const queryLine = kinds.split("\n").findIndex((line) => line.includes("Search"))
    expect(queryLine).toBeGreaterThan(6)
    expect(queryLine).toBeLessThan(16)
    const nodes = kinds.split("\n").find((line) => line.includes("Nodes") && line.includes("kind")) ?? ""
    expect(nodes.trimEnd().length).toBeLessThan(100)
    setup.mockInput.pressKey("j")
    const jobs = await setup.waitForFrame((frame) => row(frame, "Jobs", "kind") && frame.includes("Commands") && !frame.includes("Search"))
    expect(jobs).not.toContain("logger")
    await escape()
    await setup.waitForFrame((frame) => !frame.includes("Commands"))

    setup.mockInput.pressKey("/")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("logger") && !frame.includes("Commands"))

    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("deploy")
    const deployments = await setup.waitForFrame((frame) => row(frame, "Deployments", "kind") && frame.includes("deploy"))
    expect(deployments).toContain("Commands")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("api") && frame.includes("worker") && !frame.includes("Commands"))

    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("worker")
    await setup.waitForFrame((frame) => row(frame, "worker", "resource"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => {
      const line = frame.split("\n").find((item) => item.includes("← parent"))
      return Boolean(line?.includes("kube-system/worker"))
    })

    setup.mockInput.pressKey("n")
    setup.mockInput.pressKey("f")
    await setup.waitForFrame((frame) => frame.includes("enter list"))
    await setup.mockInput.typeText("default")
    const narrowed = await setup.waitForFrame((frame) => frame.includes("filter:") && !frame.includes("all namespaces"))
    expect(narrowed).toContain("default")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("filter:") && !frame.includes("enter list"))

    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("kube-system")
    const namespace = await setup.waitForFrame((frame) => row(frame, "kube-system", "namespace"))
    expect(namespace).toContain("Commands")
    setup.mockInput.pressEnter()
    const switched = await setup.waitForFrame((frame) => frame.includes("worker") && !frame.includes("api") && frame.includes("all namespaces"))
    expect(switched).not.toContain("filter:")

    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("logs")
    const logs = await setup.waitForFrame((frame) => row(frame, "Logs", "action"))
    expect(logs).toContain("logs")
    await escape()

    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("yaml")
    await setup.waitForFrame((frame) => row(frame, "YAML", "action"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("YAML worker"))
    await escape()
    await setup.waitForFrame((frame) => frame.includes("worker") && !frame.includes("YAML worker"))

    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("delete")
    const hidden = await setup.waitForFrame((frame) => frame.includes("delete") && frame.includes("no matches"))
    expect(row(hidden, "Delete", "action")).toBe(false)
    await escape()

    setup.mockInput.pressKey("e")
    await setup.waitForFrame((frame) => frame.includes("edit mode on"))
    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("delete")
    const visible = await setup.waitForFrame((frame) => row(frame, "Delete", "action"))
    expect(visible).toContain("delete")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("kubectl delete deployments worker -n kube-system"))
  } finally {
    await setup.dispose()
  }
})

test("drags to select detail text and still clicks a row", async () => {
  const inspected: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 2, 2), resource("worker", 1, 2)]
    },
    async inspect() {
      return { describe: "DESCRIBE api", yaml: "YAML api", json: "JSON api" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={inspected} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("Pods"))
    setup.mockInput.pressTab()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("default/api"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("DESCRIBE api"))
    setup.mockInput.pressArrow("right")
    await setup.waitForFrame((frame) => frame.includes("YAML api"))
    const yaml = locate(setup, "YAML api")
    await setup.mockMouse.drag(yaml.x, yaml.y, yaml.x + "YAML api".length - 1, yaml.y)
    expect(setup.renderer.getSelection()?.getSelectedText()).toBe("YAML api")

    // A lone escape is disambiguated on a timer after the mouse drag.
    setup.mockInput.pressEscape()
    await Bun.sleep(80)
    await setup.waitForFrame((frame) => frame.includes("worker") && !frame.includes("YAML api"))
    const worker = locate(setup, "worker")
    await setup.mockMouse.click(worker.x, worker.y)
    await setup.waitForFrame((frame) => frame.split("\n").some((line) => line.includes("← parent") && line.includes("default/worker")))
    expect(setup.renderer.getSelection()?.getSelectedText() ?? "").toBe("")
  } finally {
    await setup.dispose()
  }
})

test("selects kind and namespace labels without swallowing the click", async () => {
  const namespaced: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default", "kube-system"]
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "deployments") return []
      return [resource("api", 2, 2), resource("worker", 1, 1, false, "kube-system")]
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={namespaced} />, { width: 112, height: 28 })
  try {
    await setup.waitForFrame((frame) => frame.includes("StatefulSets") && frame.includes("kube-system"))
    const kind = locate(setup, "StatefulSets")
    await setup.mockMouse.drag(kind.x, kind.y, kind.x + "StatefulSets".length - 1, kind.y)
    expect(setup.renderer.getSelection()?.getSelectedText()).toBe("StatefulSets")

    const namespace = locate(setup, "kube-system")
    await setup.mockMouse.drag(namespace.x, namespace.y, namespace.x + "kube-system".length - 1, namespace.y)
    expect(setup.renderer.getSelection()?.getSelectedText()).toBe("kube-system")

    const deployments = locate(setup, "Deployments")
    await setup.mockMouse.click(deployments.x, deployments.y)
    await setup.waitForFrame((frame) => frame.includes("kube-system/worker") && !frame.includes("default/api"))
    const defaults = locate(setup, "default")
    await setup.mockMouse.click(defaults.x, defaults.y)
    await setup.waitForFrame((frame) => frame.includes("default/api") && !frame.includes("worker"))
  } finally {
    await setup.dispose()
  }
})

test("opens a discovered builtin kind from the slash menu", async () => {
  const calls: unknown[] = []
  const discovered = builtinKinds(
    "clusterroles  rbac.authorization.k8s.io/v1  false  ClusterRole  create,delete,get,list",
    '{"items":[]}',
  )
  const client: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["default"]
    },
    async resources() {
      return discovered
    },
    async list(kind: ResourceKind) {
      if (kind.id === "clusterroles") return [{ metadata: { name: "admin" } }]
      return []
    },
    async inspect() {
      return { describe: "DESCRIBE admin", yaml: "YAML admin", json: "JSON admin" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute(command) {
      calls.push(command)
    },
  }
  const setup = await testRender(() => <App client={client} />, { width: 120, height: 32 })
  const row = (frame: string, label: string, type: string) => frame.split("\n").some((line) => line.includes(label) && line.includes(type))
  try {
    const sidebar = await setup.waitForFrame((frame) => frame.includes("Nodes"))
    expect(sidebar).not.toContain("ClusterRoles")
    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("clusterroles")
    const menu = await setup.waitForFrame((frame) => row(frame, "ClusterRoles", "kind"))
    expect(menu).toContain("rbac.authorization.k8s.io/v1")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("admin") && !frame.includes("Commands"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("DESCRIBE admin"))
    setup.mockInput.pressKey("e")
    await setup.waitForFrame((frame) => frame.includes("ctrl+d Delete"))
    setup.mockInput.pressKey("d", { ctrl: true })
    await setup.waitForFrame((frame) => frame.includes("kubectl delete clusterroles admin --wait=false"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame(() => calls.length > 0)
    expect(calls[0]).toEqual(editCommand("clusterroles", "delete", { name: "admin", namespace: "" }, undefined, discovered))
  } finally {
    await setup.dispose()
  }
})

test("opens the three views and reconciles a flux resource", async () => {
  const calls: unknown[] = []
  const crds = JSON.stringify({
    items: [
      {
        spec: {
          group: "kustomize.toolkit.fluxcd.io",
          scope: "Namespaced",
          names: { plural: "kustomizations", shortNames: ["ks"] },
          versions: [{ name: "v1", served: true, storage: true }],
        },
      },
    ],
  })
  const client: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    async namespaces() {
      return ["flux-system"]
    },
    async resources() {
      return builtinKinds("", crds)
    },
    async list(kind: ResourceKind) {
      if (kind.id !== "kustomizations") return []
      return [
        {
          metadata: { name: "podinfo", namespace: "flux-system" },
          spec: { url: "https://example.com/repo" },
          status: { conditions: [{ type: "Ready", status: "True", message: "stored artifact" }] },
        } as KubernetesObject,
      ]
    },
    async inspect() {
      return { describe: "DESCRIBE podinfo", yaml: "YAML podinfo", json: "JSON podinfo" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute(command) {
      calls.push(command)
    },
  }
  const setup = await testRender(() => <App client={client} />, { width: 120, height: 56 })
  const row = (frame: string, label: string, type: string) => frame.split("\n").some((line) => line.includes(label) && line.includes(type))
  try {
    const sidebar = await setup.waitForFrame((frame) => frame.includes("Nodes") && frame.includes("Kustomizations"))
    expect(sidebar).toContain("Kustomizations")
    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("kustomizations")
    await setup.waitForFrame((frame) => row(frame, "Kustomizations", "kind"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("podinfo") && !frame.includes("Search"))
    setup.mockInput.pressEnter()
    const described = await setup.waitForFrame((frame) => frame.includes("DESCRIBE podinfo"))
    expect(described).toContain("Describe")
    expect(described).toContain("YAML")
    expect(described).toContain("JSON")
    setup.mockInput.pressArrow("right")
    await setup.waitForFrame((frame) => frame.includes("YAML podinfo"))
    setup.mockInput.pressArrow("right")
    await setup.waitForFrame((frame) => frame.includes("JSON podinfo"))
    setup.mockInput.pressKey("e")
    const editing = await setup.waitForFrame((frame) => frame.includes("ctrl+r Reconcile"))
    expect(editing).toContain("ctrl+d Delete")
    setup.mockInput.pressKey("r", { ctrl: true })
    await setup.waitForFrame((frame) => frame.includes("annotate"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame(() => calls.length > 0)
    const command = calls[0] as { bin: string; args: string[] }
    expect(command.bin).toBe("kubectl")
    expect(command.args.slice(0, 6)).toEqual([
      "annotate",
      "kustomizations.v1.kustomize.toolkit.fluxcd.io",
      "podinfo",
      "-n",
      "flux-system",
      "--overwrite",
    ])
    expect(command.args[6]?.startsWith("reconcile.fluxcd.io/requestedAt=")).toBe(true)
  } finally {
    await setup.dispose()
  }
})

test("shows loaders while CRDs and namespaces are in flight", async () => {
  let releaseNamespaces: ((names: string[]) => void) | undefined
  let releaseKinds: ((kinds: ResourceKind[]) => void) | undefined
  const pending: ClusterClient = {
    async currentContext() {
      return "demo"
    },
    namespaces() {
      return new Promise((resolve) => {
        releaseNamespaces = resolve
      })
    },
    resources() {
      return new Promise((resolve) => {
        releaseKinds = resolve
      })
    },
    async list() {
      return [resource("api", 1, 1)]
    },
    async inspect() {
      return { describe: "", yaml: "", json: "" }
    },
    async logs() {
      return ""
    },
    followLogs() {
      return () => {}
    },
    async execute() {},
  }
  const setup = await testRender(() => <App client={pending} />, { width: 112, height: 48 })
  try {
    const loading = await setup.waitForFrame((frame) => frame.includes("api") && frame.includes("CRDs") && frame.includes("Loading..."))
    const lines = loading.split("\n")
    const events = lines.findIndex((line) => line.includes("Events"))
    const crds = lines.findIndex((line) => line.includes("CRDs"))
    expect(crds).toBe(events + 2)
    expect(loading).not.toContain("all namespaces")
    releaseNamespaces?.(["kube-system", "default"])
    releaseKinds?.([])
    const loaded = await setup.waitForFrame((frame) => frame.includes("all namespaces") && frame.includes("kube-system") && !frame.includes("Loading..."))
    expect(loaded).not.toContain("CRDs")
  } finally {
    await setup.dispose()
  }
})

function locate(setup: Awaited<ReturnType<typeof testRender>>, text: string) {
  const lines = setup.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  return { x: y < 0 ? -1 : lines[y]!.indexOf(text), y }
}

function stateWord(setup: Awaited<ReturnType<typeof testRender>>, word: "on" | "off") {
  const line = setup.captureSpans().lines[0]
  let x = 0
  let seen = ""
  for (const span of line?.spans ?? []) {
    if (span.text === word && seen.endsWith("edit mode ")) return { x, y: 0 }
    seen += span.text
    x += span.width
  }
  throw new Error(`missing edit mode ${word}`)
}

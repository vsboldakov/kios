import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { runKey } from "./input"
import { createSession } from "./session"

const kinds = [{ id: "deployments" }, { id: "statefulsets" }, { id: "daemonsets" }]

function withSession(run: (session: ReturnType<typeof createSession>) => void) {
  createRoot((dispose) => {
    run(createSession(kinds))
    dispose()
  })
}

test("keeps work in the current tab until a new tab is opened", () => {
  withSession((session) => {
    expect(session.tabs()).toHaveLength(1)
    expect(session.activeId()).toBe("deployments")
    session.openKind("statefulsets")
    expect(session.tabs()).toHaveLength(1)
    expect(session.activeId()).toBe("statefulsets")
    session.moveSidebar(1)
    session.newTab()
    expect(session.tabs()).toHaveLength(2)
    expect(session.activeId()).toBe("daemonsets")
    session.activate("statefulsets")
    session.cycleTab(1)
    expect(session.activeId()).toBe("daemonsets")
    session.cycleTab(-1)
    expect(session.activeId()).toBe("statefulsets")
    session.closeTab("statefulsets")
    expect(session.openIds()).toEqual(["daemonsets"])
    session.openDetail("daemonsets", "logger", "default")
    expect(session.tabs()).toHaveLength(1)
    expect(session.detail()?.name).toBe("logger")
    expect(session.focus()).toBe("detail")
    session.cycleDetail(1)
    expect(session.detail()?.tab).toBe("yaml")
    expect(session.logTarget([])).toEqual({ kindId: "daemonsets", name: "logger", namespace: "default" })
    session.openLogs("daemonsets", "logger", "default")
    expect(session.tabs()).toHaveLength(1)
    expect(session.detail()?.logs).toBe(true)
    expect(session.detail()?.follow).toBe(false)
    session.toggleFollow()
    expect(session.detail()?.follow).toBe(true)
    session.toggleFollow()
    expect(session.detail()?.follow).toBe(false)
    expect(session.logTarget([{ metadata: { name: "logger", namespace: "default" } }])).toBeNull()
    session.closeDetail()
    expect(session.detail()).toBeNull()
    expect(session.focus()).toBe("list")
    expect(session.logTarget([])).toBeNull()
    expect(session.logTarget([{ metadata: { name: "logger", namespace: "default" } }])).toEqual({
      kindId: "daemonsets",
      name: "logger",
      namespace: "default",
    })
    session.setFocus("sidebar")
    expect(session.logTarget([{ metadata: { name: "logger", namespace: "default" } }])).toBeNull()
    expect(session.activeId()).toBe("daemonsets")
  })
})

test("moves the sidebar independently and clamps row selection", () => {
  withSession((session) => {
    session.setFocus("sidebar")
    session.moveSidebar(1)
    session.moveSidebar(10)
    expect(session.sidebarIndex()).toBe(2)
    expect(session.activeId()).toBe("deployments")
    session.openSidebar()
    expect(session.activeId()).toBe("daemonsets")
    expect(session.focus()).toBe("list")
    session.moveRow(5, 2)
    expect(session.rowIndex("daemonsets")).toBe(1)
    session.moveRow(-10, 2)
    expect(session.rowIndex("daemonsets")).toBe(0)
  })
})

test("opens a catalog kind hidden from the sidebar", () => {
  createRoot((dispose) => {
    const session = createSession([{ id: "deployments" }, { id: "pods" }])
    session.showControlled("replicasets", { uid: "d1", kind: "Deployment", name: "web", namespace: "default" })
    expect(session.activeId()).toBe("replicasets")
    expect(session.sidebarIndex()).toBe(0)
    dispose()
  })
})

test("extends the sidebar when installed custom resources arrive", () => {
  withSession((session) => {
    session.setFocus("sidebar")
    session.setMenu([...kinds, { id: "gitrepositories" }])
    session.moveSidebar(10)
    expect(session.sidebarIndex()).toBe(3)
    session.openSidebar()
    expect(session.activeId()).toBe("gitrepositories")
    session.setMenu(kinds)
    expect(session.sidebarIndex()).toBe(2)
  })
})

test("opens a discovered kind without moving the sidebar", () => {
  withSession((session) => {
    session.setExtra([{ id: "roles", label: "Role", resource: "roles", namespaced: true, group: 8, columns: [] }])
    session.openKind("roles")
    expect(session.activeId()).toBe("roles")
    expect(session.sidebarIndex()).toBe(0)
    session.selectRow("roles", 1)
    expect(session.rowIndex("roles")).toBe(1)
  })
})

test("opens the controller and the resources it controls", () => {
  createRoot((dispose) => {
    const session = createSession([{ id: "deployments" }, { id: "replicasets" }, { id: "pods" }])
    const owner = { uid: "d1", kind: "Deployment", name: "web", namespace: "default" }
    session.showControlled("replicasets", owner)
    expect(session.activeId()).toBe("replicasets")
    expect(session.focus()).toBe("list")
    expect(session.activeTab()?.owner).toEqual(owner)
    expect(session.rowIndex("replicasets")).toBe(0)
    session.selectRow("replicasets", 2)
    expect(session.activeTab()?.owner).toEqual(owner)
    session.openDetail("replicasets", "web-1", "default")
    session.showController("deployments", "web", "default")
    expect(session.focus()).toBe("list")
    expect(session.detail()).toBeNull()
    expect(session.activeTab()?.owner).toBeNull()
    expect(session.pick()).toEqual({ tabId: "1", kindId: "deployments", name: "web", namespace: "default" })
    session.openKind("pods")
    expect(session.pick()).toBeNull()
    dispose()
  })
})

test("opens a pod's containers in the current tab", () => {
  withSession((session) => {
    session.openDetail("deployments", "web", "default")
    session.showContainers("api", "default")
    expect(session.containerScope()).toEqual({ name: "api", namespace: "default" })
    expect(session.detail()).toBeNull()
    expect(session.focus()).toBe("list")
    expect(session.activeId()).toBe("deployments")
    session.moveRow(1, 3)
    expect(session.containerIndex()).toBe(1)
    expect(session.rowIndex("deployments")).toBe(0)
    session.selectContainer(2)
    expect(session.containerIndex()).toBe(2)
    session.openDetail("deployments", "web", "default")
    session.closeDetail()
    expect(session.containerScope()).toEqual({ name: "api", namespace: "default" })
    session.closeContainers()
    expect(session.containerScope()).toBeNull()
    expect(session.containerIndex()).toBe(0)
    session.showContainers("api", "default")
    session.openKind("statefulsets")
    expect(session.containerScope()).toBeNull()
    expect(session.activeId()).toBe("statefulsets")
  })
})

test("keeps a name filter on each tab and a separate one for containers", () => {
  withSession((session) => {
    session.setFilter("api")
    session.selectRow("deployments", 2)
    expect(session.filter()).toBe("api")
    expect(session.rowIndex("deployments")).toBe(2)
    session.moveSidebar(1)
    session.newTab()
    expect(session.filter()).toBe("")
    session.cycleTab(-1)
    expect(session.filter()).toBe("api")
    session.openKind("statefulsets")
    expect(session.filter()).toBe("")
    session.setFilter("db")
    session.showContainers("web", "default")
    expect(session.filter()).toBe("db")
    expect(session.containerFilter()).toBe("")
    session.setContainerFilter("app")
    session.showContainers("web", "default")
    expect(session.containerFilter()).toBe("app")
    session.closeContainers()
    session.showContainers("web", "default")
    expect(session.containerFilter()).toBe("app")
    session.showContainers("other", "kube-system")
    expect(session.containerFilter()).toBe("")
    expect(session.filter()).toBe("db")
    session.openKind("daemonsets")
    expect(session.containerFilter()).toBe("")
    expect(session.containerScope()).toBeNull()
  })
})

test("keeps a separate row on each tab of one kind", () => {
  withSession((session) => {
    session.selectRow("deployments", 2)
    session.newTab()
    expect(session.rowIndex("deployments")).toBe(0)
    session.selectRow("deployments", 1)
    session.cycleTab(-1)
    expect(session.rowIndex("deployments")).toBe(2)
    session.cycleTab(1)
    session.closeTab("deployments")
    expect(session.tabs()).toHaveLength(1)
    expect(session.rowIndex("deployments")).toBe(2)
  })
})

test("routes keys to the focused zone", () => {
  withSession((session) => {
    let ownerMoves = 0
    let controlledMoves = 0
    let follows = 0
    let filters = 0
    let details = 0
    const actions = {
      focus: session.focus,
      toggleFocus: () => session.setFocus(session.focus() === "sidebar" ? "list" : "sidebar"),
      moveSidebar: session.moveSidebar,
      openSidebar: session.openSidebar,
      moveRow: (delta: number) => {
        const id = session.activeId()
        session.moveRow(delta, id ? 3 : 0)
      },
      cycleTab: session.cycleTab,
      showOwner: () => {
        ownerMoves += 1
      },
      showControlled: () => {
        controlledMoves += 1
      },
      closeTab: () => session.closeTab(),
      toggleNamespaces: () => {},
      moveNamespace: () => {},
      closeNamespaces: () => {},
      openDetail: () => {
        details += 1
      },
      closeDetail: () => {},
      formatView: () => {
        const current = session.detail()
        return Boolean(current && !current.logs)
      },
      cycleDetail: session.cycleDetail,
      scrollDetail: () => {},
      openNewTab: () => {},
      openLogs: () => {},
      toggleFollow: () => {
        follows += 1
      },
      startFilter: () => {
        filters += 1
      },
    }

    session.moveSidebar(1)
    session.newTab()
    session.activate("deployments")
    runKey({ name: "j" }, actions)
    expect(session.rowIndex("deployments")).toBe(1)
    runKey({ name: "f" }, actions)
    expect(filters).toBe(1)
    expect(follows).toBe(0)
    runKey({ name: "right" }, actions)
    runKey({ name: "left" }, actions)
    expect(controlledMoves).toBe(1)
    expect(ownerMoves).toBe(1)
    expect(session.activeId()).toBe("deployments")
    runKey({ name: "]" }, actions)
    expect(session.activeId()).toBe("statefulsets")
    runKey({ name: "tab" }, actions)
    expect(session.focus()).toBe("sidebar")
    runKey({ name: "down" }, actions)
    runKey({ name: "return" }, actions)
    expect(session.activeId()).toBe("daemonsets")
    expect(session.focus()).toBe("list")
    session.openDetail("daemonsets", "logger", "default")
    runKey({ name: "left" }, actions)
    expect(session.detail()?.tab).toBe("json")
    runKey({ name: "right" }, actions)
    expect(session.detail()?.tab).toBe("describe")
    expect(ownerMoves).toBe(1)
    expect(controlledMoves).toBe(1)
    expect(session.focus()).toBe("detail")
    runKey({ name: "f" }, actions)
    expect(filters).toBe(1)
    expect(follows).toBe(1)
    runKey({ name: "]" }, actions)
    expect(session.activeId()).toBe("deployments")
    expect(session.focus()).toBe("list")
    runKey({ name: "[" }, actions)
    expect(session.activeId()).toBe("daemonsets")
    expect(session.focus()).toBe("detail")
    session.openLogs("daemonsets", "logger", "default")
    runKey({ name: "d" }, actions)
    expect(details).toBe(1)
    runKey({ name: "d", ctrl: true }, actions)
    expect(details).toBe(1)
    runKey({ name: "left" }, actions)
    runKey({ name: "right" }, actions)
    expect(ownerMoves).toBe(2)
    expect(controlledMoves).toBe(2)
    expect(session.detail()?.logs).toBe(true)
    runKey({ name: "tab" }, actions)
    expect(session.focus()).toBe("sidebar")
    runKey({ name: "]" }, actions)
    expect(session.activeId()).toBe("deployments")
    expect(session.tabs()).toHaveLength(2)
    runKey({ name: "x" }, actions)
    expect(session.tabs()).toHaveLength(2)
    runKey({ name: "q" }, actions)
    expect(session.tabs()).toHaveLength(1)
  })
})

test("toggles the sort column and clears it with the kind", () => {
  withSession((session) => {
    session.sortBy("status")
    expect(session.sort()).toEqual({ column: "status", desc: false })
    session.sortBy("status")
    expect(session.sort()?.desc).toBe(true)
    session.openKind("statefulsets")
    expect(session.sort()).toBeNull()
    session.showContainers("api", "default")
    session.sortBy("image")
    expect(session.containerSort()).toEqual({ column: "image", desc: false })
    expect(session.sort()).toBeNull()
  })
})

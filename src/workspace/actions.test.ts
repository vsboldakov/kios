import { expect, test } from "bun:test"
import { kubectlBin } from "../cluster/kubectl"
import { commandLine, declaredPorts, editActions, editCommand, portMappings, shellContainer, triggeredJobName } from "./actions"
import { resourceKinds, type ResourceKind } from "../resources"

const target = { name: "api", namespace: "default" }

test("lists a ctrl key for each edit action", () => {
  expect(editActions("pods").map((action) => action.label)).toEqual(["Delete", "Force", "Evict", "Shell", "Port-forward", "Edit"])
  expect(editActions("pods").find((action) => action.id === "evict")?.key).toBe("y")
  expect(editActions("pods").find((action) => action.id === "force")?.key).toBe("f")
  expect(editActions("pods").find((action) => action.id === "edit")?.key).toBe("e")
  expect(editActions("services").map((action) => action.id)).toEqual(["delete", "port-forward", "edit"])
  expect(editActions("deployments").map((action) => action.id)).toEqual(["delete", "restart", "undo", "edit"])
  expect(editActions("statefulsets").map((action) => action.id)).toEqual(["delete", "restart", "undo", "edit"])
  expect(editActions("daemonsets").map((action) => action.id)).toEqual(["delete", "restart", "undo", "edit"])
  expect(editActions("replicasets").map((action) => action.id)).toEqual(["delete", "scale", "edit"])
  expect(editActions("jobs").map((action) => action.label)).toEqual(["Delete", "Suspend", "Edit"])
  expect(editActions("jobs", true).map((action) => action.label)).toEqual(["Delete", "Resume", "Edit"])
  expect(editActions("cronjobs").map((action) => action.label)).toEqual(["Delete", "Trigger", "Suspend", "Edit"])
  expect(editActions("cronjobs", true).map((action) => action.label)).toEqual(["Delete", "Trigger", "Resume", "Edit"])
  expect(editActions("nodes").map((action) => action.label)).toEqual(["Cordon", "Uncordon", "Drain", "Shell", "Edit"])
  expect(editActions("ingresses").map((action) => action.id)).toEqual(["edit"])
  expect(editActions("events")).toEqual([])
  for (const id of [
    "configmaps",
    "hpas",
    "pdbs",
    "namespaces",
    "secrets",
    "serviceaccounts",
    "resourcequotas",
    "limitranges",
    "rolebindings",
    "networkpolicies",
    "storageclasses",
    "pvcs",
    "pvs",
  ]) {
    expect(editActions(id).map((action) => action.id)).toEqual(["delete", "edit"])
  }
  for (const kind of resourceKinds) {
    const keys = editActions(kind.id, true).map((action) => action.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain("c")
  }
})

test("builds the kubectl commands", () => {
  expect(editCommand("pods", "delete", target)).toEqual({
    bin: "kubectl",
    args: ["delete", "pods", "api", "-n", "default", "--wait=false"],
  })
  expect(editCommand("pods", "force", target)?.args).toEqual([
    "delete",
    "pods",
    "api",
    "-n",
    "default",
    "--force",
    "--grace-period=0",
    "--wait=false",
  ])
  expect(editCommand("pods", "evict", target)?.stdin).toContain(`"kind":"Eviction"`)
  expect(editCommand("deployments", "restart", target)?.args).toEqual(["rollout", "restart", "deployments/api", "-n", "default"])
  expect(editCommand("deployments", "undo", target)?.args).toEqual(["rollout", "undo", "deployments/api", "-n", "default"])
  expect(editCommand("jobs", "suspend", target)?.args.at(-1)).toContain(`"suspend":true`)
  expect(editCommand("jobs", "resume", target)?.args.at(-1)).toContain(`"suspend":false`)
  expect(editCommand("replicasets", "scale", { ...target, replicas: 3 })?.args).toContain("--replicas=3")
  expect(editCommand("replicasets", "scale", target)).toBeNull()
  expect(editCommand("cronjobs", "trigger", target, 36)?.args[3]).toBe("api-manual-10")
  expect(editCommand("cronjobs", "suspend", target)?.args.at(-1)).toContain(`"suspend":true`)
  expect(editCommand("cronjobs", "resume", target)?.args.at(-1)).toContain(`"suspend":false`)
  expect(editCommand("nodes", "cordon", { name: "worker", namespace: "" })?.args).toEqual(["cordon", "worker"])
  expect(editCommand("nodes", "uncordon", { name: "worker", namespace: "" })?.args).toEqual(["uncordon", "worker"])
  expect(editCommand("nodes", "drain", { name: "worker", namespace: "" })?.args).toEqual([
    "drain",
    "worker",
    "--ignore-daemonsets",
    "--delete-emptydir-data",
  ])
  expect(editCommand("nodes", "shell", { name: "worker", namespace: "" })?.interactive).toBe(true)
  expect(editCommand("deployments", "edit", target)).toEqual({
    bin: "kubectl",
    args: ["edit", "deployments", "api", "-n", "default"],
    interactive: true,
  })
  expect(editCommand("nodes", "edit", { name: "worker", namespace: "" })).toEqual({
    bin: "kubectl",
    args: ["edit", "nodes", "worker"],
    interactive: true,
  })
  expect(editCommand("events", "edit", target)).toBeNull()
  expect(editCommand("pods", "shell", { ...target, container: "app" })).toEqual({
    bin: "kubectl",
    args: ["exec", "-i", "-t", "-n", "default", "api", "-c", "app", "--", "sh", "-c", "clear; (bash || ash || sh)"],
    interactive: true,
  })
  expect(editCommand("pods", "shell", target)).toEqual({
    bin: "kubectl",
    args: ["exec", "-i", "-t", "-n", "default", "api", "--", "sh", "-c", "clear; (bash || ash || sh)"],
    interactive: true,
  })
  expect(editCommand("pods", "port-forward", { ...target, ports: ["8080", "9090:80"] })).toEqual({
    bin: "kubectl",
    args: ["port-forward", "-n", "default", "pod/api", "8080", "9090:80"],
    interactive: true,
  })
  expect(editCommand("services", "port-forward", { ...target, ports: ["80"] })?.args).toEqual(["port-forward", "-n", "default", "svc/api", "80"])
  expect(editCommand("services", "port-forward", target)).toBeNull()
  expect(editCommand("pods", "port-forward", { name: "api", namespace: "", ports: ["8080"] })).toBeNull()
  expect(editCommand("namespaces", "delete", { name: "demo", namespace: "" })?.args).toEqual(["delete", "namespaces", "demo", "--wait=false"])
  expect(triggeredJobName("a".repeat(80), 36).length).toBeLessThanOrEqual(63)
})

test("KIOS_KUBECTL replaces the kubectl binary on the command line", () => {
  const previous = process.env.KIOS_KUBECTL
  try {
    process.env.KIOS_KUBECTL = "/opt/bin/kubectl"
    expect(kubectlBin()).toBe("/opt/bin/kubectl")
    expect(commandLine(editCommand("nodes", "cordon", { name: "worker", namespace: "" })!)).toBe("/opt/bin/kubectl cordon worker")
    process.env.KIOS_KUBECTL = "/opt/my bin/kubectl"
    expect(commandLine(editCommand("nodes", "cordon", { name: "worker", namespace: "" })!)).toBe("'/opt/my bin/kubectl' cordon worker")
    process.env.KIOS_KUBECTL = " "
    expect(kubectlBin()).toBe("kubectl")
    expect(commandLine(editCommand("nodes", "cordon", { name: "worker", namespace: "" })!)).toBe("kubectl cordon worker")
  } finally {
    if (previous === undefined) delete process.env.KIOS_KUBECTL
    else process.env.KIOS_KUBECTL = previous
  }
})

test("prints the shell equivalent of an edit command", () => {
  expect(commandLine(editCommand("nodes", "cordon", { name: "worker", namespace: "" })!)).toBe("kubectl cordon worker")
  expect(commandLine(editCommand("replicasets", "scale", { ...target, replicas: 3 })!)).toBe(
    "kubectl scale replicasets/api --replicas=3 -n default",
  )
  expect(commandLine(editCommand("cronjobs", "suspend", target)!)).toBe(
    `kubectl patch cronjobs api -n default --type=merge -p '{"spec":{"suspend":true}}'`,
  )
  const evict = editCommand("pods", "evict", target)!
  expect(commandLine(evict)).toBe(`kubectl create -f - <<'EOF'\n${evict.stdin}\nEOF`)
  expect(commandLine(editCommand("pods", "shell", { ...target, container: "app" })!)).toBe(
    "kubectl exec -i -t -n default api -c app -- sh -c 'clear; (bash || ash || sh)'",
  )
  expect(commandLine(editCommand("pods", "shell", target)!)).toBe("kubectl exec -i -t -n default api -- sh -c 'clear; (bash || ash || sh)'")
})

test("picks a shell container and the ports to forward", () => {
  const single = { spec: { containers: [{ name: "app", ports: [{ containerPort: 8080 }, { containerPort: 8080 }] }] } }
  const pair = { spec: { containers: [{ name: "app" }, { name: "sidecar", ports: [{ containerPort: 9090 }] }] } }
  expect(shellContainer(single)).toBe("app")
  expect(shellContainer(pair)).toBeUndefined()
  expect(shellContainer(pair, "sidecar")).toBe("sidecar")
  expect(shellContainer({})).toBeUndefined()
  expect(declaredPorts("pods", pair)).toEqual([9090])
  expect(declaredPorts("pods", single)).toEqual([8080])
  expect(declaredPorts("services", { spec: { ports: [{ port: 80 }, { port: 80 }, { port: 443 }] } })).toEqual([80, 443])
  expect(portMappings(" 8080 9090:80 ")).toEqual(["8080", "9090:80"])
  expect(portMappings("")).toBeNull()
  expect(portMappings("0")).toBeNull()
  expect(portMappings("8080:80:1")).toBeNull()
  expect(portMappings("65536")).toBeNull()
})

test("deletes a discovered kind only when its API allows delete", () => {
  const extra: ResourceKind[] = [
    { id: "clusterroles", label: "Cluster Role", resource: "clusterroles", namespaced: false, group: 8, deletable: true, columns: [] },
    { id: "componentstatuses", label: "Component Status", resource: "componentstatuses", namespaced: false, group: 8, columns: [] },
    { id: "roles", label: "Role", resource: "roles", namespaced: true, group: 8, deletable: true, columns: [] },
  ]
  expect(editActions("clusterroles", false, extra).map((action) => action.id)).toEqual(["delete", "edit"])
  expect(editActions("componentstatuses", false, extra)).toEqual([])
  expect(editCommand("componentstatuses", "delete", target, undefined, extra)).toBeNull()
  expect(editCommand("clusterroles", "delete", { name: "admin", namespace: "" }, undefined, extra)?.args).toEqual([
    "delete",
    "clusterroles",
    "admin",
    "--wait=false",
  ])
  expect(editCommand("roles", "delete", target, undefined, extra)?.args).toEqual(["delete", "roles", "api", "-n", "default", "--wait=false"])
})

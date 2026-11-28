import { expect, test } from "bun:test"
import { helmKinds } from "../helm/kinds"
import { columnWidth, controlledKind, controllerOf, findKind, fitParts, formatAge, kindIdFor, logContainerNames, menuKinds, ownedItems, podContainers, resourceKinds, sidebarKinds, sidebarLabel, type KubernetesObject } from "."

test("places helm kinds after events and before sidebar custom resources", () => {
  const ids = sidebarKinds([
    ...helmKinds,
    { id: "certificates", label: "Certificates", resource: "certificates", namespaced: true, group: 15, sidebar: true, columns: [] },
  ]).map((kind) => kind.id)
  expect(ids.indexOf("charts")).toBe(ids.indexOf("events") + 1)
  expect(ids.indexOf("releases")).toBe(ids.indexOf("charts") + 1)
  expect(ids.indexOf("certificates")).toBe(ids.indexOf("releases") + 1)
  expect(helmKinds.map((kind) => kind.mark)).toEqual(["Helm", "Helm"])
})

test("abbreviates sidebar kinds of more than two words", () => {
  expect(sidebarLabel("NetworkPolicies")).toBe("NetworkPolicies")
  expect(sidebarLabel("StatefulSets")).toBe("StatefulSets")
  expect(sidebarLabel("PersistentVolumes")).toBe("PersistentVolumes")
  expect(sidebarLabel("Endpoints")).toBe("Endpoints")
  expect(sidebarLabel("PodMetrics")).toBe("PodMetrics")
  expect(sidebarLabel("HorizontalPodAutoscalers")).toBe("HPAs")
  expect(sidebarLabel("PodDisruptionBudgets")).toBe("PDBs")
  expect(sidebarLabel("PersistentVolumeClaims")).toBe("PVCs")
  expect(sidebarLabel("CiliumLoadBalancerIPPools")).toBe("CLBIPs")
})

test("formats ages in the largest fitting unit", () => {
  const now = Date.parse("2026-01-02T00:00:00Z")
  expect(formatAge(undefined, now)).toBe("")
  expect(formatAge("not-a-date", now)).toBe("")
  expect(formatAge(new Date(now - 45_000).toISOString(), now)).toBe("45s")
  expect(formatAge(new Date(now - 120_000).toISOString(), now)).toBe("2m")
  expect(formatAge(new Date(now - 7_200_000).toISOString(), now)).toBe("2h")
  expect(formatAge(new Date(now - 172_800_000).toISOString(), now)).toBe("2d")
})

test("derives ready and progressing workload status", () => {
  const deployments = findKind("deployments")
  const daemonsets = findKind("daemonsets")
  const status = (kindId: string, object: KubernetesObject) =>
    findKind(kindId)?.columns.find((column) => column.id === "status")?.cell(object, 0)

  expect(resourceKinds.slice(0, 5).map((kind) => kind.id)).toEqual(["nodes", "pods", "deployments", "statefulsets", "daemonsets"])
  expect(status("deployments", { spec: { replicas: 2 }, status: { readyReplicas: 2 } })).toEqual({
    text: "Ready",
    tone: "ready",
  })
  expect(status("statefulsets", { spec: { replicas: 2 }, status: { readyReplicas: 1 } })).toEqual({
    text: "Progressing",
    tone: "progress",
  })
  expect(status("daemonsets", { status: { desiredNumberScheduled: 3, numberReady: 3 } })).toEqual({
    text: "Ready",
    tone: "ready",
  })
  expect(deployments?.columns.find((column) => column.id === "ready")?.cell({ spec: { replicas: 2 }, status: { readyReplicas: 1 } }, 0)).toEqual({
    text: "1/2",
  })
  expect(daemonsets?.resource).toBe("daemonsets")
})

test("groups the extra kinds and reads pod readiness", () => {
  expect(resourceKinds.map((kind) => kind.group)).toEqual([-1, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6])
  expect(resourceKinds.map((kind) => kind.label)).toEqual([
    "Nodes",
    "Pods",
    "Deployments",
    "StatefulSets",
    "DaemonSets",
    "ReplicaSets",
    "Jobs",
    "CronJobs",
    "ConfigMaps",
    "Secrets",
    "HorizontalPodAutoscalers",
    "PodDisruptionBudgets",
    "Services",
    "Ingresses",
    "NetworkPolicies",
    "StorageClasses",
    "PersistentVolumeClaims",
    "PersistentVolumes",
    "Namespaces",
    "ResourceQuotas",
    "LimitRanges",
    "ServiceAccounts",
    "RoleBindings",
    "Events",
  ])
  expect(findKind("nodes")?.namespaced).toBe(false)
  expect(findKind("nodes")?.columns.find((column) => column.id === "status")?.cell({
    status: { conditions: [{ type: "Ready", status: "True" }] },
  }, 0)).toEqual({ text: "Ready", tone: "ready" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "status")?.cell({
    spec: { unschedulable: true },
    status: { conditions: [{ type: "Ready", status: "True" }] },
  }, 0)).toEqual({ text: "Ready,SchedulingDisabled", tone: "progress" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "roles")?.cell({
    metadata: { labels: { "node-role.kubernetes.io/control-plane": "" } },
  }, 0)).toEqual({ text: "control-plane" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "roles")?.cell({}, 0)).toEqual({ text: "<none>" })
  const node = {
    usage: { cpu: "250m", memory: "1452Mi" },
    status: { allocatable: { cpu: "4", memory: "16Gi" } },
  }
  expect(findKind("nodes")?.columns.map((column) => column.id)).toEqual([
    "name",
    "status",
    "roles",
    "version",
    "cpu",
    "cpuPercent",
    "memory",
    "memoryPercent",
    "age",
  ])
  expect(findKind("nodes")?.columns.find((column) => column.id === "cpu")?.cell(node, 0)).toEqual({ text: "250m" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "cpuPercent")?.cell(node, 0)).toEqual({ text: "6%" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "memory")?.cell(node, 0)).toEqual({ text: "1452Mi" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "memoryPercent")?.cell(node, 0)).toEqual({ text: "9%" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "cpu")?.cell({}, 0)).toEqual({ text: "-" })
  expect(findKind("nodes")?.columns.find((column) => column.id === "memoryPercent")?.cell({ usage: { memory: "1Gi" } }, 0)).toEqual({ text: "-" })
  expect(menuKinds.map((kind) => kind.id)).not.toContain("replicasets")
  expect(menuKinds.map((kind) => kind.id)).not.toContain("resourcequotas")
  expect(menuKinds.map((kind) => kind.id)).not.toContain("limitranges")
  expect(menuKinds.map((kind) => kind.id)).toContain("rolebindings")
  const withCustom = sidebarKinds([
    { id: "roles", label: "Roles", resource: "roles", namespaced: true, group: 8, columns: [] },
    { id: "gitrepositories", label: "GitRepositories", resource: "gitrepositories.v1.source.toolkit.fluxcd.io", apiVersion: "source.toolkit.fluxcd.io/v1", namespaced: true, group: 10, columns: [] },
    { id: "helmreleases", label: "HelmReleases", resource: "helmreleases.v2.helm.toolkit.fluxcd.io", apiVersion: "helm.toolkit.fluxcd.io/v2", namespaced: true, group: 10, sidebar: true, columns: [] },
    { id: "volumesnapshots", label: "VolumeSnapshots", resource: "volumesnapshots.v1.snapshot.storage.k8s.io", apiVersion: "snapshot.storage.k8s.io/v1", namespaced: true, group: 13, sidebar: true, columns: [] },
    { id: "gateways", label: "Gateways", resource: "gateways.v1.gateway.networking.k8s.io", apiVersion: "gateway.networking.k8s.io/v1", namespaced: true, group: 15, columns: [] },
    { id: "gateways.networking.istio.io", label: "Gateways", resource: "gateways.v1.networking.istio.io", apiVersion: "networking.istio.io/v1", namespaced: true, group: 12, sidebar: true, columns: [] },
    { id: "certificates", label: "Certificates", resource: "certificates.v1.cert-manager.io", apiVersion: "cert-manager.io/v1", namespaced: true, group: 15, sidebar: true, columns: [] },
    { id: "orders", label: "Orders", resource: "orders.v1.acme.cert-manager.io", apiVersion: "acme.cert-manager.io/v1", namespaced: true, group: 15, columns: [] },
    { id: "nodepools", label: "NodePools", resource: "nodepools.v1.karpenter.sh", apiVersion: "karpenter.sh/v1", namespaced: false, group: 16, sidebar: true, columns: [] },
    { id: "ec2nodeclasses", label: "EC2NodeClasses", resource: "ec2nodeclasses.v1.karpenter.k8s.aws", apiVersion: "karpenter.k8s.aws/v1", namespaced: false, group: 16, columns: [] },
    { id: "scaledobjects", label: "ScaledObjects", resource: "scaledobjects.v1alpha1.keda.sh", apiVersion: "keda.sh/v1alpha1", namespaced: true, group: 17, sidebar: true, columns: [] },
    { id: "clusterpolicies", label: "ClusterPolicies", resource: "clusterpolicies.v2beta1.kyverno.io", apiVersion: "kyverno.io/v2beta1", namespaced: false, group: 18, sidebar: true, columns: [] },
    { id: "backups", label: "Backups", resource: "backups.v1.velero.io", apiVersion: "velero.io/v1", namespaced: true, group: 19, sidebar: true, columns: [] },
    { id: "servers", label: "Servers", resource: "servers.v1beta3.policy.linkerd.io", apiVersion: "policy.linkerd.io/v1beta3", namespaced: true, group: 20, sidebar: true, columns: [] },
  ])
  expect(withCustom.map((kind) => kind.id)).toEqual([
    ...menuKinds.map((kind) => kind.id),
    "helmreleases",
    "volumesnapshots",
    "gateways.networking.istio.io",
    "certificates",
    "nodepools",
    "scaledobjects",
    "clusterpolicies",
    "backups",
    "servers",
  ])
  expect(findKind("storageclasses")?.namespaced).toBe(false)
  expect(findKind("pods")?.columns.find((column) => column.id === "restarts")?.cell({
    status: {
      initContainerStatuses: [{ restartCount: 2 }],
      containerStatuses: [{ restartCount: 3 }, {}, { restartCount: 1 }],
    },
  }, 0)).toEqual({ text: "6" })
  expect(findKind("pods")?.columns.find((column) => column.id === "ready")?.cell({
    spec: { containers: [{}, {}] },
    status: { containerStatuses: [{ ready: true }, { ready: false }] },
  }, 0)).toEqual({ text: "1/2" })
  expect(findKind("pods")?.columns.find((column) => column.id === "containers")?.cell({
    spec: {
      initContainers: [{ name: "init" }],
      containers: [{ name: "app" }, { name: "wait" }, { name: "done" }],
    },
    status: {
      initContainerStatuses: [{ name: "init", state: { terminated: { reason: "Completed", exitCode: 0 } } }],
      containerStatuses: [
        { name: "app", ready: true },
        { name: "wait", ready: false },
        { name: "done", state: { terminated: { exitCode: 0 } } },
      ],
    },
  }, 0)).toEqual({
    text: "● ● ○ ○",
    parts: [
      { text: "●", tone: "ready" },
      { text: " " },
      { text: "●", tone: "progress" },
      { text: " " },
      { text: "○", tone: "muted" },
      { text: " " },
      { text: "○", tone: "muted" },
    ],
  })
  expect(fitParts([{ text: "●", tone: "ready" }, { text: " " }, { text: "○", tone: "muted" }], 2)).toEqual([
    { text: "●", tone: "ready" },
    { text: " " },
  ])
})

test("shows running containers before completed init containers", () => {
  const names = ["config", "mount-cgroup", "apply-sysctl-overwrites", "mount-bpf-fs", "clean-cilium-state", "install-cni-binaries"]
  const object: KubernetesObject = {
    spec: {
      initContainers: names.map((name) => ({ name })),
      containers: [{ name: "cilium-agent" }],
    },
    status: {
      initContainerStatuses: names.map((name) => ({
        name,
        ready: true,
        state: { terminated: { reason: "Completed", exitCode: 0 } },
      })),
      containerStatuses: [{ name: "cilium-agent", ready: true }],
    },
  }
  const column = findKind("pods")?.columns.find((item) => item.id === "containers")
  const text = "● ○ ○ ○ ○ ○ ○"
  expect(column?.cell(object, 0)).toEqual({
    text,
    parts: [...text].map((char) => (char === " " ? { text: " " } : { text: char, tone: char === "●" ? "ready" as const : "muted" as const })),
  })
  expect(column && columnWidth(column, [object], 0)).toBe(text.length)
})

test("lists containers for a pod without adding a sidebar kind", () => {
  expect(resourceKinds.map((kind) => kind.id)).not.toContain("containers")
  const rows = podContainers({
    spec: {
      initContainers: [
        { name: "init", image: "busybox" },
        { name: "mesh", image: "proxy", restartPolicy: "Always", resources: { requests: { cpu: "10m" }, limits: { memory: "32Mi" } } },
      ],
      containers: [{ name: "app", image: "nginx:1.27", resources: { requests: { cpu: "100m", memory: "64Mi" }, limits: { cpu: "200m", memory: "128Mi" } } }],
      ephemeralContainers: [{ name: "debug", image: "busybox:debug" }],
    },
    status: {
      initContainerStatuses: [
        { name: "init", restartCount: 1, state: { terminated: { reason: "Completed", exitCode: 0 } } },
        { name: "mesh", ready: true, restartCount: 2, state: { running: { startedAt: "2026-11-14T00:00:00Z" } } },
      ],
      containerStatuses: [{ name: "app", ready: false, restartCount: 4, state: { waiting: { reason: "CrashLoopBackOff" } } }],
      ephemeralContainerStatuses: [{ name: "debug", state: { terminated: { exitCode: 1 } } }],
    },
  })
  expect(rows.map((row) => row.type)).toEqual(["container", "init", "sidecar", "ephemeral"])
  expect(rows.map((row) => row.name)).toEqual(["app", "init", "mesh", "debug"])
  expect(rows[0]).toMatchObject({ status: "CrashLoopBackOff", tone: "progress", restarts: 4, cpu: "100m/200m", memory: "64Mi/128Mi", image: "nginx:1.27" })
  expect(rows[1]).toMatchObject({ status: "Completed", tone: "muted", restarts: 1, cpu: "-", memory: "-", image: "busybox" })
  expect(rows[2]).toMatchObject({ status: "Running", tone: "ready", restarts: 2, cpu: "10m/-", memory: "-/32Mi" })
  expect(rows[3]).toMatchObject({ status: "Error", tone: "progress", restarts: 0, image: "busybox:debug" })
  expect(podContainers({})).toEqual([])
})

test("names containers for a pod, a workload, and a cronjob", () => {
  expect(logContainerNames("pods", {
    spec: {
      containers: [{ name: "" }, { name: "app" }],
      initContainers: [{ name: "init" }],
      ephemeralContainers: [{ name: "debug" }],
    },
  })).toEqual(["app", "init", "debug"])
  expect(logContainerNames("deployments", {
    spec: { template: { spec: { containers: [{ name: "app" }], initContainers: [{ name: "init" }] } } },
  } as KubernetesObject)).toEqual(["app", "init"])
  expect(logContainerNames("cronjobs", {
    spec: { jobTemplate: { spec: { template: { spec: { containers: [{ name: "job" }], ephemeralContainers: [{ name: "debug" }] } } } } },
  } as KubernetesObject)).toEqual(["job", "debug"])
  expect(logContainerNames("deployments", {})).toEqual([])
})

test("follows the controller and the resources it owns", () => {
  const pod: KubernetesObject = {
    metadata: {
      name: "web-abc",
      namespace: "default",
      ownerReferences: [
        { kind: "Deployment", name: "web", uid: "other" },
        { kind: "ReplicaSet", name: "web-1", uid: "rs", controller: true },
      ],
    },
  }
  const replica: KubernetesObject = {
    metadata: {
      name: "web-1",
      namespace: "default",
      uid: "rs",
      ownerReferences: [{ kind: "Deployment", name: "web", uid: "deploy", controller: true }],
    },
  }
  const stray: KubernetesObject = {
    metadata: {
      name: "web-2",
      namespace: "default",
      ownerReferences: [{ kind: "ReplicaSet", name: "web-1", uid: "nope", controller: false }],
    },
  }

  expect(controllerOf(pod)).toEqual({ kind: "ReplicaSet", name: "web-1", uid: "rs" })
  expect(controllerOf({})).toBeNull()
  expect(kindIdFor("ReplicaSet")).toBe("replicasets")
  expect(controlledKind("deployments")).toBe("replicasets")
  expect(controlledKind("replicasets")).toBe("pods")
  expect(controlledKind("pods")).toBeUndefined()
  expect(ownedItems([pod, replica, stray], { uid: "rs", kind: "ReplicaSet", name: "web-1", namespace: "default" })).toEqual([pod])
  expect(ownedItems([replica], { uid: "", kind: "Deployment", name: "web", namespace: "other" })).toEqual([])
  expect(
    ownedItems(
      [{ metadata: { name: "nightly-1", namespace: "default", ownerReferences: [{ kind: "CronJob", name: "nightly", controller: true }] } }],
      { uid: "missing", kind: "CronJob", name: "nightly", namespace: "default" },
    ),
  ).toHaveLength(1)
})

import { read, show } from "../resources/columns"
import { compareObjects } from "../resources/format"
import type { HelmData, KubernetesObject } from "../resources/types"

interface StoredRelease {
  name: string
  namespace: string
  version: number
  status: string
  description: string
  notes: string
  updated: string
  chartName: string
  chartVersion: string
  appVersion: string
}

// kubectl JSON base64-encodes secret data. Helm's value is already base64(gzip(json)), so secrets are unwrapped once more than configmaps.
export function storedReleases(secretsPayload: string, configMapsPayload: string): KubernetesObject[] {
  const latest = new Map<string, KubernetesObject>()
  for (const object of [...readPayload(secretsPayload, true), ...readPayload(configMapsPayload, false)]) {
    const key = `${object.metadata?.namespace ?? ""}/${object.metadata?.name ?? ""}`
    const current = latest.get(key)
    if (!current || revision(object) > revision(current)) latest.set(key, object)
  }
  return [...latest.values()].sort(compareObjects)
}

export function chartRows(releases: readonly KubernetesObject[]): KubernetesObject[] {
  const groups = new Map<string, KubernetesObject[]>()
  for (const release of releases) {
    const chart = release.helm?.chart
    if (!chart) continue
    const rows = groups.get(chart) ?? []
    rows.push(release)
    groups.set(chart, rows)
  }
  return [...groups.entries()].map(([chart, rows]) => chartRow(chart, rows)).sort(compareObjects)
}

export function releaseDetail(object: KubernetesObject): { describe: string; json: string } {
  const helm = object.helm
  const name = object.metadata?.name ?? ""
  const namespace = object.metadata?.namespace ?? ""
  const describe = [
    `Name: ${name}`,
    `Namespace: ${namespace}`,
    `Status: ${helm?.status ?? ""}`,
    `Revision: ${helm?.revision ?? ""}`,
    `Chart: ${helm?.chart ?? ""}`,
    `App Version: ${helm?.appVersion ?? ""}`,
    `Updated: ${helm?.updated ?? ""}`,
    "",
    "Description:",
    helm?.description ?? "",
    "",
    "Notes:",
    helm?.notes ?? "",
  ].join("\n")
  return {
    describe,
    json: JSON.stringify(
      {
        name,
        namespace,
        revision: helm?.revision ?? "",
        status: helm?.status ?? "",
        description: helm?.description ?? "",
        notes: helm?.notes ?? "",
        updated: helm?.updated ?? "",
        chart: { name: helm?.chartName ?? "", version: helm?.version ?? "", appVersion: helm?.appVersion ?? "" },
      },
      null,
      2,
    ),
  }
}

export function chartDetail(name: string, releases: readonly KubernetesObject[]): { describe: string; yaml: string; json: string } {
  const rows = releases.filter((item) => item.helm?.chart === name)
  const helm = chartSummary(name, rows)
  const chartName = helm.chartName
  const version = helm.version
  const appVersion = helm.appVersion
  const status = helm.status
  const listed = rows.map((item) => ({
    namespace: item.metadata?.namespace ?? "",
    name: item.metadata?.name ?? "",
    status: item.helm?.status ?? "",
    revision: item.helm?.revision ?? "",
  }))
  const describe = [
    `Chart: ${chartName}`,
    `Version: ${version}`,
    `App Version: ${appVersion}`,
    `Releases: ${rows.length}`,
    `Status: ${status}`,
    "",
    ...listed.map((item) => `${item.namespace}  ${item.name}  ${item.status}  ${item.revision}`),
  ].join("\n")
  const yaml = [
    `name: ${yamlScalar(chartName)}`,
    `version: ${yamlScalar(version)}`,
    `appVersion: ${yamlScalar(appVersion)}`,
    `status: ${yamlScalar(status)}`,
    "releases:",
    ...listed.flatMap((item) => [
      `- namespace: ${yamlScalar(item.namespace)}`,
      `  name: ${yamlScalar(item.name)}`,
      `  status: ${yamlScalar(item.status)}`,
      `  revision: ${yamlScalar(item.revision)}`,
    ]),
  ].join("\n")
  return {
    describe,
    yaml,
    json: JSON.stringify({ name: chartName, version, appVersion, status, releases: listed }, null, 2),
  }
}

export function rollupStatus(statuses: readonly string[]): string {
  if (statuses.length === 0) return ""
  if (statuses.every((status) => status === "deployed")) return "Ready"
  if (statuses.some((status) => status === "failed")) return "Failed"
  return "Progressing"
}

function chartRow(chart: string, rows: readonly KubernetesObject[]): KubernetesObject {
  return { metadata: { name: chart, uid: chart }, helm: chartSummary(chart, rows) }
}

function chartSummary(chart: string, rows: readonly KubernetesObject[]): HelmData {
  const first = rows[0]?.helm
  const appVersions = new Set(rows.map((item) => item.helm?.appVersion ?? ""))
  return {
    status: rollupStatus(rows.map((item) => item.helm?.status ?? "")),
    chart,
    chartName: first?.chartName ?? chart,
    version: first?.version ?? "",
    appVersion: appVersions.size === 1 ? (first?.appVersion ?? "") : "",
    revision: "",
    updated: "",
    description: "",
    notes: "",
    releases: rows.length,
  }
}

function readPayload(payload: string, secret: boolean): KubernetesObject[] {
  if (!payload.trim().startsWith("{")) return []
  try {
    return listItems(payload).flatMap((item) => {
      const object = objectFrom(item.release, secret)
      return object ? [object] : []
    })
  } catch {
    return []
  }
}

function listItems(payload: string): { release: string }[] {
  const items = read(JSON.parse(payload), "items")
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const release = read(item, "data", "release")
    return typeof release === "string" && release !== "" ? [{ release }] : []
  })
}

function objectFrom(payload: string, secret: boolean): KubernetesObject | undefined {
  try {
    const text = secret ? Buffer.from(payload, "base64").toString() : payload
    return releaseObject(decodeRelease(text))
  } catch {
    return undefined
  }
}

function decodeRelease(payload: string): unknown {
  const encoded = Buffer.from(payload, "base64")
  const bytes = encoded[0] === 0x1f && encoded[1] === 0x8b ? Bun.gunzipSync(encoded) : encoded
  return JSON.parse(Buffer.from(bytes).toString())
}

function releaseObject(value: unknown): KubernetesObject | undefined {
  const stored = readStored(value)
  // Superseded revisions are history. Uninstalled releases are hidden by helm list too.
  if (!stored || stored.status === "superseded" || stored.status === "uninstalled") return undefined
  const helm: HelmData = {
    status: stored.status,
    chart: `${stored.chartName}-${stored.chartVersion}`,
    chartName: stored.chartName,
    version: stored.chartVersion,
    appVersion: stored.appVersion,
    revision: String(stored.version),
    updated: stored.updated,
    description: stored.description,
    notes: stored.notes,
  }
  return {
    metadata: { name: stored.name, namespace: stored.namespace, uid: `${stored.namespace}/${stored.name}` },
    helm,
  }
}

function readStored(value: unknown): StoredRelease | undefined {
  const name = show(read(value, "name"))
  const namespace = show(read(value, "namespace"))
  const version = read(value, "version")
  if (!name || !namespace || typeof version !== "number" || !Number.isInteger(version)) return undefined
  const chartName = show(read(value, "chart", "metadata", "name"))
  const chartVersion = show(read(value, "chart", "metadata", "version"))
  if (!chartName || !chartVersion) return undefined
  return {
    name,
    namespace,
    version,
    status: show(read(value, "info", "status")),
    description: show(read(value, "info", "description")),
    notes: show(read(value, "info", "notes")),
    updated: show(read(value, "info", "last_deployed")),
    chartName,
    chartVersion,
    appVersion: show(read(value, "chart", "metadata", "appVersion")),
  }
}

function revision(object: KubernetesObject): number {
  return Number(object.helm?.revision ?? "0")
}

function yamlScalar(value: string): string {
  if (value !== "" && /^[A-Za-z0-9._+/-]+$/.test(value)) return value
  return JSON.stringify(value)
}

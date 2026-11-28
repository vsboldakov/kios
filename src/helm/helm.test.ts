import { expect, test } from "bun:test"
import { helmKinds } from "./kinds"
import { chartRows, storedReleases } from "./releases"
import { matchChart, valuesDocument } from "./values"

function release(
  version: number,
  status: string,
  chart = "nginx",
  chartVersion = "1.2.3",
  appVersion = "1.25.0",
  namespace = "default",
  name = "web",
) {
  return {
    name,
    namespace,
    version,
    info: { status, description: "installed", notes: "hello", last_deployed: "2026-01-02T00:00:00Z" },
    chart: { metadata: { name: chart, version: chartVersion, appVersion } },
    config: { replicaCount: 2 },
  }
}

function helmEncoded(value: unknown): string {
  return Buffer.from(Bun.gzipSync(Buffer.from(JSON.stringify(value)))).toString("base64")
}

function secretData(value: unknown): string {
  return Buffer.from(helmEncoded(value)).toString("base64")
}

function list(releases: string[]): string {
  return JSON.stringify({ items: releases.map((release) => ({ data: { release } })) })
}

test("decodes helm release secrets and keeps the newest revision", () => {
  const secrets = list([
    secretData(release(1, "deployed")),
    secretData(release(4, "failed")),
    secretData(release(6, "superseded")),
    secretData(release(3, "uninstalled", "nginx", "1.2.3", "1.25.0", "default", "old")),
    "%%%%",
    secretData(release(1, "deployed", "nginx", "1.2.3", "1.25.0", "prod", "api")),
  ])
  const configMaps = list([
    helmEncoded(release(2, "deployed", "redis", "2.0.0", "7", "default", "cache")),
    helmEncoded(release(5, "pending-upgrade")),
  ])
  const rows = storedReleases(secrets, configMaps)
  expect(rows.map((row) => `${row.metadata?.namespace}/${row.metadata?.name} ${row.helm?.revision} ${row.helm?.status}`)).toEqual([
    "default/cache 2 deployed",
    "default/web 5 pending-upgrade",
    "prod/api 1 deployed",
  ])
  const web = rows.find((row) => row.metadata?.name === "web")
  expect(web?.helm).toMatchObject({
    chart: "nginx-1.2.3",
    chartName: "nginx",
    version: "1.2.3",
    appVersion: "1.25.0",
    description: "installed",
    notes: "hello",
    updated: "2026-01-02T00:00:00Z",
  })
  const status = helmKinds.find((kind) => kind.id === "releases")?.columns.find((column) => column.id === "status")
  expect(status?.cell(rows.find((row) => row.metadata?.name === "api") ?? {}, 0)).toEqual({ text: "deployed", tone: "ready" })
  expect(status?.cell(web ?? {}, 0)).toEqual({ text: "pending-upgrade", tone: "progress" })
})

test("rolls installed charts up by name and version", () => {
  const releases = storedReleases(list([
    secretData(release(1, "deployed", "nginx", "1.2.3", "1.25.0", "default", "web")),
    secretData(release(1, "deployed", "nginx", "1.2.3", "1.25.0", "prod", "edge")),
    secretData(release(1, "pending-upgrade", "nginx", "2.0.0", "1.26.0", "default", "next")),
    secretData(release(1, "failed", "redis", "1.0.0", "7", "default", "cache")),
    secretData(release(1, "deployed", "redis", "1.0.0", "8", "prod", "queue")),
    secretData(release(1, "uninstalled", "minio", "5.0.0", "1", "default", "blob")),
    secretData(release(9, "superseded", "nginx", "1.2.3", "1.25.0", "default", "web")),
  ]), "")
  const charts = chartRows(releases)
  expect(charts.map((row) => ({
    name: row.helm?.chartName,
    version: row.helm?.version,
    app: row.helm?.appVersion,
    releases: row.helm?.releases,
    status: row.helm?.status,
  }))).toEqual([
    { name: "nginx", version: "1.2.3", app: "1.25.0", releases: 2, status: "Ready" },
    { name: "nginx", version: "2.0.0", app: "1.26.0", releases: 1, status: "Progressing" },
    { name: "redis", version: "1.0.0", app: "", releases: 2, status: "Failed" },
  ])
  const status = helmKinds.find((kind) => kind.id === "charts")?.columns.find((column) => column.id === "status")
  expect(status?.cell(charts[0] ?? {}, 0)).toEqual({ text: "Ready", tone: "ready" })
  expect(status?.cell(charts[2] ?? {}, 0)).toEqual({ text: "Failed", tone: "progress" })
})

test("keeps one repo chart and rejects zero or several", () => {
  const payload = JSON.stringify([
    { name: "bitnami/nginx", version: "1.2.3" },
    { name: "stable/nginx", version: "1.2.3" },
    { name: "bitnami/nginx", version: "1.2.4" },
    { name: "nginx", version: "1.2.3" },
  ])
  expect(matchChart(payload, "nginx", "1.2.4")).toEqual({ chart: "bitnami/nginx" })
  expect(matchChart(payload, "nginx", "1.2.3")).toEqual({ error: "chart nginx 1.2.3 matches more than one repo" })
  expect(matchChart(payload, "redis", "1.0.0")).toEqual({ error: "chart redis 1.0.0 is not in a configured helm repo" })
  expect(matchChart("nope", "nginx", "1.2.3")).toEqual({ error: "chart nginx 1.2.3 is not in a configured helm repo" })
  expect(valuesDocument("null\n")).toBe("{}\n")
  expect(valuesDocument("")).toBe("{}\n")
  expect(valuesDocument("replicaCount: 2")).toBe("replicaCount: 2\n")
  expect(valuesDocument("replicaCount: 2\n")).toBe("replicaCount: 2\n")
})

import { column, listed, read, show, statusColumn } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "argoproj.io"
const versions = ["v1alpha1"]

export const argocd = pack(14, [
  argo("applications", "Application", true, listed(true, [
    statusColumn("sync", "SYNC", 10, (object) => show(read(object.status, "sync", "status")), ["Synced"]),
    statusColumn("health", "HEALTH", 12, (object) => show(read(object.status, "health", "status")), ["Healthy"]),
    column("revision", "REVISION", 12, (object) => show(read(object.status, "sync", "revision")).slice(0, 12)),
    column("project", "PROJECT", 12, (object) => show(read(object.spec, "project")), true),
  ])),
  argo("applicationsets", "ApplicationSet", true, listed(true, [
    column("generators", "GENERATORS", 10, (object) => count(read(object.spec, "generators"))),
  ])),
  argo("appprojects", "AppProject", false, listed(false, [
    column("sources", "SOURCES", 8, (object) => count(read(object.spec, "sourceRepos"))),
  ])),
])

function argo(plural: string, kind: string, namespaced: boolean, columns: CustomResource["columns"]): CustomResource {
  return { group, versions, plural, kind, namespaced, columns, sidebar: true }
}

function count(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return String(value.length)
}

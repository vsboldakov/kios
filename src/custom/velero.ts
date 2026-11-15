import { formatAge } from "../resources/format"
import type { Column } from "../resources/types"
import { column, listed, read, show, statusColumn } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "velero.io"
const versions = ["v1"]

export const velero = pack(19, [
  veleroResource("backups", "Backup", listed(true, [
    column("location", "LOCATION", 16, (object) => show(read(object.spec, "storageLocation"))),
    phase(["Completed"]),
    column("errors", "ERRORS", 6, (object) => show(read(object.status, "errors")), true),
  ]), [], true),
  veleroResource("restores", "Restore", listed(true, [
    column("backup", "BACKUP", 16, (object) => show(read(object.spec, "backupName")), true),
    phase(["Completed"]),
    column("errors", "ERRORS", 6, (object) => show(read(object.status, "errors"))),
  ]), [], true),
  veleroResource("schedules", "Schedule", listed(true, [
    column("schedule", "SCHEDULE", 12, (object) => show(read(object.spec, "schedule")), true),
    column("paused", "PAUSED", 6, (object) => (read(object.spec, "paused") === true ? "True" : "False")),
    lastBackup(),
    phase(["Enabled"]),
  ]), [], true),
  veleroResource("backupstoragelocations", "BackupStorageLocation", listed(true, [
    column("provider", "PROVIDER", 12, (object) => show(read(object.spec, "provider"))),
    column("bucket", "BUCKET", 16, (object) => show(read(object.spec, "objectStorage", "bucket")), true),
    phase(["Available"]),
  ]), ["bsl"], true),
  veleroResource("volumesnapshotlocations", "VolumeSnapshotLocation", listed(true, [
    column("provider", "PROVIDER", 12, (object) => show(read(object.spec, "provider")), true),
  ]), ["vsl"]),
])

function veleroResource(
  plural: string,
  kind: string,
  columns: CustomResource["columns"],
  aliases: readonly string[] = [],
  sidebar = false,
): CustomResource {
  return { group, versions, plural, kind, namespaced: true, columns, aliases, ...(sidebar ? { sidebar: true } : {}) }
}

function phase(ready: readonly string[]): Column {
  return statusColumn("phase", "PHASE", 16, (object) => show(read(object.status, "phase")), ready)
}

function lastBackup(): Column {
  return {
    id: "last",
    header: "LAST",
    width: 5,
    cell: (object, now) => ({ text: formatAge(show(read(object.status, "lastBackup")) || undefined, now), tone: "muted" }),
  }
}

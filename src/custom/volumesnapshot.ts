import { boolColumn, column, listed, read, show } from "../resources/columns"
import { pack, type CustomResource } from "./install"

const group = "snapshot.storage.k8s.io"
const versions = ["v1", "v1beta1"]

export const volumesnapshot = pack(13, [
  snapshot("volumesnapshots", "VolumeSnapshot", true, listed(true, [
    boolColumn("ready", "READY", 5, (object) => read(object.status, "readyToUse")),
    column("source", "SOURCE", 16, (object) =>
      show(read(object.spec, "source", "persistentVolumeClaimName")) || show(read(object.spec, "source", "volumeSnapshotContentName")),
    ),
    column("restore", "RESTORE", 10, (object) => show(read(object.status, "restoreSize"))),
    column("class", "CLASS", 14, (object) => show(read(object.spec, "volumeSnapshotClassName"))),
    column("content", "CONTENT", 16, (object) => show(read(object.status, "boundVolumeSnapshotContentName")), true),
  ]), ["vs"], true),
  snapshot("volumesnapshotclasses", "VolumeSnapshotClass", false, listed(false, [
    column("driver", "DRIVER", 18, (object) => show(read(object, "driver")), true),
    column("policy", "DELETION", 12, (object) => show(read(object, "deletionPolicy"))),
  ]), ["vsclass"], false, "VolumeSnapshotClasses"),
  snapshot("volumesnapshotcontents", "VolumeSnapshotContent", false, listed(false, [
    boolColumn("ready", "READY", 5, (object) => read(object.status, "readyToUse")),
    column("restore", "RESTORE", 10, (object) => show(read(object.status, "restoreSize"))),
    column("driver", "DRIVER", 18, (object) => show(read(object.spec, "driver"))),
    column("snapshot", "SNAPSHOT", 16, (object) => show(read(object.spec, "volumeSnapshotRef", "name")), true),
  ]), ["vsc"]),
])

function snapshot(
  plural: string,
  kind: string,
  namespaced: boolean,
  columns: CustomResource["columns"],
  aliases: readonly string[] = [],
  sidebar = false,
  label?: string,
): CustomResource {
  return { group, versions, plural, kind, namespaced, columns, aliases, label, ...(sidebar ? { sidebar: true } : {}) }
}

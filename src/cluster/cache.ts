import type { KubernetesObject } from "../resources"

export function admit(object: KubernetesObject): KubernetesObject {
  const metadata = object.metadata as { managedFields?: unknown } | undefined
  if (metadata && "managedFields" in metadata) delete metadata.managedFields
  return object
}

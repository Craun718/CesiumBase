import type { DataSourceProtocol, ResourceBinding, ResourceKind } from "./types.js"

const resourceKindByProtocol: Readonly<Record<DataSourceProtocol, ResourceKind>> = {
  tianditu: "imagery",
  "terrain-quantized-mesh": "terrain",
  xyz: "imagery",
  wms: "imagery",
  wmts: "imagery",
  wfs: "vector",
  geojson: "vector",
  "3d-tiles": "tileset",
  gltf: "model",
}

/** 根据资源协议绑定推导正式资源类型。 */
export function deriveResourceKind(binding: ResourceBinding): ResourceKind {
  return resourceKindByProtocol[binding.protocol]
}

/** 将协议绑定规范化为稳定、可持久化的上游数据项 key。 */
export function createBindingKey(binding: ResourceBinding): string {
  switch (binding.protocol) {
    case "wms":
      return `wms:${binding.layer.trim()}`
    case "wmts":
      return `wmts:${binding.layer.trim()}#${binding.tileMatrixSet.trim()}#${(binding.style ?? "default").trim()}`
    case "wfs": {
      const base = `wfs:${binding.typeName.trim()}`
      const filter = binding.featureFilter
      if (!filter) return base
      const value = encodeURIComponent(String(filter.value))
      return `${base}#${filter.field.trim()}=${value}`
    }
    default:
      return "root"
  }
}

/** 校验资源绑定协议是否与服务接入协议一致。 */
export function validateResourceBinding(
  sourceProtocol: DataSourceProtocol,
  binding: ResourceBinding,
): string[] {
  if (sourceProtocol !== binding.protocol) {
    return [`资源绑定协议 ${sourceProtocol} 与服务协议 ${binding.protocol} 不一致`]
  }

  if (binding.protocol === "wms" && !binding.layer.trim()) return ["WMS layer 不能为空"]
  if (binding.protocol === "wmts") {
    const errors: string[] = []
    if (!binding.layer.trim()) errors.push("WMTS layer 不能为空")
    if (!binding.tileMatrixSet.trim()) errors.push("WMTS tileMatrixSet 不能为空")
    return errors
  }
  if (binding.protocol === "wfs" && !binding.typeName.trim()) return ["WFS typeName 不能为空"]
  return []
}

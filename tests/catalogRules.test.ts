import assert from "node:assert/strict"
import test from "node:test"
import {
  createBindingKey,
  deriveResourceKind,
  validateResourceBinding,
} from "../src/features/catalog/model/rules.js"

test("协议 binding 推导资源类型", () => {
  assert.equal(deriveResourceKind({ protocol: "3d-tiles" }), "tileset")
  assert.equal(deriveResourceKind({ protocol: "terrain-quantized-mesh" }), "terrain")
  assert.equal(deriveResourceKind({ protocol: "wfs", typeName: "gx:roads" }), "vector")
  assert.equal(deriveResourceKind({ protocol: "xyz" }), "imagery")
})

test("多数据协议生成稳定 bindingKey", () => {
  assert.equal(createBindingKey({ protocol: "wms", layer: "gx:roads" }), "wms:gx:roads")
  assert.equal(
    createBindingKey({
      protocol: "wmts",
      layer: "base",
      tileMatrixSet: "EPSG:3857",
      style: "default",
    }),
    "wmts:base#EPSG:3857#default",
  )
  assert.equal(createBindingKey({ protocol: "wfs", typeName: "gx:roads" }), "wfs:gx:roads")
  assert.equal(
    createBindingKey({
      protocol: "wfs",
      typeName: "guangxi:region",
      featureFilter: { field: "level", value: 1 },
    }),
    "wfs:guangxi:region#level=1",
  )
})

test("单数据协议使用固定 root bindingKey", () => {
  assert.equal(createBindingKey({ protocol: "3d-tiles" }), "root")
  assert.equal(createBindingKey({ protocol: "terrain-quantized-mesh" }), "root")
  assert.equal(createBindingKey({ protocol: "tianditu" }), "root")
})

test("binding 协议必须与服务协议一致", () => {
  assert.deepEqual(validateResourceBinding("wms", { protocol: "wms", layer: "gx:roads" }), [])
  assert.deepEqual(validateResourceBinding("wms", { protocol: "xyz" }), [
    "资源绑定协议 wms 与服务协议 xyz 不一致",
  ])
})

test("多数据协议 binding 必填字段不能为空", () => {
  assert.deepEqual(validateResourceBinding("wms", { protocol: "wms", layer: "  " }), [
    "WMS layer 不能为空",
  ])
  assert.deepEqual(
    validateResourceBinding("wmts", { protocol: "wmts", layer: "", tileMatrixSet: " " }),
    ["WMTS layer 不能为空", "WMTS tileMatrixSet 不能为空"],
  )
  assert.deepEqual(validateResourceBinding("wfs", { protocol: "wfs", typeName: "" }), [
    "WFS typeName 不能为空",
  ])
})

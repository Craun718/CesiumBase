import assert from "node:assert/strict"
import test from "node:test"
import { discoverTianditu } from "../src/features/catalog/protocols/tianditu.js"

const guangxiExtent = {
  west: 104.44642066955566,
  south: 20.901918411254883,
  east: 112.05737113952637,
  north: 26.388731002807617,
}

test("天地图影像返回影像底图资源且使用项目业务范围", () => {
  const result = discoverTianditu({
    sourceId: "source-tianditu",
    mapType: "imagery",
    defaultExtent: guangxiExtent,
    envAvailable: true,
  })
  const item = result.items[0]

  assert.equal(result.status, "complete")
  assert.equal(item?.kind, "imagery")
  assert.equal(item?.key, "root")
  assert.deepEqual(item?.binding, { protocol: "tianditu" })
  assert.deepEqual(item?.extent, guangxiExtent)
  assert.equal(item?.extentSource, "default-business")
})

test("天地图缺少 Key 环境变量时给出错误", () => {
  const result = discoverTianditu({
    sourceId: "source-tianditu",
    mapType: "imagery",
    defaultExtent: guangxiExtent,
    envAvailable: false,
  })

  assert.equal(result.status, "failed")
  assert.equal(
    result.issues.some((issue) => issue.level === "error" && issue.code === "tianditu-key-missing"),
    true,
  )
})

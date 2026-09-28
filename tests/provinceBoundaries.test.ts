import assert from "node:assert/strict"
import { test } from "node:test"
import * as Cesium from "cesium"
import axios from "axios"
import { addProvinceBoundaries } from "../src/map/engines/cesium/provinceBoundaries.js"

test("本地自治区数据只生成广西外遮罩，不再渲染本地省界", async () => {
  const entities: object[] = []
  const client = axios.create({ responseType: "text" })
  client.defaults.adapter = async (config) => ({
    data: JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "广西壮族自治区" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [109, 23],
                [110, 23],
                [110, 24],
                [109, 24],
                [109, 23],
              ],
            ],
          },
        },
      ],
    }),
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  })
  const viewer = {
    isDestroyed: () => false,
    entities: {
      add: (entity: object) => {
        entities.push(entity)
        return entity
      },
    },
  } as unknown as Cesium.Viewer

  await addProvinceBoundaries(viewer, client)

  assert.equal(entities.length, 1)
  assert.ok("polygon" in entities[0])
  assert.ok(!("polyline" in entities[0]))
})

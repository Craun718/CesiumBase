import assert from "node:assert/strict"
import { test } from "node:test"
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios"
import {
  loadStaticRegionCollection,
  staticRegionResources,
} from "../src/features/regions/staticRegionSource.js"

function createStaticRegionClient(): AxiosInstance {
  const client = axios.create({ responseType: "text" })
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const level = staticRegionResources.find((item) => item.url === config.url)?.level
    if (level === undefined) throw new Error(`未知静态政区地址：${config.url}`)

    return {
      data: JSON.stringify(createCollection(level)),
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }
  }
  return client
}

test("loadStaticRegionCollection 合并三级静态政区并生成父子关系", async () => {
  const collection = await loadStaticRegionCollection(createStaticRegionClient())

  assert.equal(collection.features.length, 3)
  assert.deepEqual(
    collection.features.map((feature) => feature.properties),
    [
      { code: "450000", name: "广西壮族自治区", level: 1 },
      { code: "450100", name: "南宁市", level: 2, parent_code: "450000" },
      { code: "450102", name: "兴宁区", level: 3, parent_code: "450100" },
    ],
  )
})

test("loadStaticRegionCollection 拒绝无效 gb 字段", async () => {
  const client = axios.create({ responseType: "text" })
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({
    data: JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [] },
          properties: { gb: "bad", name: "无效政区" },
        },
      ],
    }),
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  })

  await assert.rejects(() => loadStaticRegionCollection(client), /无效的 gb 字段/)
})

function createCollection(level: number) {
  const feature =
    level === 1
      ? { gb: "156450000", name: "广西壮族自治区" }
      : level === 2
        ? { gb: "156450100", name: "南宁市" }
        : { gb: "156450102", name: "兴宁区" }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [] },
        properties: feature,
      },
    ],
  }
}

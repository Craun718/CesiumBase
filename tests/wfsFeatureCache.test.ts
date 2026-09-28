import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildWfsGetFeatureUrl,
  clearWfsFeatureCacheForTests,
  filterFeatureCollection,
  loadWfsFeatureCollection,
  type WfsSourceBinding,
} from "../src/features/layers/wfsFeatureCache.js"
import type { GeoJsonFeatureCollection } from "../src/features/catalog/model/types.js"

/** ?? v1 WFS ????? */
function createRequest(): WfsSourceBinding {
  return {
    source: {
      id: "source-guangxi-region-wfs",
      name: "Region WFS",
      sortOrder: 70,
      enabled: true,
      protocol: "wfs",
      connection: {
        baseUrl: "https://example.com/geoserver/guangxi/wfs",
        version: "2.0.0",
        authToken: "region-token",
      },
      verification: { status: "verified", issues: [] },
    },
    binding: {
      protocol: "wfs",
      typeName: "guangxi:region",
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      maxFeatures: 10_000,
    },
  }
}

/** ???? FeatureCollection? */
function createCollection(): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: 1,
        geometry: { type: "MultiPolygon", coordinates: [] },
        properties: { code: "450000000000", name: "Guangxi", level: 1 },
      },
      {
        type: "Feature",
        id: 2,
        geometry: { type: "MultiPolygon", coordinates: [] },
        properties: { code: "450100000000", name: "Nanning", level: 2 },
      },
    ],
  }
}

test("buildWfsGetFeatureUrl reads source connection and resource binding", () => {
  const url = buildWfsGetFeatureUrl(createRequest(), 1)
  assert.equal(
    url,
    "https://example.com/geoserver/guangxi/wfs?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&TYPENAMES=guangxi%3Aregion&OUTPUTFORMAT=application%2Fjson&SRSNAME=EPSG%3A4326&MAXFEATURES=1",
  )
})

test("loadWfsFeatureCollection reuses same request", async () => {
  clearWfsFeatureCacheForTests()
  const request = createRequest()
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init })
    return new Response(JSON.stringify(createCollection()), { status: 200 })
  }

  const [first, second] = await Promise.all([
    loadWfsFeatureCollection(request, fetchImpl),
    loadWfsFeatureCollection(request, fetchImpl),
  ])

  assert.equal(requests.length, 1)
  assert.equal(first, second)
  assert.equal(requests[0]?.url.startsWith("https://example.com/geoserver/guangxi/wfs?"), true)
  const headers = requests[0]?.init?.headers
  assert.ok(headers instanceof Headers)
  assert.equal(headers.get("Authorization"), "Bearer region-token")
})

test("filterFeatureCollection filters by structured field", () => {
  const filtered = filterFeatureCollection(createCollection(), { field: "level", value: 2 })
  assert.equal(filtered.features.length, 1)
  assert.equal(filtered.features[0]?.properties?.code, "450100000000")
})

test("loadWfsFeatureCollection does not cache failed request", async () => {
  clearWfsFeatureCacheForTests()
  const request = createRequest()
  let count = 0
  const fetchImpl: typeof fetch = async () => {
    count += 1
    return count === 1
      ? new Response("Service unavailable", { status: 503 })
      : new Response(JSON.stringify(createCollection()), { status: 200 })
  }

  await assert.rejects(() => loadWfsFeatureCollection(request, fetchImpl), /HTTP 503/)
  const recovered = await loadWfsFeatureCollection(request, fetchImpl)

  assert.equal(count, 2)
  assert.equal(recovered.features.length, 2)
})

test("loadWfsFeatureCollection validates GeoJSON structure", async () => {
  clearWfsFeatureCacheForTests()
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ type: "Feature" }), { status: 200 })

  await assert.rejects(() => loadWfsFeatureCollection(createRequest(), fetchImpl))
})

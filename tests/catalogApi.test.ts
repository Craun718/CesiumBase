import assert from "node:assert/strict"
import test from "node:test"
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios"
import { fetchCatalog } from "../src/features/catalog/api.js"
import type { CatalogSnapshot } from "../src/features/catalog/model/types.js"

const validCatalog: CatalogSnapshot = {
  modelVersion: "1.0",
  sources: [],
  resourceCategories: [],
  resources: [],
  layerSchemes: [],
}

interface MockHttpResponse {
  body: string
  status?: number
}

type MockHttpResponder = (config: InternalAxiosRequestConfig) => MockHttpResponse

/** 创建返回原始文本响应的 axios 测试客户端。 */
function createMockHttpClient(respond: MockHttpResponder): AxiosInstance {
  const client = axios.create({ responseType: "text" })
  client.defaults.adapter = async (config) => {
    const { body, status = 200 } = respond(config)
    const response = {
      data: body,
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: {},
      config,
    }
    if (status < 200 || status >= 300) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        response,
      )
    }
    return response
  }
  return client
}

test("fetchCatalog 读取 v1.0 目录快照", async () => {
  const client = createMockHttpClient(() => ({ body: JSON.stringify(validCatalog) }))
  const catalog = await fetchCatalog(client)
  assert.equal(catalog.modelVersion, "1.0")
})

test("fetchCatalog 拒绝非 v1.0 响应", async () => {
  const client = createMockHttpClient(() => ({
    body: JSON.stringify({ ...validCatalog, modelVersion: "0.2" }),
  }))
  await assert.rejects(fetchCatalog(client), /目录数据校验失败/)
})

test("fetchCatalog 拒绝数组中的非法服务项", async () => {
  const client = createMockHttpClient(() => ({
    body: JSON.stringify({ ...validCatalog, sources: [null] }),
  }))
  await assert.rejects(fetchCatalog(client), /目录数据校验失败/)
})

test("fetchCatalog requests the unified layer catalog endpoint", async () => {
  const requestedUrls: string[] = []
  const client = createMockHttpClient((config) => {
    requestedUrls.push(config.url ?? "")
    return { body: JSON.stringify(validCatalog) }
  })
  await fetchCatalog(client)
  assert.deepEqual(requestedUrls, ["/api/layer-catalog"])
})

test("fetchCatalog 拒绝 HTTP 错误状态", async () => {
  const client = createMockHttpClient(() => ({ body: "server error", status: 500 }))
  await assert.rejects(fetchCatalog(client), /目录服务响应异常（HTTP 500）/)
})

test("fetchCatalog 拒绝网络失败", async () => {
  const client = createMockHttpClient(() => {
    throw new Error("network unavailable")
  })
  await assert.rejects(fetchCatalog(client), /目录服务连接失败/)
})

test("fetchCatalog 拒绝非法 JSON", async () => {
  const client = createMockHttpClient(() => ({ body: "not-json" }))
  await assert.rejects(fetchCatalog(client), /目录服务响应不是合法 JSON/)
})

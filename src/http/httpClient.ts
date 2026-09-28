import axios, { type AxiosInstance } from "axios"

/** 保留原始响应体，由 JSON 请求辅助函数统一解析。 */
function keepResponseBody(data: unknown) {
  return data
}

export const appHttpClient = axios.create({
  headers: { Accept: "application/json" },
  responseType: "text",
  transformResponse: [keepResponseBody],
})

/** 使用指定 axios 实例获取并解析 JSON 响应。 */
export async function getJsonResponse<T>(
  httpClient: AxiosInstance,
  url: string,
  invalidJsonMessage = "响应不是合法 JSON",
): Promise<T> {
  const response = await httpClient.get<unknown>(url)
  if (typeof response.data !== "string") return response.data as T

  try {
    return JSON.parse(response.data) as T
  } catch {
    throw new SyntaxError(invalidJsonMessage)
  }
}

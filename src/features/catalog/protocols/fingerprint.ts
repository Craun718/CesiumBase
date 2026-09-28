import type { MetadataFingerprint } from "../model/types"
import type { DiscoveryResult, MetadataFileStatus } from "./types"

export interface FingerprintInput {
  readonly text?: string
  readonly etag?: string
  readonly lastModified?: string
  readonly normalizedConfigHash?: string
}

/** 将 JSON 文本转换为键顺序稳定的规范化文本。 */
function normalizeFingerprintText(text: string): string {
  try {
    return stableSerialize(JSON.parse(text))
  } catch {
    return text.trim()
  }
}

/** 递归序列化对象，保证相同 JSON 内容得到相同文本。 */
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/** 使用 Web Crypto 计算 SHA-256 摘要。 */
async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

/** 从响应头或文本内容生成变更检测指纹。 */
export async function createFingerprint(input: FingerprintInput): Promise<MetadataFingerprint> {
  const result: MetadataFingerprint = {
    etag: input.etag,
    lastModified: input.lastModified,
    normalizedConfigHash: input.normalizedConfigHash,
  }

  if (input.text !== undefined) {
    return { ...result, contentHash: await sha256(normalizeFingerprintText(input.text)) }
  }

  return result
}

/** 判断两个指纹是否表示同一份配置或元数据。 */
export function isFingerprintEqual(left: MetadataFingerprint, right: MetadataFingerprint): boolean {
  return (
    (left.etag ?? "") === (right.etag ?? "") &&
    (left.lastModified ?? "") === (right.lastModified ?? "") &&
    (left.contentHash ?? "") === (right.contentHash ?? "") &&
    (left.normalizedConfigHash ?? "") === (right.normalizedConfigHash ?? "")
  )
}

/** 为发现结果中的根级元数据文件补充指纹。 */
export async function attachMetadataFingerprints(
  result: DiscoveryResult,
  texts: Readonly<Record<string, string | undefined>>,
): Promise<DiscoveryResult> {
  const metadataFiles = await Promise.all(
    result.metadataFiles.map(async (file): Promise<MetadataFileStatus> => {
      const text = texts[file.path]
      return text === undefined ? file : { ...file, fingerprint: await createFingerprint({ text }) }
    }),
  )
  return { ...result, metadataFiles }
}

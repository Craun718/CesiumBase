import assert from "node:assert/strict"
import test from "node:test"
import {
  createFingerprint,
  isFingerprintEqual,
} from "../src/features/catalog/protocols/fingerprint.js"

test("指纹对同一规范化 JSON 保持稳定", async () => {
  const first = await createFingerprint({ text: '{"b":2,"a":1}', etag: '"same"' })
  const second = await createFingerprint({ text: '{"a":1,"b":2}', etag: '"same"' })

  assert.equal(first.contentHash, second.contentHash)
  assert.equal(isFingerprintEqual(first, second), true)
})

test("ETag 变化时指纹不相等", () => {
  assert.equal(
    isFingerprintEqual({ etag: '"a"', contentHash: "same" }, { etag: '"b"', contentHash: "same" }),
    false,
  )
})

test("非 JSON 文本按普通内容计算指纹", async () => {
  const first = await createFingerprint({ text: '<Capabilities version="1.3.0" />' })
  const second = await createFingerprint({ text: '<Capabilities version="1.3.0" />' })

  assert.equal(first.contentHash, second.contentHash)
})

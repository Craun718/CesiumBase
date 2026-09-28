import assert from "node:assert/strict"
import test from "node:test"
import { reactive } from "vue"
import { cloneCatalogValue } from "../src/features/catalog/model/clone.js"

test("cloneCatalogValue clones nested reactive objects without Vue proxies", () => {
  const source = reactive({
    id: "source-1",
    connection: { rootUrl: "/tiles/" },
  })

  const cloned = cloneCatalogValue(source)

  assert.deepEqual(cloned, {
    id: "source-1",
    connection: { rootUrl: "/tiles/" },
  })
  cloned.connection.rootUrl = "/changed/"
  assert.equal(source.connection.rootUrl, "/tiles/")
})

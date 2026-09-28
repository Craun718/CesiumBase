import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FLIGHT_SPEED } from "@/map/flightRoute.js"
import { createMapEngine } from "@tests/mapEngineEntryStub.js"

test("根路径别名可在测试编译与运行时解析", () => {
  assert.equal(DEFAULT_FLIGHT_SPEED, 60)
  assert.equal(typeof createMapEngine, "function")
})

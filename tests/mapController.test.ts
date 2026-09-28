import assert from "node:assert/strict"
import { test } from "node:test"
import { MapController } from "../src/map/mapController.js"
import type { MapEngine } from "../src/map/types.js"

test("MapController 转发环绕飞行开关", async () => {
  const enabledValues: boolean[] = []
  const controller = new MapController(
    async () => () =>
      createEngine({
        setOrbitFlight: (enabled: boolean) => enabledValues.push(enabled),
      }),
  )

  await controller.mount({} as HTMLElement)
  controller.setOrbitFlight(true)
  controller.setOrbitFlight(false)

  assert.deepEqual(enabledValues, [true, false])
})

test("MapController 转发卷帘比对配置", async () => {
  const calls: unknown[] = []
  const controller = new MapController(
    async () => () =>
      createEngine({
        setSwipeCompare: (options: unknown) => calls.push(options),
      }),
  )

  await controller.mount({} as HTMLElement)
  controller.setSwipeCompare({
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    splitPosition: 0.5,
    showDivider: true,
  })
  controller.setSwipeCompare({
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    splitPosition: 0.62,
    showDivider: false,
  })

  assert.deepEqual(calls, [
    {
      enabled: true,
      leftLayerId: "layer-left",
      rightLayerId: "layer-right",
      splitPosition: 0.5,
      showDivider: true,
    },
    {
      enabled: true,
      leftLayerId: "layer-left",
      rightLayerId: "layer-right",
      splitPosition: 0.62,
      showDivider: false,
    },
  ])
})

test("MapController 转发视口状态读写和监听", async () => {
  const state = {
    longitude: 109.5,
    latitude: 23.5,
    distanceMeters: 20_000,
    heading: 35,
  }
  const listeners = new Set<(state: unknown) => void>()
  const controller = new MapController(
    async () => () =>
      createEngine({
        getViewportState: () => state,
        setViewportState: (next: unknown) => {
          for (const listener of listeners) listener(next)
        },
        onViewportStateChange: (listener: (state: unknown) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }),
  )

  await controller.mount({} as HTMLElement)
  const received: unknown[] = []
  const dispose = controller.onViewportStateChange((next) => received.push(next))

  assert.equal(controller.getViewportState(), state)
  controller.setViewportState(state)

  assert.deepEqual(received, [state])
  dispose()
  controller.setViewportState(state)
  assert.equal(received.length, 1)
})

test("MapController 挂载前订阅的视口监听可跨越重新挂载", async () => {
  const firstState = {
    longitude: 109.1,
    latitude: 23.1,
    distanceMeters: 18_000,
    heading: 12,
  }
  const secondState = {
    longitude: 110.2,
    latitude: 24.2,
    distanceMeters: 9_000,
    heading: 48,
  }
  const defaultState = {
    longitude: 108,
    latitude: 22,
    distanceMeters: 30_000,
    heading: 0,
  }
  const firstViewportEngine = createViewportEngine(firstState)
  const secondViewportEngine = createViewportEngine(defaultState)
  const engines = [firstViewportEngine, secondViewportEngine]
  const controller = new MapController(async () => {
    const current = engines.shift()!
    return () => current.engine
  })
  const received: unknown[] = []
  const dispose = controller.onViewportStateChange((state) => received.push(state))

  await controller.mount({} as HTMLElement)
  controller.setViewportState(firstState)
  controller.unmount()
  await controller.mount({} as HTMLElement)
  controller.setViewportState(secondState)

  assert.deepEqual(received, [firstState, firstState, secondState])
  assert.deepEqual(secondViewportEngine.setCalls, [firstState, secondState])
  dispose()

  function createViewportEngine(initialState: typeof firstState) {
    let state = initialState
    const setCalls: unknown[] = []
    const listeners = new Set<(state: unknown) => void>()
    const engine = createEngine({
      getViewportState: () => state,
      setViewportState: (next: typeof firstState) => {
        setCalls.push(next)
        state = next
        for (const listener of listeners) listener(next)
      },
      onViewportStateChange: (listener: (state: unknown) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    })
    return { engine, setCalls }
  }
})

test("MapController 转发 3D Tiles 图层生命周期", async () => {
  const calls: string[] = []
  const controller = new MapController(
    async () => () =>
      createEngine({
        addTilesetLayer: async () => calls.push("add-tileset"),
        updateTilesetLayer: () => calls.push("update-tileset"),
        removeTilesetLayer: () => calls.push("remove-tileset"),
      }),
  )

  await controller.mount({} as HTMLElement)
  await controller.addTilesetLayer({
    id: "layer-tileset",
    url: "https://example.com/tileset.json",
    visible: true,
    renderOrder: 10,
    opacity: 1,
    maximumScreenSpaceError: 16,
  })
  controller.updateTilesetLayer("layer-tileset", {
    visible: false,
    opacity: 0.5,
    renderOrder: 20,
  })
  controller.removeTilesetLayer("layer-tileset")

  assert.deepEqual(calls, ["add-tileset", "update-tileset", "remove-tileset"])
})

test("MapController 转发 glTF 模型图层生命周期", async () => {
  const calls: string[] = []
  const controller = new MapController(
    async () => () =>
      createEngine({
        addModelLayer: async () => calls.push("add-model"),
        updateModelLayer: () => calls.push("update-model"),
        removeModelLayer: () => calls.push("remove-model"),
      }),
  )

  await controller.mount({} as HTMLElement)
  await controller.addModelLayer({
    id: "layer-model",
    url: "https://example.com/model.glb",
    visible: true,
    renderOrder: 10,
    opacity: 1,
    bounds: { west: 109, south: 23, east: 110, north: 24 },
  })
  controller.updateModelLayer("layer-model", {
    visible: false,
    opacity: 0.5,
    renderOrder: 20,
  })
  controller.removeModelLayer("layer-model")

  assert.deepEqual(calls, ["add-model", "update-model", "remove-model"])
})

test("MapController 转发三维绘制操作", async () => {
  const calls: string[] = []
  const controller = new MapController(
    async () => () =>
      createEngine({
        start3DDrawing: (type: string) => calls.push(`start:${type}`),
        set3DDrawingOption: () => calls.push("option"),
        finish3DDrawing: () => calls.push("finish"),
        cancel3DDrawing: () => calls.push("cancel"),
        stop3DDrawing: () => calls.push("stop"),
        rename3DDrawing: () => calls.push("rename"),
        remove3DDrawing: () => calls.push("remove"),
        clear3DDrawings: () => calls.push("clear"),
        restore3DDrawings: () => calls.push("restore"),
        select3DDrawingFeature: () => calls.push("select"),
      }),
  )

  await controller.mount({} as HTMLElement)
  controller.start3DDrawing("box")
  controller.set3DDrawingOption({ radiusMeters: 30 })
  controller.finish3DDrawing()
  controller.cancel3DDrawing()
  controller.stop3DDrawing()
  controller.rename3DDrawing("map-draw3d-box-1", "新名称")
  controller.remove3DDrawing("map-draw3d-box-1")
  controller.clear3DDrawings()
  controller.restore3DDrawings([])
  controller.select3DDrawingFeature(null)

  assert.deepEqual(calls, [
    "start:box",
    "option",
    "finish",
    "cancel",
    "stop",
    "rename",
    "remove",
    "clear",
    "restore",
    "select",
  ])
})

test("MapController 返回边界飞行结果且未挂载时返回 false", async () => {
  const unmounted = new MapController(async () => {
    throw new Error("未挂载时不应创建引擎")
  })

  assert.equal(await unmounted.flyToBounds({ west: 109, south: 23, east: 110, north: 24 }), false)

  let complete: (() => void) | undefined
  const controller = new MapController(
    async () => () =>
      createEngine({
        flyToBounds: () =>
          new Promise<boolean>((resolve) => {
            complete = () => resolve(true)
          }),
      }),
  )
  await controller.mount({} as HTMLElement)
  const result = controller.flyToBounds({ west: 109, south: 23, east: 110, north: 24 })
  complete?.()

  assert.equal(await result, true)
})

test("MapController 挂载时向引擎工厂传递渲染配置", async () => {
  const creationOptions: unknown[] = []
  const controller = new MapController(async () => {
    return (options?: { renderingProfile?: "primary" | "secondary" }) => {
      creationOptions.push(options)
      return createEngine({})
    }
  })
  const mountWithOptions = controller as unknown as {
    mount(
      container: HTMLElement,
      options?: { renderingProfile?: "primary" | "secondary" },
    ): Promise<void>
  }

  await mountWithOptions.mount({} as HTMLElement, { renderingProfile: "secondary" })

  assert.deepEqual(creationOptions, [{ renderingProfile: "secondary" }])
})

/** 创建只实现挂载和新图层转发所需的引擎桩。 */
function createEngine(methods: Record<string, unknown>): MapEngine {
  return {
    mount: () => undefined,
    unmount: () => undefined,
    getMeasurementState: () => ({
      mode: null,
      points: [],
      previewPoint: undefined,
      resultValue: undefined,
      error: undefined,
    }),
    onCoordinateReadoutChange: () => () => undefined,
    onMapClick: () => () => undefined,
    onFlightPlaybackStateChange: () => () => undefined,
    onDrawingStateChange: () => () => undefined,
    on3DDrawingStateChange: () => () => undefined,
    onMeasurementStateChange: () => () => undefined,
    onImageryLayerError: () => () => undefined,
    ...methods,
  } as unknown as MapEngine
}

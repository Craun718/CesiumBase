import * as Cesium from "cesium"
import type { MapDrawFeature } from "../../../types"
import { toCartesian } from "./geometry.js"
import { computeHandlePlacements } from "./handles.js"
import { ACCENT, DEEP_BACK } from "../../../themeColors.js"

/** 编辑把手渲染与拾取；把手始终随绘制成果写入同一个 CustomDataSource。 */
export class DrawingHandleRenderer {
  private dataSource?: Cesium.CustomDataSource
  private readonly entities: Cesium.Entity[] = []

  /** 绑定绘制成果数据源；解绑前先清空旧把手。 */
  setDataSource(dataSource: Cesium.CustomDataSource | undefined) {
    this.dispose()
    this.dataSource = dataSource
  }

  /** 为指定 feature 创建编辑把手；按 geometry.type 分派。 */
  create(featureId: string, feature: MapDrawFeature) {
    if (!this.dataSource) return

    const placements = computeHandlePlacements(feature.geometry)
    for (const placement of placements) {
      const entity = this.dataSource.entities.add({
        position: toCartesian(placement.position),
        properties: new Cesium.PropertyBag({
          kind: new Cesium.ConstantProperty("handle"),
          handleId: new Cesium.ConstantProperty(placement.handleId),
          featureId: new Cesium.ConstantProperty(featureId),
        }),
        point: {
          pixelSize: placement.handleId === "translate" ? 8 : 9,
          color: Cesium.Color.fromCssColorString(ACCENT),
          outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
          outlineWidth: 2,
        },
      })
      if (placement.pixelOffset) {
        // Cesium PointGraphics 运行时支持 pixelOffset，但 TypeScript 类型未声明，强转写入
        ;(entity.point as unknown as { pixelOffset?: Cesium.ConstantProperty }).pixelOffset =
          new Cesium.ConstantProperty(
            new Cesium.Cartesian2(placement.pixelOffset.x, placement.pixelOffset.y),
          )
      }
      this.entities.push(entity)
    }
  }

  /** 销毁当前所有 handle entity。 */
  dispose() {
    for (const entity of this.entities) {
      this.dataSource?.entities.remove(entity)
    }
    this.entities.length = 0
  }

  /** 在 handleEntities 中按 handleId 反查 entity。 */
  find(featureId: string, handleId: string): Cesium.Entity | undefined {
    return this.entities.find((entity) => {
      const properties = entity.properties
      if (!(properties instanceof Cesium.PropertyBag)) return false
      return (
        properties.featureId?.getValue(Cesium.JulianDate.now()) === featureId &&
        properties.handleId?.getValue(Cesium.JulianDate.now()) === handleId
      )
    })
  }

  /** 拾取屏幕坐标命中的 handle entity，返回元数据。 */
  pick(
    viewer: Cesium.Viewer,
    screenPosition: Cesium.Cartesian2,
  ): { featureId: string; handleId: string } | null {
    const picked = viewer.scene.pick(screenPosition)
    if (!picked) return null

    const id = (picked as { id?: unknown }).id
    if (!(id instanceof Cesium.Entity)) return null

    const properties = id.properties
    if (!(properties instanceof Cesium.PropertyBag)) return null

    const kind = properties.kind?.getValue(Cesium.JulianDate.now())
    const featureId = properties.featureId?.getValue(Cesium.JulianDate.now())
    const handleId = properties.handleId?.getValue(Cesium.JulianDate.now())
    if (kind === "handle" && typeof featureId === "string" && typeof handleId === "string") {
      return { featureId, handleId }
    }

    return null
  }

  /** 读取 handle / feature 实体在画布上的位置。 */
  getScreenPosition(viewer: Cesium.Viewer, entity: Cesium.Entity): Cesium.Cartesian2 | null {
    const position = entity.position?.getValue(Cesium.JulianDate.now())
    if (!position) return null

    return viewer.scene.cartesianToCanvasCoordinates(position) ?? null
  }
}

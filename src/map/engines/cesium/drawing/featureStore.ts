import type {
  MapDrawCoordinate,
  MapDrawBufferSource,
  MapDrawFeature,
  MapDrawGeometry,
  MapDrawGeometryType,
} from "../../../types"
import { featureTypeName, isValidFeature } from "./validation.js"

/** 绘制成果的内存状态与持久化恢复序号。 */
export class DrawingFeatureStore {
  private readonly features = new Map<string, MapDrawFeature>()
  private idSeed = 0
  private nameSeed = 0

  /** 读取指定成果。 */
  get(id: string): MapDrawFeature | undefined {
    return this.features.get(id)
  }

  /** 判断成果是否存在。 */
  has(id: string): boolean {
    return this.features.has(id)
  }

  /** 读取全部成果快照。 */
  list(): MapDrawFeature[] {
    return [...this.features.values()]
  }

  /** 写入或替换成果。 */
  set(feature: MapDrawFeature): void {
    this.features.set(feature.id, feature)
  }

  /** 更新成果几何，保留其余元数据。 */
  setGeometry(id: string, geometry: MapDrawGeometry): void {
    const feature = this.features.get(id)
    if (!feature) return

    this.features.set(id, { ...feature, geometry })
  }

  /** 重命名成果；空名称或 id 无效时返回 false。 */
  rename(id: string, name: string): MapDrawFeature | undefined {
    const trimmedName = name.trim()
    const feature = this.features.get(id)
    if (!trimmedName || !feature) return undefined

    const nextFeature = { ...feature, name: trimmedName }
    this.features.set(id, nextFeature)
    return nextFeature
  }

  /** 删除成果。 */
  delete(id: string): boolean {
    return this.features.delete(id)
  }

  /** 删除全部成果。 */
  clear(): void {
    this.features.clear()
  }

  /** 创建带稳定 id 和中文名称的成果。 */
  create(type: MapDrawGeometryType, geometry: MapDrawGeometry): MapDrawFeature {
    this.nameSeed += 1
    const typeName = featureTypeName(type)
    const serial = String(this.nameSeed).padStart(3, "0")

    return {
      id: this.createId(type),
      name: `绘制${typeName} ${serial}`,
      type,
      geometry,
      createdAt: new Date().toISOString(),
    }
  }

  /** 创建缓冲区成果。 */
  createBuffer(
    source: MapDrawBufferSource,
    distanceMeters: number,
    polygon: readonly MapDrawCoordinate[],
  ): MapDrawFeature {
    this.nameSeed += 1
    const serial = String(this.nameSeed).padStart(3, "0")

    return {
      id: this.createId("buffer"),
      name: `绘制缓冲区 ${serial}`,
      type: "buffer",
      geometry: {
        type: "buffer",
        source,
        distanceMeters: Math.max(distanceMeters, 1),
        polygon,
      },
      createdAt: new Date().toISOString(),
    }
  }

  /** 校验并恢复成果；无效或重复数据跳过，同时同步 id/name 序号。 */
  restore(features: readonly MapDrawFeature[]): MapDrawFeature[] {
    this.features.clear()
    const restored: MapDrawFeature[] = []
    const featureIds = new Set<string>()

    for (const feature of features) {
      if (!isValidFeature(feature) || featureIds.has(feature.id)) continue

      featureIds.add(feature.id)
      restored.push(feature)
      this.features.set(feature.id, feature)
      this.updateIdSeed(feature.id)
      this.updateNameSeed(feature.name)
    }

    return restored
  }

  /** 生成稳定的绘制实体 id。 */
  createId(prefix: string) {
    this.idSeed += 1
    return `map-draw-${prefix}-${this.idSeed}`
  }

  /** 根据恢复成果同步名称序号，避免新增成果名称从 001 重复。 */
  private updateNameSeed(name: string) {
    const match = /^绘制(?:点|折线|多边形|矩形|圆|椭圆|走廊|缓冲区) (\d+)$/.exec(name)
    if (!match) return

    const serial = Number.parseInt(match[1], 10)
    if (Number.isFinite(serial) && serial > this.nameSeed) {
      this.nameSeed = serial
    }
  }

  /** 根据恢复成果同步实体 id 序号，避免新增成果与持久化 id 冲突。 */
  private updateIdSeed(id: string) {
    const match =
      /^map-draw-(?:point|polyline|polygon|rectangle|circle|ellipse|corridor|buffer)-(\d+)$/.exec(
        id,
      )
    if (!match) return

    const seed = Number.parseInt(match[1], 10)
    if (Number.isFinite(seed) && seed > this.idSeed) {
      this.idSeed = seed
    }
  }
}

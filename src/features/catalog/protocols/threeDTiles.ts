import type { DatasetMetadataFile, GeoExtent, VerificationIssue } from "../model/types"
import type { DiscoveryItem, DiscoveryResult, MetadataFileStatus } from "./types"

const RADIANS_TO_DEGREES = 180 / Math.PI
const WGS84_SEMI_MAJOR_AXIS = 6_378_137
const WGS84_SEMI_MINOR_AXIS = 6_356_752.314245179
const WGS84_ONE_OVER_RADII_X = 1 / WGS84_SEMI_MAJOR_AXIS
const WGS84_ONE_OVER_RADII_Z = 1 / WGS84_SEMI_MINOR_AXIS
const WGS84_ONE_OVER_RADII_SQUARED_X = WGS84_ONE_OVER_RADII_X ** 2
const WGS84_ONE_OVER_RADII_SQUARED_Z = WGS84_ONE_OVER_RADII_Z ** 2
const GEODETIC_CENTER_TOLERANCE_SQUARED = 0.1
const GEODETIC_SURFACE_EPSILON = 1e-12
const IDENTITY_TRANSFORM = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

const SUPPORTED_PROFILES = [
  "gridmaster-box-transform",
  "osgblab-sphere-ecef",
  "three-d-tiles-region",
  "three-d-tiles-box",
  "three-d-tiles-box-transform",
  "three-d-tiles-sphere",
  "three-d-tiles-sphere-transform",
] as const

export interface ThreeDTilesDiscoveryInput {
  readonly sourceId: string
  readonly name?: string
  readonly rootUrl?: string
  readonly tileset: unknown
  readonly datasetMetadata?: DatasetMetadataFile
}

interface Cartesian3 {
  x: number
  y: number
  z: number
}

interface Cartographic {
  longitude: number
  latitude: number
  height: number
}

/** 把三维向量坐标乘以标量。 */
function scaleCartesian(point: Cartesian3, scalar: number): Cartesian3 {
  return { x: point.x * scalar, y: point.y * scalar, z: point.z * scalar }
}

/** 计算三维向量长度。 */
function magnitude(point: Cartesian3): number {
  return Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z)
}

/** 计算三维向量点积。 */
function dot(left: Cartesian3, right: Cartesian3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

/** 用 4x4 列主序矩阵变换三维点。 */
function multiplyByPoint(matrix: readonly number[], point: Cartesian3): Cartesian3 {
  return {
    x: matrix[0]! * point.x + matrix[4]! * point.y + matrix[8]! * point.z + matrix[12]!,
    y: matrix[1]! * point.x + matrix[5]! * point.y + matrix[9]! * point.z + matrix[13]!,
    z: matrix[2]! * point.x + matrix[6]! * point.y + matrix[10]! * point.z + matrix[14]!,
  }
}

/** 把点投影到 WGS84 椭球表面，复现 Cesium 的迭代算法。 */
function scaleToGeodeticSurface(point: Cartesian3): Cartesian3 | undefined {
  const x2 = point.x * point.x * WGS84_ONE_OVER_RADII_SQUARED_X
  const y2 = point.y * point.y * WGS84_ONE_OVER_RADII_SQUARED_X
  const z2 = point.z * point.z * WGS84_ONE_OVER_RADII_SQUARED_Z
  const squaredNorm = x2 + y2 + z2
  const ratio = Math.sqrt(1 / squaredNorm)
  const intersection = scaleCartesian(point, ratio)

  if (squaredNorm < GEODETIC_CENTER_TOLERANCE_SQUARED) {
    return Number.isFinite(ratio) ? intersection : undefined
  }

  const gradient = {
    x: intersection.x * WGS84_ONE_OVER_RADII_SQUARED_X * 2,
    y: intersection.y * WGS84_ONE_OVER_RADII_SQUARED_X * 2,
    z: intersection.z * WGS84_ONE_OVER_RADII_SQUARED_Z * 2,
  }
  let lambda = ((1 - ratio) * magnitude(point)) / (0.5 * magnitude(gradient))
  let correction = 0
  let xMultiplier = 1
  let yMultiplier = 1
  let zMultiplier = 1
  let func = 0

  do {
    lambda -= correction
    xMultiplier = 1 / (1 + lambda * WGS84_ONE_OVER_RADII_SQUARED_X)
    yMultiplier = 1 / (1 + lambda * WGS84_ONE_OVER_RADII_SQUARED_X)
    zMultiplier = 1 / (1 + lambda * WGS84_ONE_OVER_RADII_SQUARED_Z)
    const xMultiplier2 = xMultiplier * xMultiplier
    const yMultiplier2 = yMultiplier * yMultiplier
    const zMultiplier2 = zMultiplier * zMultiplier
    const xMultiplier3 = xMultiplier2 * xMultiplier
    const yMultiplier3 = yMultiplier2 * yMultiplier
    const zMultiplier3 = zMultiplier2 * zMultiplier
    func = x2 * xMultiplier2 + y2 * yMultiplier2 + z2 * zMultiplier2 - 1
    const denominator =
      x2 * xMultiplier3 * WGS84_ONE_OVER_RADII_SQUARED_X +
      y2 * yMultiplier3 * WGS84_ONE_OVER_RADII_SQUARED_X +
      z2 * zMultiplier3 * WGS84_ONE_OVER_RADII_SQUARED_Z
    correction = func / (-2 * denominator)
  } while (Math.abs(func) > GEODETIC_SURFACE_EPSILON)

  return {
    x: point.x * xMultiplier,
    y: point.y * yMultiplier,
    z: point.z * zMultiplier,
  }
}

/** 把 ECEF 点转换到 WGS84 经纬高。 */
function cartesianToCartographic(cartesian: Cartesian3): Cartographic | undefined {
  const surfacePoint = scaleToGeodeticSurface(cartesian)
  if (!surfacePoint) return undefined

  const normal = {
    x: surfacePoint.x * WGS84_ONE_OVER_RADII_SQUARED_X,
    y: surfacePoint.y * WGS84_ONE_OVER_RADII_SQUARED_X,
    z: surfacePoint.z * WGS84_ONE_OVER_RADII_SQUARED_Z,
  }
  const normalMagnitude = magnitude(normal)
  if (normalMagnitude === 0) return undefined

  const normalizedNormal = scaleCartesian(normal, 1 / normalMagnitude)
  const offset = {
    x: cartesian.x - surfacePoint.x,
    y: cartesian.y - surfacePoint.y,
    z: cartesian.z - surfacePoint.z,
  }
  const height = Math.sign(dot(offset, cartesian)) * magnitude(offset)
  return {
    longitude: Math.atan2(normalizedNormal.y, normalizedNormal.x),
    latitude: Math.asin(normalizedNormal.z),
    height,
  }
}

/** 判断对象是否为可索引的普通记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** 读取数组字段中的全部有限数字。 */
function readFiniteNumberArray(value: unknown): number[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return undefined
  }
  return value
}

/** 读取固定长度为 16 的有限数字数组。 */
function readFixedNumberArray(value: unknown, length: number): number[] | undefined {
  const result = readFiniteNumberArray(value)
  return result?.length === length ? result : undefined
}

/** 读取 3D Tiles 资产的生成器名称。 */
function readGeneratorName(tileset: Record<string, unknown>): string {
  const asset = isRecord(tileset.asset) ? tileset.asset : {}
  return typeof asset.generatetool === "string" ? asset.generatetool : ""
}

/** 根据 3D Tiles 根节点结构识别 Profile。 */
export function detectThreeDTilesProfile(tileset: unknown): string | undefined {
  if (!isRecord(tileset) || !isRecord(tileset.root)) return undefined
  const root = tileset.root
  if (!isRecord(root.boundingVolume)) return undefined

  const generator = readGeneratorName(tileset)
  const hasTransform = Boolean(readFixedNumberArray(root.transform, 16))

  if (readFiniteNumberArray(root.boundingVolume.region)) return "three-d-tiles-region"
  if (readFiniteNumberArray(root.boundingVolume.box)) {
    if (hasTransform) {
      return generator.includes("GridMaster")
        ? "gridmaster-box-transform"
        : "three-d-tiles-box-transform"
    }
    return "three-d-tiles-box"
  }
  if (readFiniteNumberArray(root.boundingVolume.sphere)) {
    if (hasTransform) return "three-d-tiles-sphere-transform"
    return generator.includes("OSGBLab") ? "osgblab-sphere-ecef" : "three-d-tiles-sphere"
  }
  return undefined
}

/** 将多个 ECEF 点转换为 WGS84 范围。 */
function createExtentFromCartesianPoints(points: readonly Cartesian3[]): GeoExtent | undefined {
  try {
    const cartographics = points.map((point) => cartesianToCartographic(point))
    if (cartographics.some((point) => !point)) return undefined

    const longitudes = cartographics.map((point) => point!.longitude * RADIANS_TO_DEGREES)
    const latitudes = cartographics.map((point) => point!.latitude * RADIANS_TO_DEGREES)
    const heights = cartographics.map((point) => point!.height)
    const west = Math.min(...longitudes)
    const east = Math.max(...longitudes)

    return {
      west: east - west > 180 ? -180 : west,
      south: Math.max(-90, Math.min(...latitudes)),
      east: east - west > 180 ? 180 : east,
      north: Math.min(90, Math.max(...latitudes)),
      minimumHeight: Math.min(...heights),
      maximumHeight: Math.max(...heights),
    }
  } catch {
    return undefined
  }
}

/** 校验并创建有限、顺序正确的 GeoExtent。 */
function createValidatedExtent(
  west: unknown,
  south: unknown,
  east: unknown,
  north: unknown,
  minimumHeight?: unknown,
  maximumHeight?: unknown,
): GeoExtent | undefined {
  if (
    ![west, south, east, north].every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return undefined
  }
  if ((west as number) > (east as number) || (south as number) > (north as number)) return undefined
  if ((west as number) < -180 || (east as number) > 180) return undefined
  if ((south as number) < -90 || (north as number) > 90) return undefined
  if (
    minimumHeight !== undefined &&
    (typeof minimumHeight !== "number" || !Number.isFinite(minimumHeight))
  ) {
    return undefined
  }
  if (
    maximumHeight !== undefined &&
    (typeof maximumHeight !== "number" || !Number.isFinite(maximumHeight))
  ) {
    return undefined
  }
  if (
    typeof minimumHeight === "number" &&
    typeof maximumHeight === "number" &&
    minimumHeight > maximumHeight
  ) {
    return undefined
  }
  return {
    west: west as number,
    south: south as number,
    east: east as number,
    north: north as number,
    minimumHeight: minimumHeight as number | undefined,
    maximumHeight: maximumHeight as number | undefined,
  }
}

/** 计算 box 八个角点经过根 transform 后的 WGS84 范围。 */
function calculateBoxExtent(box: number[], transform?: number[]): GeoExtent | undefined {
  if (box.length < 12) return undefined

  const matrix = transform ?? IDENTITY_TRANSFORM
  const center = { x: box[0]!, y: box[1]!, z: box[2]! }
  const axisX = { x: box[3]!, y: box[4]!, z: box[5]! }
  const axisY = { x: box[6]!, y: box[7]!, z: box[8]! }
  const axisZ = { x: box[9]!, y: box[10]!, z: box[11]! }
  const points: Cartesian3[] = []

  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const point = {
          x: center.x + signX * axisX.x + signY * axisY.x + signZ * axisZ.x,
          y: center.y + signX * axisX.y + signY * axisY.y + signZ * axisZ.y,
          z: center.z + signX * axisX.z + signY * axisY.z + signZ * axisZ.z,
        }
        points.push(multiplyByPoint(matrix, point))
      }
    }
  }

  return createExtentFromCartesianPoints(points)
}

/** 估计仿射变换对球半径的最大放大倍数。 */
function getMaximumScale(transform: readonly number[]): number {
  return Math.hypot(
    transform[0]!,
    transform[1]!,
    transform[2]!,
    transform[4]!,
    transform[5]!,
    transform[6]!,
    transform[8]!,
    transform[9]!,
    transform[10]!,
  )
}

/** 计算 ECEF 包围球的保守 WGS84 范围。 */
function calculateSphereExtent(sphere: number[], transform?: number[]): GeoExtent | undefined {
  if (sphere.length !== 4) return undefined

  const matrix = transform ?? IDENTITY_TRANSFORM
  const center = multiplyByPoint(matrix, { x: sphere[0]!, y: sphere[1]!, z: sphere[2]! })
  const radius = sphere[3]! * (transform ? getMaximumScale(matrix) : 1)
  const centerDistance = magnitude(center)
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(centerDistance) ||
    centerDistance <= 0 ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(center.z)
  ) {
    return undefined
  }

  const horizontalDistance = Math.hypot(center.x, center.y)
  const centerLongitude = Math.atan2(center.y, center.x)
  const longitudeRadius =
    horizontalDistance > radius ? Math.asin(Math.min(1, radius / horizontalDistance)) : Math.PI
  let west = (centerLongitude - longitudeRadius) * RADIANS_TO_DEGREES
  let east = (centerLongitude + longitudeRadius) * RADIANS_TO_DEGREES
  if (longitudeRadius >= Math.PI || west < -180 || east > 180) {
    west = -180
    east = 180
  }

  const geocentricLatitude = Math.asin(Math.max(-1, Math.min(1, center.z / centerDistance)))
  const angularRadius = Math.asin(Math.min(1, radius / centerDistance))
  const minimumGeocentricLatitude = Math.max(-Math.PI / 2, geocentricLatitude - angularRadius)
  const maximumGeocentricLatitude = Math.min(Math.PI / 2, geocentricLatitude + angularRadius)
  const geodeticLatitude = (value: number) => {
    if (Math.abs(value) >= Math.PI / 2) return value
    return Math.atan((WGS84_SEMI_MAJOR_AXIS ** 2 / WGS84_SEMI_MINOR_AXIS ** 2) * Math.tan(value))
  }
  const south = geodeticLatitude(minimumGeocentricLatitude) * RADIANS_TO_DEGREES
  const north = geodeticLatitude(maximumGeocentricLatitude) * RADIANS_TO_DEGREES
  const minimumDistance = Math.max(0, centerDistance - radius)
  const maximumDistance = centerDistance + radius
  const minimumHeight = minimumDistance - WGS84_SEMI_MAJOR_AXIS
  const maximumHeight = maximumDistance - WGS84_SEMI_MINOR_AXIS
  if (![minimumHeight, maximumHeight].every(Number.isFinite)) return undefined

  return {
    west,
    south,
    east,
    north,
    minimumHeight,
    maximumHeight,
  }
}

/** 将 3D Tiles region 转换为统一范围。 */
function calculateRegionExtent(region: number[]): GeoExtent | undefined {
  if (region.length !== 6 || !region.every(Number.isFinite)) return undefined
  return createValidatedExtent(
    region[0]! * RADIANS_TO_DEGREES,
    region[1]! * RADIANS_TO_DEGREES,
    region[2]! * RADIANS_TO_DEGREES,
    region[3]! * RADIANS_TO_DEGREES,
    region[4],
    region[5],
  )
}

/** 从 3D Tiles 根节点发现单个资源，不递归遍历子节点。 */
export function discoverThreeDTiles(input: ThreeDTilesDiscoveryInput): DiscoveryResult {
  const tileset = isRecord(input.tileset) ? input.tileset : {}
  const root = isRecord(tileset.root) ? tileset.root : {}
  const boundingVolume = isRecord(root.boundingVolume) ? root.boundingVolume : {}
  const detectedProfile = detectThreeDTilesProfile(tileset)
  const profileHint = input.datasetMetadata?.profileHint
  const issues: VerificationIssue[] = []
  const metadataFiles: MetadataFileStatus[] = []
  const transformValue = root.transform
  const transform =
    transformValue === undefined ? undefined : readFixedNumberArray(transformValue, 16)
  const supportedHint =
    profileHint && SUPPORTED_PROFILES.includes(profileHint as (typeof SUPPORTED_PROFILES)[number])
  const profile =
    supportedHint && (!detectedProfile || profileHint === detectedProfile)
      ? profileHint
      : (detectedProfile ?? "three-d-tiles-generic")

  if (isRecord(input.tileset)) {
    metadataFiles.push({ path: "tileset.json", role: "standard", status: "read" })
  }
  if (input.datasetMetadata) {
    metadataFiles.push({ path: "dataset.json", role: "override", status: "read" })
  }
  if (profileHint && !supportedHint) {
    issues.push({
      level: "warning",
      code: "unknown-profile-hint",
      message: `无法识别的 3D Tiles Profile 提示：${profileHint}`,
    })
  }
  if (profileHint && detectedProfile && profileHint !== detectedProfile) {
    issues.push({
      level: "warning",
      code: "profile-hint-mismatch",
      message: `dataset.json Profile 提示 ${profileHint} 与结构识别 ${detectedProfile} 不一致`,
    })
  }
  if (transformValue !== undefined && !transform) {
    issues.push({
      level: "error",
      code: "invalid-3d-tiles-transform",
      message: "3D Tiles 根 transform 必须是长度为 16 的有限数字数组",
    })
  }

  const datasetExtentWithQuality = input.datasetMetadata?.extent
  const datasetExtentQuality = datasetExtentWithQuality?.quality
  const datasetExtent: GeoExtent | undefined = datasetExtentWithQuality
    ? createValidatedExtent(
        datasetExtentWithQuality.west,
        datasetExtentWithQuality.south,
        datasetExtentWithQuality.east,
        datasetExtentWithQuality.north,
        datasetExtentWithQuality.minimumHeight,
        datasetExtentWithQuality.maximumHeight,
      )
    : undefined
  if (datasetExtentWithQuality && !datasetExtent) {
    issues.push({
      level: "error",
      code: "invalid-dataset-extent",
      message: "dataset.json 范围缺少有限数值、顺序错误或超出 WGS84 合法范围",
    })
  }
  let extent: GeoExtent | undefined
  let extentSource: DiscoveryItem["extentSource"] | undefined
  let extentQuality: DiscoveryItem["extentQuality"] | undefined

  if (datasetExtent) {
    extent = datasetExtent
    extentSource = "dataset"
    extentQuality = datasetExtentQuality ?? "manual"
  } else if (profile.includes("region")) {
    extent = calculateRegionExtent(readFiniteNumberArray(boundingVolume.region) ?? [])
    extentSource = "standard"
    extentQuality = "exact"
  } else if (profile.includes("box")) {
    extent = calculateBoxExtent(readFiniteNumberArray(boundingVolume.box) ?? [], transform)
    extentSource = "box-transform"
    extentQuality = "derived"
  } else if (profile.includes("sphere")) {
    extent = calculateSphereExtent(readFiniteNumberArray(boundingVolume.sphere) ?? [], transform)
    extentSource = "bounding-sphere"
    extentQuality = "conservative"
  }

  if (!extent) {
    issues.push({
      level: "error",
      code: "invalid-3d-tiles-extent",
      message: "3D Tiles 根包围体无法转换为 WGS84 范围",
    })
  }

  const asset = isRecord(tileset.asset) ? tileset.asset : {}
  const item: DiscoveryItem = {
    key: "root",
    name: input.datasetMetadata?.name ?? input.name ?? "3D Tiles 数据集",
    kind: "tileset",
    selectable: Boolean(extent) && !issues.some((issue) => issue.level === "error"),
    binding: { protocol: "3d-tiles" },
    extent,
    extentSource,
    extentQuality,
    profile,
    diagnostics: {
      assetVersion: asset.version,
      gltfUpAxis: asset.gltfUpAxis,
      extensionsUsed: tileset.extensionsUsed,
      extensionsRequired: tileset.extensionsRequired,
      rootGeometricError: root.geometricError,
      refine: root.refine ?? tileset.refine,
      datasetFingerprint: input.datasetMetadata?.fingerprint,
    },
  }

  const status = issues.some((issue) => issue.level === "error")
    ? "partial"
    : issues.some((issue) => issue.level === "warning") || profile === "three-d-tiles-generic"
      ? "partial"
      : "complete"

  return {
    sourceId: input.sourceId,
    protocol: "3d-tiles",
    profile,
    status,
    metadataFiles,
    items: [item],
    issues,
  }
}

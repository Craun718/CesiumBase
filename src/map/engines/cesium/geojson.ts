export type GeoJsonPosition = number[]

type PolygonGeometry = {
  type: "Polygon"
  coordinates: GeoJsonPosition[][]
}

type MultiPolygonGeometry = {
  type: "MultiPolygon"
  coordinates: GeoJsonPosition[][][]
}

type MultiLineStringGeometry = {
  type: "MultiLineString"
  coordinates: GeoJsonPosition[][]
}

export type ProvinceGeometry = PolygonGeometry | MultiPolygonGeometry
export type FeatureGeometry = ProvinceGeometry | MultiLineStringGeometry

export type ProvinceFeature = {
  properties: {
    name?: string
  }
  geometry: FeatureGeometry
}

export type ProvinceCollection = {
  features: ProvinceFeature[]
}

export function isProvinceGeometry(geometry: FeatureGeometry): geometry is ProvinceGeometry {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon"
}

export function forEachProvinceRing(
  geometry: ProvinceGeometry,
  callback: (ring: GeoJsonPosition[]) => void,
) {
  forEachProvincePolygon(geometry, (polygon) => {
    polygon.forEach(callback)
  })
}

export function forEachProvincePolygon(
  geometry: ProvinceGeometry,
  callback: (polygon: GeoJsonPosition[][]) => void,
) {
  if (geometry.type === "Polygon") {
    callback(geometry.coordinates)
    return
  }

  geometry.coordinates.forEach(callback)
}

export function ensureRingOrientation(ring: GeoJsonPosition[], clockwise: boolean) {
  const area = getSignedRingArea(ring)
  const isClockwise = area < 0

  if (clockwise ? !isClockwise : isClockwise) {
    return [...ring].reverse()
  }

  return ring
}

function getSignedRingArea(ring: GeoJsonPosition[]) {
  let area = 0

  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]

    if (!current || !next) {
      continue
    }

    area += current[0] * next[1] - next[0] * current[1]
  }

  return area / 2
}

export function closeRing(ring: GeoJsonPosition[]) {
  const first = ring[0]
  const last = ring.at(-1)

  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, first]
  }

  return ring
}

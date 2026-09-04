const THUMBNAIL_WIDTH = 320
const THUMBNAIL_HEIGHT = 180
const THUMBNAIL_QUALITY = 0.82

/** 将画布导出为数据 URL；导出结果无效或浏览器拒绝读取时返回 undefined。 */
export function exportCanvasToDataUrl(
  source: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): string | undefined {
  if (source.width === 0 || source.height === 0) {
    console.warn("[map] 截图画布尺寸为 0", {
      width: source.width,
      height: source.height,
    })
    return undefined
  }

  try {
    const dataUrl = source.toDataURL(type, quality)

    if (!dataUrl.startsWith("data:image/")) {
      console.warn("[map] 截图导出结果无效", dataUrl.slice(0, 32))
      return undefined
    }

    return dataUrl
  } catch (error) {
    console.warn("[map] 截图导出失败", error)
    return undefined
  }
}

/** 将画布等比缩放并居中裁剪为适合 localStorage 的缩略图。 */
export function createThumbnailFromCanvas(source: HTMLCanvasElement): string | undefined {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = THUMBNAIL_WIDTH
    canvas.height = THUMBNAIL_HEIGHT

    const context = canvas.getContext("2d")
    if (!context) {
      console.warn("[map] 收藏视角截图无法创建 2D 画布上下文")
      return undefined
    }

    // 以 cover 方式裁剪，避免收藏列表中的截图被拉伸变形。
    const scale = Math.max(THUMBNAIL_WIDTH / source.width, THUMBNAIL_HEIGHT / source.height)
    const width = source.width * scale
    const height = source.height * scale
    context.drawImage(
      source,
      (THUMBNAIL_WIDTH - width) / 2,
      (THUMBNAIL_HEIGHT - height) / 2,
      width,
      height,
    )

    return exportCanvasToDataUrl(canvas, "image/webp", THUMBNAIL_QUALITY)
  } catch (error) {
    console.warn("[map] 收藏视角截图绘制失败", error)
    return undefined
  }
}

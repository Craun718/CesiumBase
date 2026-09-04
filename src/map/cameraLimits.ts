/** 相机海拔高度限制，单位米。 */
export const MIN_CAMERA_HEIGHT = 100

/** 相机海拔高度限制，单位米。 */
export const MAX_CAMERA_HEIGHT = 5_000_000

/** 按共享相机高度限制钳制数值，非法数值按最小高度处理。 */
export function clampCameraHeight(height: number) {
  if (!Number.isFinite(height)) return MIN_CAMERA_HEIGHT

  return Math.min(MAX_CAMERA_HEIGHT, Math.max(MIN_CAMERA_HEIGHT, height))
}

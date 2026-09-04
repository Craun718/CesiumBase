<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from "vue"
import { clampCameraHeight, useMapController, type CameraState, type ViewFavorite } from "../map"
import { useLocalStore } from "../stores"

const mapController = useMapController()
const localStore = useLocalStore()

const MIN_PITCH = -89.9
const MAX_PITCH = 89.9

const mapReady = ref(false)
const search = ref("")
const editorMode = ref<"closed" | "create" | "edit">("closed")
const editingFavoriteId = ref<string | undefined>()
const confirmingDeleteId = ref<string | null>(null)
const feedback = ref("")
const feedbackTone = ref<"info" | "error">("info")
const savingFavorite = ref(false)
const capturingFavorite = ref(false)
const pendingScreenshot = ref("")
const editorSourceCamera = shallowRef<CameraState | undefined>()

const favoriteForm = reactive({
  name: "",
  longitude: "",
  latitude: "",
  height: "",
  heading: "",
  pitch: "",
})

let disposeMountState: (() => void) | undefined
let feedbackTimer: number | undefined

const editorBusy = computed(() => savingFavorite.value)
const listBusy = computed(() => editorBusy.value || capturingFavorite.value)

const filteredFavorites = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return localStore.viewFavorites

  return localStore.viewFavorites.filter((favorite) =>
    favorite.name.toLowerCase().includes(keyword),
  )
})

function parseNumber(value: string) {
  const result = Number(value)
  return Number.isFinite(result) ? result : undefined
}

function normalizeHeading(value: number) {
  const heading = ((value % 360) + 360) % 360
  return heading === 360 ? 0 : heading
}

function snapshotCamera(camera: CameraState): CameraState {
  return {
    longitude: Math.min(180, Math.max(-180, camera.longitude)),
    latitude: Math.min(90, Math.max(-90, camera.latitude)),
    height: clampCameraHeight(camera.height),
    heading: normalizeHeading(camera.heading),
    pitch: Math.min(MAX_PITCH, Math.max(MIN_PITCH, camera.pitch)),
  }
}

function buildFormCamera() {
  const longitude = parseNumber(favoriteForm.longitude)
  const latitude = parseNumber(favoriteForm.latitude)
  const height = parseNumber(favoriteForm.height)
  const heading = parseNumber(favoriteForm.heading)
  const pitch = parseNumber(favoriteForm.pitch)

  if (
    longitude === undefined ||
    latitude === undefined ||
    height === undefined ||
    heading === undefined ||
    pitch === undefined
  ) {
    return undefined
  }

  return snapshotCamera({
    longitude,
    latitude,
    height,
    heading,
    pitch,
  })
}

function syncForm(camera: CameraState) {
  favoriteForm.longitude = camera.longitude.toFixed(6)
  favoriteForm.latitude = camera.latitude.toFixed(6)
  favoriteForm.height = String(Math.round(clampCameraHeight(camera.height)))
  favoriteForm.heading = String(Math.round(normalizeHeading(camera.heading)))
  favoriteForm.pitch = String(Math.round(camera.pitch))
}

function showFeedback(message: string, tone: "info" | "error" = "info") {
  feedback.value = message
  feedbackTone.value = tone
  window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => {
    feedback.value = ""
  }, 3600)
}

function captureEditorScreenshot(camera: CameraState) {
  const thumbnail = mapController.captureScreenshotThumbnail()

  // 与 snapshotCamera 使用同一次采样结果绑定，避免连续点击“当前视角”时错配截图。
  if (editorSourceCamera.value === camera) {
    pendingScreenshot.value = thumbnail ?? ""

    if (!thumbnail) {
      showFeedback("自动截图失败，可先保存相机参数", "error")
    }
  }
}

function useCurrentView() {
  if (!mapReady.value) {
    showFeedback("地图尚未就绪，暂时无法收藏当前视角", "error")
    return
  }

  const camera = snapshotCamera(mapController.getCameraState())
  editorSourceCamera.value = camera
  syncForm(camera)

  if (editorMode.value === "create") {
    favoriteForm.name = createFavoriteName()
  }

  captureEditorScreenshot(camera)
}

function startCreate() {
  if (!mapReady.value) {
    showFeedback("地图尚未就绪，暂时无法收藏当前视角", "error")
    return
  }

  confirmingDeleteId.value = null
  editingFavoriteId.value = undefined
  editorMode.value = "create"
  favoriteForm.name = createFavoriteName()
  useCurrentView()
}

function startEdit(favorite: ViewFavorite) {
  confirmingDeleteId.value = null
  editorMode.value = "edit"
  editingFavoriteId.value = favorite.id
  editorSourceCamera.value = favorite.camera
  favoriteForm.name = favorite.name
  syncForm(favorite.camera)
  pendingScreenshot.value = favorite.screenshot
}

function closeEditor() {
  if (capturingFavorite.value) return

  editorMode.value = "closed"
  editingFavoriteId.value = undefined
  editorSourceCamera.value = undefined
  pendingScreenshot.value = ""
  feedback.value = ""
}

function hasCameraChanged(camera: CameraState) {
  const source = editorSourceCamera.value
  if (!source) return true

  return (
    !isNearlyEqual(source.longitude, camera.longitude, 1e-6) ||
    !isNearlyEqual(source.latitude, camera.latitude, 1e-6) ||
    !isNearlyEqual(source.height, camera.height, 0.5) ||
    !isNearlyEqual(source.heading, camera.heading, 0.5) ||
    !isNearlyEqual(source.pitch, camera.pitch, 0.5)
  )
}

function isNearlyEqual(left: number, right: number, tolerance: number) {
  return Math.abs(left - right) <= tolerance
}

async function saveCreate() {
  const camera = buildFormCamera()
  const name = favoriteForm.name.trim()

  if (!name) {
    showFeedback("请输入收藏名称", "error")
    return
  }

  if (!camera) {
    showFeedback("相机参数必须是有效数字", "error")
    return
  }

  savingFavorite.value = true
  const thumbnail = pendingScreenshot.value
  const now = new Date().toISOString()
  localStore.viewFavorites = [
    {
      id: createFavoriteId(),
      name,
      camera,
      screenshot: thumbnail,
      createdAt: now,
      updatedAt: now,
    },
    ...localStore.viewFavorites,
  ]
  savingFavorite.value = false
  closeEditor()
  showFeedback(
    thumbnail ? "收藏视角已保存" : "收藏视角已保存，但自动截图失败",
    thumbnail ? "info" : "error",
  )
}

async function saveEdit() {
  const favoriteId = editingFavoriteId.value
  const favorite = localStore.viewFavorites.find((item) => item.id === favoriteId)
  const camera = buildFormCamera()
  const name = favoriteForm.name.trim()

  if (!favorite) {
    showFeedback("收藏视角不存在或已被删除", "error")
    closeEditor()
    return
  }

  if (!name) {
    showFeedback("请输入收藏名称", "error")
    return
  }

  if (!camera) {
    showFeedback("相机参数必须是有效数字", "error")
    return
  }

  if (!hasCameraChanged(camera)) {
    updateFavorite(favorite.id, favorite.updatedAt, name, favorite.camera, favorite.screenshot)
    closeEditor()
    showFeedback("收藏视角已更新")
    return
  }

  savingFavorite.value = true
  capturingFavorite.value = true
  showFeedback("相机正在飞到收藏视角，稍后自动更新截图")

  mapController.flyToCameraState(camera, {
    onComplete: () => {
      updateScreenshotAfterFlight(favorite.id, favorite.updatedAt, name, camera)
    },
    onCancel: () => {
      capturingFavorite.value = false
      savingFavorite.value = false
      updateFavorite(favorite.id, favorite.updatedAt, name, camera, favorite.screenshot)
      closeEditor()
      showFeedback("飞行被中断，已保存参数但未更新截图", "error")
    },
  })
}

function updateScreenshotAfterFlight(
  favoriteId: string,
  originalUpdatedAt: string,
  name: string,
  camera: CameraState,
) {
  const favorite = localStore.viewFavorites.find((item) => item.id === favoriteId)
  if (!favorite || favorite.updatedAt !== originalUpdatedAt) {
    capturingFavorite.value = false
    savingFavorite.value = false
    return
  }

  const thumbnail = mapController.captureScreenshotThumbnail()
  updateFavorite(favoriteId, originalUpdatedAt, name, camera, thumbnail || favorite.screenshot)
  capturingFavorite.value = false
  savingFavorite.value = false
  closeEditor()
  showFeedback(
    thumbnail ? "收藏视角已更新" : "收藏视角已更新，但自动截图失败",
    thumbnail ? "info" : "error",
  )
}

function updateFavorite(
  favoriteId: string,
  originalUpdatedAt: string,
  name: string,
  camera: CameraState,
  screenshot: string,
) {
  localStore.viewFavorites = localStore.viewFavorites.map((favorite) => {
    if (favorite.id !== favoriteId || favorite.updatedAt !== originalUpdatedAt) return favorite

    return {
      ...favorite,
      name,
      camera,
      screenshot,
      updatedAt: new Date().toISOString(),
    }
  })
}

function locateFavorite(favorite: ViewFavorite) {
  if (!mapReady.value) {
    showFeedback("地图尚未就绪，暂时无法定位收藏视角", "error")
    return
  }

  mapController.flyToCameraState(favorite.camera, {
    onCancel: () => showFeedback("已取消定位收藏视角", "error"),
  })
}

function requestDelete(favorite: ViewFavorite) {
  confirmingDeleteId.value = confirmingDeleteId.value === favorite.id ? null : favorite.id
}

function deleteFavorite(favorite: ViewFavorite) {
  localStore.viewFavorites = localStore.viewFavorites.filter((item) => item.id !== favorite.id)
  confirmingDeleteId.value = null

  if (editingFavoriteId.value === favorite.id) {
    closeEditor()
  }

  showFeedback("收藏视角已删除")
}

function createFavoriteId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `view-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createFavoriteName() {
  return `收藏视角 ${new Date().toLocaleString("zh-CN", { hour12: false })}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { hour12: false })
}

function cameraSummary(camera: CameraState) {
  return `经度 ${camera.longitude.toFixed(5)} · 纬度 ${camera.latitude.toFixed(5)} · 高度 ${Math.round(camera.height)}m · 方位 ${Math.round(camera.heading)}° · 俯仰 ${Math.round(camera.pitch)}°`
}

onMounted(() => {
  disposeMountState = mapController.onMountStateChange((ready) => {
    mapReady.value = ready
  })
})

onBeforeUnmount(() => {
  disposeMountState?.()
  window.clearTimeout(feedbackTimer)
})
</script>

<template>
  <div class="view-favorites">
    <div class="toolbar">
      <label class="search-field">
        <span class="sr-only">搜索收藏视角</span>
        <input v-model="search" type="search" placeholder="搜索收藏名称" />
      </label>
      <button
        class="primary-button"
        type="button"
        :disabled="!mapReady || editorBusy"
        @click="startCreate"
      >
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        新增
      </button>
    </div>

    <form
      v-if="editorMode !== 'closed'"
      class="favorite-editor"
      aria-label="编辑收藏视角"
      @submit.prevent="editorMode === 'create' ? saveCreate() : saveEdit()"
    >
      <label>
        <span>名称</span>
        <input v-model="favoriteForm.name" type="text" maxlength="50" required />
      </label>

      <div class="screenshot-preview">
        <img v-if="pendingScreenshot" :src="pendingScreenshot" alt="收藏视角截图预览" />
        <div v-else class="screenshot-placeholder" aria-hidden="true">
          <i class="bi bi-camera"></i>
          <span>暂无截图</span>
        </div>
      </div>

      <div class="field-grid">
        <label>
          <span>经度</span>
          <input
            v-model="favoriteForm.longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            required
          />
        </label>
        <label>
          <span>纬度</span>
          <input
            v-model="favoriteForm.latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            required
          />
        </label>
      </div>

      <div class="field-grid">
        <label>
          <span>高度</span>
          <input
            v-model="favoriteForm.height"
            type="number"
            step="1"
            min="100"
            max="5000000"
            required
          />
        </label>
        <label>
          <span>方位角</span>
          <input v-model="favoriteForm.heading" type="number" step="1" min="0" max="360" required />
        </label>
      </div>

      <label>
        <span>俯仰角</span>
        <input v-model="favoriteForm.pitch" type="number" step="1" min="-90" max="90" required />
      </label>

      <div class="editor-actions">
        <button
          class="ghost-button"
          type="button"
          :disabled="editorBusy || !mapReady"
          @click="useCurrentView"
        >
          <i class="bi bi-crosshair" aria-hidden="true"></i>
          当前视角
        </button>
        <button
          class="ghost-button"
          type="button"
          :disabled="capturingFavorite"
          @click="closeEditor"
        >
          取消
        </button>
        <button class="primary-button" type="submit" :disabled="editorBusy">
          <i class="bi bi-check-lg" aria-hidden="true"></i>
          {{ editorMode === "create" ? "保存" : "保存并截图" }}
        </button>
      </div>
    </form>

    <div v-if="filteredFavorites.length === 0" class="empty-state">
      {{ search ? "没有匹配的收藏视角" : "暂无收藏视角" }}
    </div>

    <ul v-else class="favorite-list">
      <li v-for="favorite in filteredFavorites" :key="favorite.id">
        <article class="favorite-card">
          <div class="favorite-preview">
            <img
              v-if="favorite.screenshot"
              :src="favorite.screenshot"
              :alt="`${favorite.name} 的视角截图`"
            />
            <div v-else class="screenshot-placeholder" aria-hidden="true">
              <i class="bi bi-camera"></i>
            </div>
          </div>
          <div class="favorite-meta">
            <strong>{{ favorite.name }}</strong>
            <small>{{ cameraSummary(favorite.camera) }}</small>
            <time :datetime="favorite.updatedAt">{{ formatDateTime(favorite.updatedAt) }}</time>
          </div>
          <div class="favorite-actions">
            <button
              class="icon-button"
              type="button"
              title="定位到该视角"
              :disabled="listBusy || !mapReady"
              @click="locateFavorite(favorite)"
            >
              <i class="bi bi-geo" aria-hidden="true"></i>
            </button>
            <button
              class="icon-button"
              type="button"
              title="编辑收藏视角"
              :disabled="listBusy"
              @click="startEdit(favorite)"
            >
              <i class="bi bi-pencil" aria-hidden="true"></i>
            </button>
            <button
              v-if="confirmingDeleteId !== favorite.id"
              class="icon-button is-danger"
              type="button"
              title="删除收藏视角"
              :disabled="listBusy"
              @click="requestDelete(favorite)"
            >
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
            <template v-else>
              <button
                class="confirm-delete"
                type="button"
                :disabled="listBusy"
                @click="deleteFavorite(favorite)"
              >
                确认
              </button>
              <button
                class="icon-button"
                type="button"
                title="取消删除"
                :disabled="listBusy"
                @click="requestDelete(favorite)"
              >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </template>
          </div>
        </article>
      </li>
    </ul>

    <p v-if="feedback" class="operation-feedback" :class="`is-${feedbackTone}`" role="status">
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.view-favorites {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

input {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  background: rgba(7, 20, 42, 0.58);
  outline: none;
}

input:focus-visible {
  border-color: rgba(72, 229, 255, 0.68);
  outline: 2px solid rgba(72, 229, 255, 0.3);
  outline-offset: 1px;
}

label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
}

.favorite-editor {
  display: grid;
  gap: 9px;
  padding: 10px;
  border: 1px solid rgba(72, 229, 255, 0.24);
  border-radius: 4px;
  background: rgba(9, 25, 48, 0.5);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.screenshot-preview,
.favorite-preview {
  overflow: hidden;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  background: rgba(3, 9, 19, 0.7);
}

.screenshot-preview {
  aspect-ratio: 16 / 9;
}

.screenshot-preview img,
.favorite-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.screenshot-placeholder {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  width: 100%;
  height: 100%;
  color: var(--text-muted);
  font-size: 11px;
}

.screenshot-placeholder .bi {
  font-size: 18px;
}

.primary-button,
.ghost-button,
.confirm-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 9px;
  border-radius: 4px;
  font-size: 12px;
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background-color 140ms ease;
}

.primary-button {
  border: 1px solid rgba(72, 229, 255, 0.5);
  color: #04121e;
  background: var(--cyan);
}

.ghost-button {
  border: 1px solid rgba(79, 151, 255, 0.32);
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.44);
}

.confirm-delete {
  border: 1px solid rgba(255, 95, 120, 0.62);
  color: var(--rose);
  background: rgba(69, 15, 27, 0.62);
}

.primary-button:hover:not(:disabled),
.ghost-button:hover:not(:disabled),
.confirm-delete:hover:not(:disabled) {
  border-color: rgba(72, 229, 255, 0.78);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.9);
}

.primary-button:disabled,
.ghost-button:disabled,
.icon-button:disabled,
.confirm-delete:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.primary-button:focus-visible,
.ghost-button:focus-visible,
.icon-button:focus-visible,
.confirm-delete:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.46);
  outline-offset: 2px;
}

.editor-actions {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 6px;
}

.empty-state {
  padding: 18px 10px;
  border: 1px dashed var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.favorite-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.favorite-card {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 9px;
  padding: 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.48);
}

.favorite-preview {
  width: 84px;
  height: 48px;
}

.favorite-meta {
  display: grid;
  gap: 3px;
  align-content: start;
  min-width: 0;
}

.favorite-meta strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-meta small,
.favorite-meta time {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.3;
}

.favorite-meta small {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.favorite-actions {
  grid-column: 1 / 3;
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}

.icon-button,
.confirm-delete {
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border: 1px solid rgba(79, 151, 255, 0.28);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.42);
}

.confirm-delete {
  width: auto;
  padding: 0 8px;
}

.icon-button.is-danger:hover:not(:disabled) {
  border-color: rgba(255, 95, 120, 0.72);
  color: var(--rose);
}

.operation-feedback {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.operation-feedback.is-error {
  color: var(--rose);
}
</style>

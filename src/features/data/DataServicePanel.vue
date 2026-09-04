<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import FloatingWindow from "../../components/FloatingWindow.vue"
import { useMapController, type TerrainSource } from "../../map"
import { useLocalStore } from "../../stores"
import type { DataSourceConfig } from "./types"

interface DataServiceForm {
  id: string | null
  name: string
  url: string
}

const emit = defineEmits<{
  close: []
}>()

const mapController = useMapController()
const localStore = useLocalStore()
const form = reactive<DataServiceForm>({
  id: null,
  name: "",
  url: "",
})
const loading = ref(false)
const feedback = ref("")
const feedbackTone = ref<"info" | "error">("info")

const services = computed(() => localStore.dataServices)
const isEditing = computed(() => form.id !== null)

function createServiceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `data-service-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toTerrainSource(service: DataSourceConfig): TerrainSource {
  return {
    id: service.id,
    name: service.name,
    url: service.url,
    requestVertexNormals: service.params?.requestVertexNormals ?? false,
    requestWaterMask: service.params?.requestWaterMask ?? false,
  }
}

function showFeedback(message: string, tone: "info" | "error" = "info") {
  feedback.value = message
  feedbackTone.value = tone
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "DEM 服务加载失败"
}

function resetForm() {
  form.id = null
  form.name = ""
  form.url = ""
  showFeedback("")
}

function editService(service: DataSourceConfig) {
  form.id = service.id
  form.name = service.name
  form.url = service.url
  showFeedback("")
}

async function saveAndLoad() {
  if (loading.value) return

  const name = form.name.trim()
  const url = form.url.trim()

  if (!name) {
    showFeedback("请输入服务名称", "error")
    return
  }

  if (!/^https?:\/\/\S+$/i.test(url)) {
    showFeedback("服务地址必须是 http:// 或 https:// 开头", "error")
    return
  }

  const service: DataSourceConfig = {
    id: form.id ?? createServiceId(),
    name,
    type: "terrain",
    url,
    params: {},
  }

  loading.value = true
  showFeedback("正在加载 DEM 服务...")

  try {
    const applied = await mapController.setTerrainSource(toTerrainSource(service))
    if (!applied) {
      throw new Error("地图引擎未就绪或不支持当前数据服务")
    }

    localStore.upsertDataService(service)
    localStore.activeTerrainServiceId = service.id
    form.id = service.id
    form.name = service.name
    form.url = service.url
    showFeedback(`已加载 ${service.name}`)
  } catch (error) {
    showFeedback(getErrorMessage(error), "error")
  } finally {
    loading.value = false
  }
}

async function toggleService(service: DataSourceConfig) {
  if (loading.value) return

  if (service.id === localStore.activeTerrainServiceId) {
    loading.value = true
    showFeedback("正在停用 DEM 服务...")

    try {
      const applied = await mapController.setTerrainSource()
      if (!applied) {
        throw new Error("地图引擎未就绪，无法停用 DEM 服务")
      }

      localStore.activeTerrainServiceId = ""
      showFeedback("已停用 DEM 服务")
    } catch (error) {
      showFeedback(getErrorMessage(error), "error")
    } finally {
      loading.value = false
    }

    return
  }

  loading.value = true
  showFeedback(`正在加载 ${service.name}...`)

  try {
    const applied = await mapController.setTerrainSource(toTerrainSource(service))
    if (!applied) {
      throw new Error("地图引擎未就绪或不支持当前数据服务")
    }

    localStore.activeTerrainServiceId = service.id
    showFeedback(`已加载 ${service.name}`)
  } catch (error) {
    showFeedback(getErrorMessage(error), "error")
  } finally {
    loading.value = false
  }
}

async function removeService(service: DataSourceConfig) {
  if (loading.value) return

  if (service.id === localStore.activeTerrainServiceId) {
    loading.value = true
    showFeedback("正在停用 DEM 服务...")

    try {
      const applied = await mapController.setTerrainSource()
      if (!applied) {
        throw new Error("地图引擎未就绪，无法删除启用的 DEM 服务")
      }
    } catch (error) {
      showFeedback(getErrorMessage(error), "error")
      return
    } finally {
      loading.value = false
    }
  }

  localStore.removeDataService(service.id)

  if (form.id === service.id) {
    resetForm()
  }

  showFeedback(`已删除 ${service.name}`)
}
</script>

<template>
  <FloatingWindow
    id="left-data-panel"
    class="rail-panel panel-left"
    title="数据服务"
    tag="DEM"
    close-label="关闭数据服务"
    @close="emit('close')"
  >
    <form class="data-service-form" @submit.prevent="saveAndLoad">
      <label>
        <span>服务名称</span>
        <input
          v-model="form.name"
          name="data-service-name"
          type="text"
          autocomplete="off"
          placeholder="广西 DEM"
          required
        />
      </label>
      <label>
        <span>服务根地址</span>
        <input
          v-model="form.url"
          name="data-service-url"
          type="text"
          inputmode="url"
          spellcheck="false"
          autocomplete="off"
          placeholder="http://127.0.0.1:9000/gx/dem/"
          required
        />
      </label>
      <p class="field-hint">填写包含 layer.json 的服务根目录，并以 / 结尾</p>
      <div class="form-actions">
        <button type="submit" :disabled="loading">
          <i class="bi bi-cloud-download" aria-hidden="true"></i>
          {{ isEditing ? "保存并加载" : "新增并加载" }}
        </button>
        <button type="button" @click="resetForm">新增</button>
      </div>
    </form>

    <div v-if="services.length === 0" class="service-empty">暂无数据服务</div>
    <div v-else class="service-list" role="list">
      <article
        v-for="service in services"
        :key="service.id"
        role="listitem"
        :class="{ 'is-active': service.id === localStore.activeTerrainServiceId }"
      >
        <div class="service-meta">
          <strong>{{ service.name }}</strong>
          <small>{{ service.url }}</small>
        </div>
        <div class="service-actions">
          <button
            type="button"
            :disabled="loading"
            :aria-pressed="service.id === localStore.activeTerrainServiceId"
            @click="toggleService(service)"
          >
            {{ service.id === localStore.activeTerrainServiceId ? "停用" : "启用" }}
          </button>
          <button
            type="button"
            class="icon-button"
            :disabled="loading"
            title="编辑服务"
            :aria-label="`编辑${service.name}`"
            @click="editService(service)"
          >
            <i class="bi bi-pencil-square" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="icon-button is-danger"
            :disabled="loading"
            title="删除服务"
            :aria-label="`删除${service.name}`"
            @click="removeService(service)"
          >
            <i class="bi bi-trash" aria-hidden="true"></i>
          </button>
        </div>
      </article>
    </div>

    <p
      v-if="feedback"
      class="service-feedback"
      :class="`is-${feedbackTone}`"
      role="status"
      aria-live="polite"
    >
      {{ loading ? "加载中..." : feedback }}
    </p>
  </FloatingWindow>
</template>

<style scoped lang="scss">
.data-service-form,
.service-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.data-service-form label,
.service-meta {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.data-service-form span {
  color: var(--text-secondary);
  font-size: 11px;
}

.field-hint {
  margin: -5px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.4;
}

.data-service-form input {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  background: rgba(7, 20, 42, 0.58);
  outline: none;
}

.data-service-form input:focus-visible {
  border-color: rgba(72, 229, 255, 0.68);
  outline: 2px solid rgba(72, 229, 255, 0.3);
  outline-offset: 1px;
}

.form-actions,
.service-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-actions {
  justify-content: flex-end;
}

.data-service-form button,
.service-actions button {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid rgba(79, 151, 255, 0.32);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  background: rgba(19, 40, 72, 0.44);
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background-color 140ms ease;
}

.data-service-form button:hover:not(:disabled),
.data-service-form button:focus-visible,
.service-actions button:hover:not(:disabled),
.service-actions button:focus-visible {
  border-color: rgba(72, 229, 255, 0.72);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.86);
}

.data-service-form button:disabled,
.service-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.data-service-form button[type="submit"] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.service-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.45);
}

.service-list article.is-active {
  border-color: rgba(72, 229, 255, 0.58);
  background: rgba(72, 229, 255, 0.08);
}

.service-meta strong,
.service-meta small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-meta strong {
  color: var(--text-primary);
  font-size: 12px;
}

.service-meta small {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
}

.service-actions .icon-button {
  display: grid;
  place-items: center;
  width: 30px;
  padding: 0;
}

.service-actions .icon-button.is-danger:hover:not(:disabled),
.service-actions .icon-button.is-danger:focus-visible {
  border-color: rgba(255, 95, 120, 0.68);
  color: var(--rose);
  background: rgba(255, 95, 120, 0.1);
}

.service-empty {
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.service-feedback {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.service-feedback.is-error {
  color: var(--rose);
}

@media (max-width: 520px) {
  .service-list article {
    grid-template-columns: minmax(0, 1fr);
  }

  .service-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}
</style>

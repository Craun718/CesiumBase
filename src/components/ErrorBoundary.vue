<script setup lang="ts">
import { computed, onErrorCaptured, ref } from "vue"

const emit = defineEmits<{
  error: [error: unknown, info: string]
}>()

const error = ref<unknown>()
const hasError = ref(false)
const boundaryKey = ref(0)

const errorDetails = computed(() => {
  if (error.value instanceof Error) {
    return {
      message: error.value.message || error.value.name,
      stack: error.value.stack ?? error.value.toString(),
    }
  }

  return {
    message: String(error.value),
    stack: String(error.value),
  }
})

onErrorCaptured((capturedError, _instance, info) => {
  error.value = capturedError
  hasError.value = true

  const stack =
    capturedError instanceof Error
      ? (capturedError.stack ?? capturedError.toString())
      : String(capturedError)

  console.error(`[ErrorBoundary] Vue error info: ${info}\n${stack}`)
  emit("error", capturedError, info)

  return false
})

function reset() {
  error.value = undefined
  hasError.value = false
  boundaryKey.value += 1
}
</script>

<template>
  <slot v-if="!hasError" :key="boundaryKey" />
  <section v-else class="error-boundary" role="alert" aria-live="assertive">
    <div class="error-summary">
      <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
      <strong>{{ errorDetails.message }}</strong>
    </div>
    <pre><code>{{ errorDetails.stack }}</code></pre>
    <button class="error-reset" type="button" title="重试" aria-label="重试" @click="reset">
      <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
    </button>
  </section>
</template>

<style scoped lang="scss">
.error-boundary {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 22px;
  overflow: auto;
  border: 1px solid rgba(244, 63, 94, 0.38);
  background: rgba(7, 20, 42, 0.94);

  pre {
    width: 100%;
    min-width: 0;
    flex: 1;
    margin: 0;
    overflow: auto;
    color: var(--text-secondary);
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.error-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--rose);
  font-size: 14px;

  strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 650;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.error-reset {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  color: var(--text-primary);
  background: rgba(31, 62, 104, 0.82);

  &:hover,
  &:focus-visible {
    border-color: rgba(72, 229, 255, 0.58);
  }
}
</style>

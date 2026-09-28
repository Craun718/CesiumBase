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
  border: 1px solid var(--danger-soft);
  background: color-mix(in srgb, var(--color-panel) 94%, transparent);

  pre {
    width: 100%;
    min-width: 0;
    flex: 1;
    margin: 0;
    overflow: auto;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.error-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--danger);
  font-size: var(--text-md);

  strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-snug);
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
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--neutral) 32%, transparent);

  &:hover,
  &:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  }
}
</style>

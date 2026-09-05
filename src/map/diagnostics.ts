export interface MapDiagnosticStage {
  stage: string
  at: number
  detail?: unknown
}

const isBrowser = typeof window !== "undefined"
export const isMapDebugEnabled =
  isBrowser && new URLSearchParams(window.location.search).has("debugMap")

const stages: MapDiagnosticStage[] = []

if (isBrowser) {
  Object.assign(window, {
    __mapDiagnostics: {
      enabled: isMapDebugEnabled,
      stages,
    },
  })
}

export function logMapDiagnostic(stage: string, detail?: unknown) {
  const entry = {
    stage,
    at: performance.now(),
    ...(detail === undefined ? {} : { detail }),
  }

  stages.push(entry)

  if (isMapDebugEnabled) {
    console.info(`[map] ${stage}`, detail === undefined ? "" : detail)
  }
}

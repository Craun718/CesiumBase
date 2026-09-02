import { TerrainController } from "@deck.gl/core"

type ControllerEvent = Parameters<TerrainController["handleEvent"]>[0] & {
  middleButton?: boolean
  rightButton?: boolean
  center?: { x: number; y: number }
}

export class CesiumStyleTerrainController extends TerrainController {
  private rightDragLastY: number | null = null

  handleEvent(event: ControllerEvent): boolean {
    if (event.type === "panstart" && event.middleButton) {
      return super.handleEvent({ ...event, rightButton: true })
    }

    if (event.rightButton) {
      if (event.type === "panstart") {
        this.rightDragLastY = event.center?.y ?? null
        return true
      }

      if (event.type === "panmove" && this.rightDragLastY !== null) {
        const currentY = event.center?.y

        if (currentY !== undefined) {
          const deltaY = currentY - this.rightDragLastY
          this.rightDragLastY = currentY

          return super.handleEvent({
            ...event,
            type: "wheel",
            delta: -deltaY * 2,
          } as ControllerEvent)
        }
      }

      if (event.type === "panend") {
        this.rightDragLastY = null
        return true
      }
    }

    return super.handleEvent(event)
  }
}

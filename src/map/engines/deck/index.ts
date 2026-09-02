import "./deckMap.scss"

import type { MapEngineId } from "../../types"

export const mapEngineId: MapEngineId = "deck-gl"

export { createDeckMapEngine as createMapEngine } from "./DeckMapEngine"

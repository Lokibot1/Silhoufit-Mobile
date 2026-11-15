// How far the list moves for a finger drag: it starts at about 35% of the finger and tightens the further you pull (no hard stop).
export const MAX_PULL = 140
export const PULL_THRESHOLD = 64
const START_RATIO = 0.35
const K = MAX_PULL / START_RATIO

export function pullOffset(distance: number) {
  'worklet'
  return distance <= 0 ? 0 : MAX_PULL * (1 - Math.exp(-distance / K))
}

// Refreshing starts only once the list itself has been pulled past the threshold.
export function pastThreshold(offset: number) {
  'worklet'
  return offset >= PULL_THRESHOLD
}

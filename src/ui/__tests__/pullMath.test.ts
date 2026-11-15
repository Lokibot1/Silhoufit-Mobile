import { MAX_PULL, PULL_THRESHOLD, pastThreshold, pullOffset } from '../pullMath'

describe('pullOffset', () => {
  it('does not move without a downward drag', () => {
    expect(pullOffset(0)).toBe(0)
    expect(pullOffset(-30)).toBe(0)
  })

  it('moves at about 35% of the finger at the start', () => {
    expect(pullOffset(10) / 10).toBeCloseTo(0.35, 1)
  })

  it('resists more the further you pull and never passes the maximum', () => {
    const ratio = (d: number) => pullOffset(d) / d
    expect(ratio(100)).toBeLessThan(ratio(10))
    expect(ratio(300)).toBeLessThan(ratio(100))
    expect(pullOffset(5000)).toBeLessThanOrEqual(MAX_PULL)
    expect(pullOffset(200)).toBeGreaterThan(pullOffset(100))
  })
})

describe('pastThreshold', () => {
  it('refreshes only from the threshold on', () => {
    expect(pastThreshold(PULL_THRESHOLD - 1)).toBe(false)
    expect(pastThreshold(PULL_THRESHOLD)).toBe(true)
  })
})

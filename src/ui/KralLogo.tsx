import Svg, { Path } from 'react-native-svg'

import { color } from './theme'
import { WORDMARK } from './wordmark'

const { width: W, height: H } = WORDMARK
export const LOGO_PARTS = WORDMARK.letters.map((l) => l.d)

export function KralLogo({ width = 96, fill = color.obsidian }: { width?: number; fill?: string }) {
  return (
    <Svg width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`} accessible accessibilityRole="image" accessibilityLabel="KRAL">
      {LOGO_PARTS.map((d, i) => (
        <Path key={i} fill={fill} fillRule="evenodd" d={d} />
      ))}
    </Svg>
  )
}

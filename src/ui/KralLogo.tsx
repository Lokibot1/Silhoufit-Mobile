import Svg, { Path } from 'react-native-svg'

import { useTheme } from './theme'
import { WORDMARK } from './wordmark'

const { width: W, height: H } = WORDMARK
export const LOGO_PARTS = WORDMARK.letters.map((l) => l.d)

export function KralLogo({ width = 96, fill }: { width?: number; fill?: string }) {
  const { color } = useTheme()
  return (
    <Svg width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`} accessible accessibilityRole="image" accessibilityLabel="KRAL">
      {LOGO_PARTS.map((d, i) => (
        <Path key={i} fill={fill ?? color.obsidian}fillRule="evenodd" d={d} />
      ))}
    </Svg>
  )
}

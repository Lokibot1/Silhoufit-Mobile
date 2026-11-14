import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

// True when the OS asks for less motion (iOS Reduce Motion, Android "Remove animations").
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on), () => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return reduce
}

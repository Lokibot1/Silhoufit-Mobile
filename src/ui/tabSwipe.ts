// Bottom-tab routes in tab-bar order.
export const TAB_ROUTES = ['/', '/cart', '/orders', '/notifications', '/profile'] as const

// Distance (25% of width) or speed that turns a sideways drag into a tab switch.
const DISTANCE_RATIO = 0.25
const MIN_VELOCITY = 500

// Swipe left = next tab, right = previous. No wrap-around: null at either end or for a short, slow drag.
export function swipeTarget(translationX: number, velocityX: number, width: number, index: number): number | null {
  if (index < 0) return null
  const far = Math.abs(translationX) > width * DISTANCE_RATIO
  const fast = Math.abs(velocityX) > MIN_VELOCITY && Math.sign(velocityX) === Math.sign(translationX)
  if (!far && !fast) return null
  const next = index + (translationX < 0 ? 1 : -1)
  return next >= 0 && next < TAB_ROUTES.length ? next : null
}

// '/', '/cart', ... -> tab index; -1 when the path is not a tab.
export function tabIndex(pathname: string) {
  const path = pathname.replace(/^\/\(tabs\)/, '') || '/'
  return (TAB_ROUTES as readonly string[]).indexOf(path)
}

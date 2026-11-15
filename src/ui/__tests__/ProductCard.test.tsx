import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react-native'

import type { ProductListItem } from '@/api/products'
import { type CardRows, cardRows, ProductCard, useCardRows } from '../ProductCard'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('../PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('@/api/wishlist', () => ({ fetchWishlistIds: jest.fn(), addWishlistItem: jest.fn(), removeWishlistItem: jest.fn() }))
jest.mock('../Skeleton', () => ({ Skeleton: () => null }))

const base: ProductListItem = { id: 'p1', name: 'Linen Shirt', minPrice: 1250, maxPrice: 1250, totalStock: 20, imageUrl: 'https://x.test/a.jpg', rating: null, reviewCount: 0 }

it('shows a single price when min equals max', async () => {
  await render(<ProductCard item={base} />)
  expect(screen.getByText('₱1,250.00')).toBeTruthy()
})

it('shows "From" for a price range', async () => {
  await render(<ProductCard item={{ ...base, minPrice: 900, maxPrice: 1500 }} />)
  expect(screen.getByText('From ₱900.00')).toBeTruthy()
})

it('shows no price when there is none', async () => {
  await render(<ProductCard item={{ ...base, minPrice: null, maxPrice: null }} />)
  expect(screen.queryByText(/₱/)).toBeNull()
})

it('labels sold out and low stock only', async () => {
  const { rerender } = await render(<ProductCard item={{ ...base, totalStock: 0 }} />)
  expect(screen.getByText('Sold out')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, totalStock: 3 }} />)
  expect(screen.getByText('Only 3 left')).toBeTruthy()
  await rerender(<ProductCard item={base} />)
  expect(screen.queryByText(/left|sold out/i)).toBeNull()
})

it('shows the rating only when there are reviews', async () => {
  const { rerender } = await render(<ProductCard item={{ ...base, rating: 4.5, reviewCount: 8 }} />)
  expect(screen.getByText('4.5')).toBeTruthy()
  expect(screen.getByText('(8)')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, rating: 0, reviewCount: 0 }} />)
  expect(screen.queryByText('(0)')).toBeNull()
})

it('shows sold and delivery only when present, and keeps the card testID', async () => {
  const { rerender } = await render(<ProductCard item={base} />)
  expect(screen.queryByText(/sold$/)).toBeNull()
  expect(screen.queryByText(/^Avg/)).toBeNull()
  expect(screen.getByTestId('shop-card-p1')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, soldCount: 1250, avgDeliveryMinutes: 120 }} />)
  expect(screen.getByText('1.2k sold')).toBeTruthy()
  expect(screen.getByText('Avg 2 hrs')).toBeTruthy()
  expect(screen.getByTestId('shop-card-p1')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, soldCount: 0, avgDeliveryMinutes: null }} />)
  expect(screen.queryByText(/sold$/)).toBeNull()
  expect(screen.queryByText(/^Avg/)).toBeNull()
})

it('adds sold and delivery to the screen reader summary', async () => {
  await render(<ProductCard item={{ ...base, rating: 4.8, reviewCount: 36, soldCount: 371, avgDeliveryMinutes: 120 }} />)
  expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, rated 4.8 from 36 reviews, 371 sold, average delivery 2 hours')).toBeTruthy()
})

it('falls back to the name when the image is missing or fails', async () => {
  const { rerender } = await render(<ProductCard item={{ ...base, imageUrl: null }} />)
  expect(screen.getAllByText('Linen Shirt')).toHaveLength(2)
  await rerender(<ProductCard item={base} />)
  expect(screen.getAllByText('Linen Shirt')).toHaveLength(1)
  await fireEvent(screen.getByTestId('shop-card-p1-image'), 'error', { nativeEvent: {} })
  expect(screen.getAllByText('Linen Shirt')).toHaveLength(2)
})

it('summarises the card for screen readers', async () => {
  await render(<ProductCard item={{ ...base, rating: 4.5, reviewCount: 8, totalStock: 2 }} />)
  expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, Only 2 left, rated 4.5 from 8 reviews')).toBeTruthy()
})

it('shows the rating to one decimal in the text and the label', async () => {
  await render(<ProductCard item={{ ...base, rating: 4, reviewCount: 3 }} />)
  expect(screen.getByText('4.0')).toBeTruthy()
  expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, rated 4.0 from 3 reviews')).toBeTruthy()
})

const ROWS_OFF = { rating: false, sold: false, delivery: false }

describe('card rows', () => {
  const rated = { ...base, id: 'p2', rating: 4.5, reviewCount: 8 }
  const full = { ...base, id: 'p3', rating: 4.8, reviewCount: 36, soldCount: 371, avgDeliveryMinutes: 120 }

  it('cardRows reports none, rating only, or all', () => {
    expect(cardRows([base, { ...base, id: 'p2', soldCount: 0, avgDeliveryMinutes: null }])).toEqual(ROWS_OFF)
    expect(cardRows([base, rated])).toEqual({ rating: true, sold: false, delivery: false })
    expect(cardRows([base, rated, full])).toEqual({ rating: true, sold: true, delivery: true })
  })

  it('useCardRows only switches rows on while the list grows, and resets on a new first page', async () => {
    const { result, rerender } = await renderHook<CardRows, { items: ProductListItem[] }>(({ items }) => useCardRows(items), { initialProps: { items: [base] } })
    expect(result.current).toEqual(ROWS_OFF)
    await rerender({ items: [base, rated] })
    expect(result.current).toEqual({ rating: true, sold: false, delivery: false })
    await rerender({ items: [base, rated, { ...base, id: 'p4' }] })
    expect(result.current.rating).toBe(true)
    await rerender({ items: [{ ...base, id: 'p9' }] })
    expect(result.current).toEqual(ROWS_OFF)
  })

  it('renders only the rows it is given and keeps the label', async () => {
    const { rerender } = await render(<ProductCard item={full} rows={ROWS_OFF} />)
    expect(screen.getByTestId('shop-card-p3')).toBeTruthy()
    expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, rated 4.8 from 36 reviews, 371 sold, average delivery 2 hours')).toBeTruthy()
    expect(screen.queryByText('4.8')).toBeNull()
    expect(screen.queryByText('371 sold')).toBeNull()
    expect(screen.queryByText('Avg 2 hrs')).toBeNull()
    await rerender(<ProductCard item={full} rows={{ rating: true, sold: false, delivery: true }} />)
    expect(screen.getByText('4.8')).toBeTruthy()
    expect(screen.queryByText('371 sold')).toBeNull()
    expect(screen.getByText('Avg 2 hrs')).toBeTruthy()
  })
})

describe('wishlist heart', () => {
  const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
  const api = jest.requireMock('@/api/wishlist')
  const { router } = jest.requireMock('expo-router')
  const wishlist = { saved: false, onChange: jest.fn(), notify: jest.fn() }
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } } })
  })

  it('renders no heart without the wishlist prop', async () => {
    await render(<ProductCard item={base} />)
    expect(screen.queryByTestId('shop-card-p1-wishlist')).toBeNull()
  })

  it('is a sibling of the card button, not inside it, and never fetches the ids itself', async () => {
    await render(<ProductCard item={base} onPress={jest.fn()} wishlist={wishlist} />)
    const heart = screen.getByRole('button', { name: 'Add Linen Shirt to wishlist' })
    expect(heart.props.testID).toBe('shop-card-p1-wishlist')
    expect(within(screen.getByTestId('shop-card-p1')).queryByTestId('shop-card-p1-wishlist')).toBeNull()
    expect(api.fetchWishlistIds).not.toHaveBeenCalled()
  })

  it('reads the saved prop and toggles optimistically, then reports the change', async () => {
    api.addWishlistItem.mockResolvedValue(undefined)
    await render(<ProductCard item={base} wishlist={wishlist} />)
    await fireEvent.press(screen.getByTestId('shop-card-p1-wishlist'))
    expect(screen.getByRole('button', { name: 'Remove Linen Shirt from wishlist', selected: true })).toBeTruthy()
    expect(api.addWishlistItem).toHaveBeenCalledWith('p1')
    await waitFor(() => expect(wishlist.onChange).toHaveBeenCalledWith(true))
    expect(wishlist.notify).toHaveBeenCalledWith('Saved to wishlist')
  })

  it('rolls back when saving fails', async () => {
    api.addWishlistItem.mockRejectedValue(new Error('x'))
    await render(<ProductCard item={base} wishlist={wishlist} />)
    await fireEvent.press(screen.getByTestId('shop-card-p1-wishlist'))
    await waitFor(() => expect(wishlist.notify).toHaveBeenCalledWith(expect.stringContaining("Couldn't save to your wishlist")))
    expect(screen.getByRole('button', { name: 'Add Linen Shirt to wishlist', selected: false })).toBeTruthy()
    expect(wishlist.onChange).not.toHaveBeenCalled()
  })

  it('opens Sign In when signed out', async () => {
    mockUseSession.mockReturnValue({ session: null })
    await render(<ProductCard item={base} wishlist={wishlist} />)
    await fireEvent.press(screen.getByTestId('shop-card-p1-wishlist'))
    expect(router.push).toHaveBeenCalledWith('/sign-in')
    expect(api.addWishlistItem).not.toHaveBeenCalled()
  })
})

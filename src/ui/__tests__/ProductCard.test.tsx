import { fireEvent, render, renderHook, screen } from '@testing-library/react-native'

import type { ProductListItem } from '@/api/products'
import { type CardRows, cardRows, ProductCard, useCardRows } from '../ProductCard'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('../PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
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

it('shows the rating only when there are reviews, without the review count', async () => {
  const { rerender } = await render(<ProductCard item={{ ...base, rating: 4.5, reviewCount: 8 }} />)
  expect(screen.getByText('4.5')).toBeTruthy()
  expect(screen.queryByText('(8)')).toBeNull()
  await rerender(<ProductCard item={{ ...base, rating: 0, reviewCount: 0 }} />)
  expect(screen.queryByText('0.0')).toBeNull()
})

it('shows sold only when present, joined to the rating by a bar, and keeps the card testID', async () => {
  const { rerender } = await render(<ProductCard item={base} />)
  expect(screen.queryByText(/sold$/)).toBeNull()
  expect(screen.queryByText('|')).toBeNull()
  expect(screen.getByTestId('shop-card-p1')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, soldCount: 1250, avgDeliveryMinutes: 120 }} />)
  expect(screen.getByText('1.2k sold')).toBeTruthy()
  expect(screen.queryByText('|')).toBeNull()
  expect(screen.queryByText(/^Avg/)).toBeNull()
  await rerender(<ProductCard item={{ ...base, rating: 4.8, reviewCount: 36, soldCount: 128 }} />)
  expect(screen.getByText('4.8')).toBeTruthy()
  expect(screen.getByText('|')).toBeTruthy()
  expect(screen.getByText('128 sold')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, soldCount: 0 }} />)
  expect(screen.queryByText(/sold$/)).toBeNull()
})

it('adds rating and sold to the screen reader summary', async () => {
  await render(<ProductCard item={{ ...base, rating: 4.8, reviewCount: 36, soldCount: 371, avgDeliveryMinutes: 120 }} />)
  expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, rated 4.8 from 36 reviews, 371 sold')).toBeTruthy()
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

const ROWS_OFF = { rating: false, sold: false }

describe('card rows', () => {
  const rated = { ...base, id: 'p2', rating: 4.5, reviewCount: 8 }
  const full = { ...base, id: 'p3', rating: 4.8, reviewCount: 36, soldCount: 371, avgDeliveryMinutes: 120 }

  it('cardRows reports none, rating only, or all', () => {
    expect(cardRows([base, { ...base, id: 'p2', soldCount: 0, avgDeliveryMinutes: null }])).toEqual(ROWS_OFF)
    expect(cardRows([base, rated])).toEqual({ rating: true, sold: false })
    expect(cardRows([base, rated, full])).toEqual({ rating: true, sold: true })
  })

  it('useCardRows only switches rows on while the list grows, and resets on a new first page', async () => {
    const { result, rerender } = await renderHook<CardRows, { items: ProductListItem[] }>(({ items }) => useCardRows(items), { initialProps: { items: [base] } })
    expect(result.current).toEqual(ROWS_OFF)
    await rerender({ items: [base, rated] })
    expect(result.current).toEqual({ rating: true, sold: false })
    await rerender({ items: [base, rated, { ...base, id: 'p4' }] })
    expect(result.current.rating).toBe(true)
    await rerender({ items: [{ ...base, id: 'p9' }] })
    expect(result.current).toEqual(ROWS_OFF)
  })

  it('renders only the rows it is given and keeps the label', async () => {
    const { rerender } = await render(<ProductCard item={full} rows={ROWS_OFF} />)
    expect(screen.getByTestId('shop-card-p3')).toBeTruthy()
    expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, rated 4.8 from 36 reviews, 371 sold')).toBeTruthy()
    expect(screen.queryByText('4.8')).toBeNull()
    expect(screen.queryByText('371 sold')).toBeNull()
    await rerender(<ProductCard item={full} rows={{ rating: true, sold: false }} />)
    expect(screen.getByText('4.8')).toBeTruthy()
    expect(screen.getByText('371 sold')).toBeTruthy()
  })
})

import { fireEvent, render, screen } from '@testing-library/react-native'

import type { ProductListItem } from '@/api/products'
import { ProductCard } from '../ProductCard'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
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
  expect(screen.getByText('★ 4.5 (8)')).toBeTruthy()
  await rerender(<ProductCard item={{ ...base, rating: 0, reviewCount: 0 }} />)
  expect(screen.queryByText(/★/)).toBeNull()
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
  expect(screen.getByText('★ 4.0 (3)')).toBeTruthy()
  expect(screen.getByLabelText('Linen Shirt, ₱1,250.00, rated 4.0 from 3 reviews')).toBeTruthy()
})

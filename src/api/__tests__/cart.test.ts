import { ApiError, request } from '@/lib/api'

import { addCartItem, clearCart, fetchCart, removeCartItem, removeCartItems, setCartItemQuantity, toCart } from '../cart'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  variantId: 'v1',
  quantity: 2,
  unitPrice: 1250,
  totalPrice: 2500,
  variant: { id: 'v1', size: 'M', color: 'Red', price: 1250, stock: 5, imageUrl: 'https://x.test/v.jpg', product: { id: 'p1', name: 'Tee', imageUrl: 'https://x.test/p.jpg', isActive: true } },
  ...over,
})

describe('toCart', () => {
  it('parses a valid cart', () => {
    expect(toCart({ totalItems: 2, subtotal: 2500, items: [item()] })).toEqual({
      totalItems: 2,
      subtotal: 2500,
      items: [
        {
          id: 'i1',
          quantity: 2,
          lineTotal: 2500,
          variant: { id: 'v1', size: 'M', color: 'Red', price: 1250, stock: 5, imageUrl: 'https://x.test/v.jpg' },
          product: { id: 'p1', name: 'Tee', image: 'https://x.test/p.jpg', active: true },
        },
      ],
    })
  })
  it('parses an empty cart', () => {
    expect(toCart({ items: [] })).toEqual({ items: [], totalItems: 0, subtotal: 0 })
  })
  it('tolerates missing optional fields and sums the totals itself', () => {
    const bare = { id: 'i1', quantity: 3, unitPrice: 10.1, variant: { price: 10.1, product: { name: 'Tee' } }, variantId: 'v1' }
    const cart = toCart({ items: [bare] })
    expect(cart.totalItems).toBe(3)
    expect(cart.subtotal).toBe(30.3)
    expect(cart.items[0]).toMatchObject({ lineTotal: 30.3, variant: { id: 'v1', size: null, color: null, stock: null, imageUrl: null }, product: { image: null, active: true } })
  })
  it('falls back to the variant photo and flags an inactive product', () => {
    const raw = item({ variant: { id: 'v1', price: 5, stock: 1, imageUrl: 'https://x.test/v.jpg', product: { name: 'Tee', isActive: false } } })
    expect(toCart({ items: [raw] }).items[0]).toMatchObject({ product: { image: 'https://x.test/v.jpg', active: false } })
  })
  it('accepts numeric strings for price and quantity', () => {
    const raw = item({ quantity: '2', totalPrice: '2500.00', variant: { id: 'v1', price: '1250.00', stock: '5', product: { name: 'Tee' } } })
    expect(toCart({ totalItems: '2', subtotal: '2500.00', items: [raw] })).toMatchObject({
      totalItems: 2,
      subtotal: 2500,
      items: [{ quantity: 2, lineTotal: 2500, variant: { price: 1250, stock: 5 } }],
    })
  })
  it.each([
    ['null', null],
    ['a string', 'x'],
    ['no items', {}],
    ['items not an array', { items: {} }],
    ['an item that is not an object', { items: [1] }],
    ['an item with no variant', { items: [item({ variant: undefined })] }],
    ['an item with no product', { items: [item({ variant: { id: 'v1', price: 1 } })] }],
    ['an item with no id', { items: [item({ id: undefined })] }],
    ['a non-numeric quantity', { items: [item({ quantity: 'two' })] }],
    ['no price at all', { items: [item({ unitPrice: undefined, variant: { id: 'v1', product: { name: 'Tee' } } })] }],
    ['no product name', { items: [item({ variant: { id: 'v1', price: 1, product: { id: 'p1' } } })] }],
  ])('rejects %s', (_name, bad) => {
    expect(() => toCart(bad)).toThrow(expect.objectContaining({ kind: 'server' }))
  })
})

describe('cart calls', () => {
  const signal = new AbortController().signal
  beforeEach(() => jest.clearAllMocks())

  it('fetchCart GETs /cart with the session token (no auth: false) and parses it', async () => {
    mockRequest.mockResolvedValue({ items: [item()] })
    expect((await fetchCart(signal)).items).toHaveLength(1)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/cart', undefined, signal)
  })
  it('fetchCart rejects a bad body with a server error', async () => {
    mockRequest.mockResolvedValue({ nope: true })
    await expect(fetchCart()).rejects.toMatchObject({ kind: 'server' })
  })
  it('setCartItemQuantity PATCHes the item and parses the whole cart', async () => {
    mockRequest.mockResolvedValue({ items: [item({ quantity: 3 })] })
    expect((await setCartItemQuantity('i 1', 3, signal)).items[0].quantity).toBe(3)
    expect(mockRequest).toHaveBeenCalledWith('PATCH', '/cart/items/i%201', { quantity: 3 }, signal)
  })
  it('setCartItemQuantity surfaces the server detail on a 400', async () => {
    mockRequest.mockRejectedValue(new ApiError('validation', 'Requested quantity exceeds available stock (2 available)', 400))
    await expect(setCartItemQuantity('i1', 9)).rejects.toMatchObject({ kind: 'validation', detail: 'Requested quantity exceeds available stock (2 available)' })
  })
  it('removeCartItem DELETEs the item', async () => {
    mockRequest.mockResolvedValue({ success: true })
    await removeCartItem('i1', signal)
    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/cart/items/i1', undefined, signal)
  })
  it('removeCartItems DELETEs /cart/items with the ids and parses the whole cart', async () => {
    mockRequest.mockResolvedValue({ items: [item()] })
    expect((await removeCartItems(['a', 'b'], signal)).items).toHaveLength(1)
    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/cart/items', { itemIds: ['a', 'b'] }, signal)
  })
  it('clearCart DELETEs /cart', async () => {
    mockRequest.mockResolvedValue({ success: true })
    await clearCart(signal)
    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/cart', undefined, signal)
  })
})

describe('addCartItem', () => {
  it('posts the variant and quantity with the session token (no auth: false)', async () => {
    mockRequest.mockResolvedValue({ items: [] })
    const signal = new AbortController().signal
    expect(await addCartItem('v1', 1, signal)).toEqual({ items: [] })
    expect(mockRequest).toHaveBeenCalledWith('POST', '/cart/items', { variantId: 'v1', quantity: 1 }, signal)
  })
  it('surfaces the server detail on a 400', async () => {
    mockRequest.mockRejectedValue(new ApiError('validation', 'Only 2 left in stock', 400))
    await expect(addCartItem('v1', 5)).rejects.toMatchObject({ kind: 'validation', detail: 'Only 2 left in stock' })
  })
  it.each([null, 'x', 42])('rejects the bad shape %p', async (bad) => {
    mockRequest.mockResolvedValue(bad)
    await expect(addCartItem('v1', 1)).rejects.toMatchObject({ kind: 'server' })
  })
})

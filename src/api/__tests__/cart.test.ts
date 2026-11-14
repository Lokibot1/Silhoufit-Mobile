import { ApiError, request } from '@/lib/api'

import { addCartItem } from '../cart'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

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

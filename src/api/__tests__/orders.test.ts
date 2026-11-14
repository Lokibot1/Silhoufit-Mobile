import { ApiError, request } from '@/lib/api'

import { awaitsPayment, cancelOrder, createCheckoutSession, fetchOrder, fetchOrdersPage, orderTimeline, paymentLabel, shipmentLabel, statusLabel, toOrder, toOrdersPage } from '../orders'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  orderNumber: 'SHF-20261114-ABC123',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  subtotalAmount: 2500,
  shippingAmount: 150,
  discountAmount: 0,
  totalAmount: 2650,
  createdAt: '2026-11-14T05:49:00.000Z',
  paidAt: null,
  cancelledAt: null,
  cancellationReason: null,
  shippingAddressSnapshot: { recipientName: 'Ana Cruz', phone: '09171234567', streetAddress: '1 Main St', addressLine2: null, barangay: 'Brgy 1', cityMunicipality: 'Makati', province: 'Metro Manila', postalCode: '1200' },
  items: [{ id: 'i1', productName: 'Tee', variantSize: 'M', variantColor: 'Red', unitPrice: 1250, quantity: 2, totalPrice: 2500, imageUrl: 'https://x.test/t.jpg' }],
  shipment: null,
  ...over,
})

describe('toOrder', () => {
  it('parses a full order', () => {
    expect(toOrder(raw())).toEqual({
      id: 'o1',
      orderNumber: 'SHF-20261114-ABC123',
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      subtotal: 2500,
      shipping: 150,
      discount: 0,
      total: 2650,
      createdAt: '2026-11-14T05:49:00.000Z',
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      address: { recipient: 'Ana Cruz', phone: '09171234567', line: '1 Main St, Brgy 1', city: 'Makati, Metro Manila, 1200' },
      items: [{ id: 'i1', name: 'Tee', size: 'M', color: 'Red', quantity: 2, unitPrice: 1250, lineTotal: 2500, imageUrl: 'https://x.test/t.jpg' }],
      shipment: null,
    })
  })
  it('parses a minimal order and fills what it can', () => {
    const order = toOrder({ id: 'o', orderNumber: 'N', status: 'PAID', createdAt: '2026-11-14T00:00:00Z', totalAmount: 10, items: [{ id: 'i', productName: 'Tee', quantity: 3, unitPrice: 3.1 }] })
    expect(order).toMatchObject({ paymentStatus: '', subtotal: 9.3, shipping: 0, discount: 0, address: null, shipment: null, paidAt: null })
    expect(order.items[0]).toMatchObject({ size: null, color: null, imageUrl: null, lineTotal: 9.3 })
  })
  it('accepts numeric strings (Prisma decimals)', () => {
    const order = toOrder(raw({ subtotalAmount: '2500.00', shippingAmount: '150.00', totalAmount: '2650.00', items: [{ id: 'i', productName: 'Tee', quantity: '2', unitPrice: '1250.00', totalPrice: '2500.00' }] }))
    expect(order).toMatchObject({ subtotal: 2500, shipping: 150, total: 2650 })
    expect(order.items[0]).toMatchObject({ quantity: 2, unitPrice: 1250, lineTotal: 2500 })
  })
  it('keeps a shipment with its times and ignores one with no status', () => {
    expect(toOrder(raw({ shipment: { status: 'ON_GOING', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: null } })).shipment).toEqual({ status: 'ON_GOING', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: null })
    expect(toOrder(raw({ shipment: { courier: 'x' } })).shipment).toBeNull()
  })
  it('throws ApiError(server) on a bad shape', () => {
    for (const bad of [null, 'x', [], {}, raw({ items: undefined }), raw({ id: undefined }), raw({ totalAmount: 'abc' }), raw({ status: undefined }), raw({ createdAt: undefined }), raw({ items: [{ id: 'i' }] })]) {
      expect(() => toOrder(bad)).toThrow('Request failed (server).')
    }
  })
})

describe('toOrdersPage', () => {
  it('parses a page', () => {
    expect(toOrdersPage({ data: [raw()], meta: { total: 11, page: 1, hasNextPage: true } })).toMatchObject({ total: 11, page: 1, hasNextPage: true, items: [{ id: 'o1' }] })
  })
  it('falls back to the requested page and no next page', () => {
    expect(toOrdersPage({ data: [], meta: { total: 0 } }, 3)).toEqual({ items: [], total: 0, page: 3, hasNextPage: false })
  })
  it('throws on a bad shape', () => {
    for (const bad of [null, {}, { data: [] }, { data: {}, meta: { total: 1 } }, { data: [{}], meta: { total: 1 } }]) {
      expect(() => toOrdersPage(bad)).toThrow('Request failed (server).')
    }
  })
})

describe('labels and rules', () => {
  it('maps known values to customer wording and an unknown one to a neutral label', () => {
    expect(statusLabel('PENDING_PAYMENT')).toBe('Awaiting payment')
    expect(statusLabel('OUT_FOR_DELIVERY')).toBe('Out for delivery')
    expect(statusLabel('SOMETHING_NEW')).toBe('Something new')
    expect(statusLabel('')).toBe('Unknown')
    expect(paymentLabel('UNPAID')).toBe('Unpaid')
    expect(paymentLabel('WEIRD')).toBe('Weird')
    expect(shipmentLabel('ASSIGNING_DRIVER')).toBe('Finding a driver')
  })
  it('offers pay and cancel only for an unpaid order', () => {
    expect(awaitsPayment({ status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' })).toBe(true)
    expect(awaitsPayment({ status: 'PAYMENT_FAILED', paymentStatus: 'FAILED' })).toBe(true)
    expect(awaitsPayment({ status: 'PENDING_PAYMENT', paymentStatus: 'PAID' })).toBe(false)
    for (const status of ['PAID', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'SOMETHING_NEW']) expect(awaitsPayment({ status, paymentStatus: 'UNPAID' })).toBe(false)
  })
  it('builds the timeline only from timestamps the API sent', () => {
    expect(orderTimeline(toOrder(raw()))).toEqual([{ label: 'Placed', at: '2026-11-14T05:49:00.000Z' }])
    const full = toOrder(raw({ status: 'DELIVERED', paidAt: '2026-11-14T06:00:00Z', shipment: { status: 'COMPLETED', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: '2026-11-15T03:00:00Z' } }))
    expect(orderTimeline(full).map((s) => s.label)).toEqual(['Placed', 'Paid', 'Handed to courier', 'Delivered'])
    const cancelled = toOrder(raw({ status: 'CANCELLED', cancelledAt: '2026-11-14T07:00:00Z', cancellationReason: 'Cancelled by customer' }))
    expect(orderTimeline(cancelled).at(-1)).toEqual({ label: 'Cancelled', at: '2026-11-14T07:00:00Z', note: 'Cancelled by customer' })
  })
})

describe('requests', () => {
  beforeEach(() => mockRequest.mockReset())

  it('GETs a page with the session', async () => {
    mockRequest.mockResolvedValue({ data: [raw()], meta: { total: 1, page: 2, hasNextPage: false } })
    const signal = new AbortController().signal
    expect((await fetchOrdersPage({ page: 2, limit: 10 }, signal)).page).toBe(2)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/orders?page=2&limit=10', undefined, signal)
  })
  it('GETs one order with the id encoded', async () => {
    mockRequest.mockResolvedValue(raw())
    await fetchOrder('a/b c')
    expect(mockRequest).toHaveBeenCalledWith('GET', '/orders/a%2Fb%20c', undefined, undefined)
  })
  it('treats a 400 on the id as not found, and passes other failures through', async () => {
    mockRequest.mockRejectedValueOnce(new ApiError('validation', 'uuid is expected', 400))
    await expect(fetchOrder('nope')).rejects.toMatchObject({ kind: 'not-found' })
    mockRequest.mockRejectedValueOnce(new ApiError('network'))
    await expect(fetchOrder('x')).rejects.toMatchObject({ kind: 'network' })
  })
  it('POSTs the checkout session with no body and returns the https address', async () => {
    mockRequest.mockResolvedValue({ checkoutUrl: 'https://pay.test/c/1' })
    expect(await createCheckoutSession('o/1')).toBe('https://pay.test/c/1')
    expect(mockRequest).toHaveBeenCalledWith('POST', '/orders/o%2F1/checkout-session', undefined, undefined)
  })
  it('rejects a missing or insecure payment address', async () => {
    const bad = ['', 'http://pay.test', 'javascript:alert(1)', 'https://', '/pay/1', 'pay.test/c/1', 'not a url']
    for (const body of [{}, null, ...bad.map((checkoutUrl) => ({ checkoutUrl }))]) {
      mockRequest.mockResolvedValueOnce(body)
      await expect(createCheckoutSession('o1')).rejects.toMatchObject({ kind: 'server' })
    }
  })
  it('accepts an upper-case HTTPS scheme', async () => {
    mockRequest.mockResolvedValue({ checkoutUrl: 'HTTPS://pay.test/c/1' })
    expect(await createCheckoutSession('o1')).toBe('HTTPS://pay.test/c/1')
  })
  it('POSTs the cancel with an empty body and ignores the answer', async () => {
    mockRequest.mockResolvedValue({ anything: true })
    await expect(cancelOrder('o 1')).resolves.toBeUndefined()
    expect(mockRequest).toHaveBeenCalledWith('POST', '/orders/o%201/cancel', {}, undefined)
  })
})

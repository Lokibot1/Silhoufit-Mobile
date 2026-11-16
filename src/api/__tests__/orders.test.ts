import { ApiError, request } from '@/lib/api'

import { awaitsPayment, cancelOrder, isClosed, orderSignature, ordersSignature, createCheckoutSession, createOrder, quoteShipping, fetchAllOrders, fetchOrder, fetchOrdersPage, matchesTab, ORDER_TABS, buildTimeline, tabCounts, trackingLink, paymentLabel, shipmentLabel, statusLabel, toOrder, toOrdersPage } from '../orders'
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
  items: [{ id: 'i1', productName: 'Tee', variantSize: 'M', variantColor: 'Red', unitPrice: 1250, quantity: 2, totalPrice: 2500, imageUrl: 'https://x.test/t.jpg', variantSku: 'TEE-M-RED' }],
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
      updatedAt: '2026-11-14T05:49:00.000Z',
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      address: { recipient: 'Ana Cruz', phone: '09171234567', line: '1 Main St, Brgy 1', city: 'Makati, Metro Manila, 1200' },
      items: [{ id: 'i1', name: 'Tee', size: 'M', color: 'Red', quantity: 2, unitPrice: 1250, lineTotal: 2500, imageUrl: 'https://x.test/t.jpg', sku: 'TEE-M-RED' }],
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
    expect(toOrder(raw({ shipment: { status: 'ON_GOING', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: null, trackingUrl: 'https://t.test/1' } })).shipment).toEqual({ status: 'ON_GOING', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: null, trackingUrl: 'https://t.test/1' })
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
  describe('buildTimeline', () => {
    const states = (o: ReturnType<typeof toOrder>) => buildTimeline(o).map((s) => `${s.key}:${s.state}`)
    const FLOW = ['placed', 'paid', 'preparing', 'shipped', 'out', 'delivered']
    const at = { paidAt: '2026-11-14T06:00:00Z', shipment: { status: 'ON_GOING', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: null } }
    it.each([
      ['PENDING_PAYMENT', 1],
      ['PAYMENT_FAILED', 1],
      ['PAID', 2],
      ['PROCESSING', 2],
      ['DISPATCHED', 3],
      ['OUT_FOR_DELIVERY', 4],
    ])('%s: stages before are done, one is current, the rest upcoming', (status, current) => {
      expect(states(toOrder(raw({ status })))).toEqual(FLOW.map((key, i) => `${key}:${i < current ? 'done' : i === current ? 'current' : 'upcoming'}`))
    })
    it('a delivered order is done end to end', () => {
      expect(states(toOrder(raw({ status: 'DELIVERED' }))).every((s) => s.endsWith(':done'))).toBe(true)
    })
    it('uses only real times: none invented for a stage reached by status, none for upcoming', () => {
      const steps = buildTimeline(toOrder(raw({ status: 'PROCESSING', ...at })))
      expect(steps.map((s) => s.at)).toEqual(['2026-11-14T05:49:00.000Z', '2026-11-14T06:00:00Z', null, null, null, null])
      const shipped = buildTimeline(toOrder(raw({ status: 'DISPATCHED', ...at })))
      expect(shipped.map((s) => s.at)).toEqual(['2026-11-14T05:49:00.000Z', '2026-11-14T06:00:00Z', null, '2026-11-15T01:00:00Z', null, null])
    })
    it('labels the second stage Payment failed after a failed payment', () => {
      expect(buildTimeline(toOrder(raw({ status: 'PAYMENT_FAILED' })))[1].label).toBe('Payment failed')
    })
    it('stops at Cancelled with its reason', () => {
      const cancelled = toOrder(raw({ status: 'CANCELLED', cancelledAt: '2026-11-14T07:00:00Z', cancellationReason: 'Cancelled by customer' }))
      expect(buildTimeline(cancelled)).toEqual([
        { key: 'placed', label: 'Placed', at: '2026-11-14T05:49:00.000Z', state: 'done' },
        { key: 'cancelled', label: 'Cancelled', at: '2026-11-14T07:00:00Z', state: 'cancelled', note: 'Cancelled by customer' },
      ])
    })
    it('a refunded order shows what happened, then Refunded as current', () => {
      expect(states(toOrder(raw({ status: 'REFUNDED' })))).toEqual(['placed:done', 'refunded:current'])
      expect(states(toOrder(raw({ status: 'REFUNDED', ...at })))).toEqual(['placed:done', 'paid:done', 'preparing:done', 'shipped:done', 'refunded:current'])
      const delivered = { status: 'COMPLETED', pickupTime: '2026-11-15T01:00:00Z', deliveredAt: '2026-11-15T03:00:00Z' }
      expect(states(toOrder(raw({ status: 'REFUNDED', ...at, shipment: delivered }))).at(-2)).toBe('delivered:done')
    })
    it('claims nothing beyond the placement for a status it does not know', () => {
      expect(states(toOrder(raw({ status: 'SOMETHING_NEW' })))).toEqual(['placed:done'])
      expect(states(toOrder(raw({ status: 'constructor' })))).toEqual(['placed:done'])
    })
  })
})

describe('order tabs', () => {
  const all = ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'SOMETHING_NEW'].map((status) => ({ status }))
  it('groups statuses like the web and shows an unknown status only under All', () => {
    expect(tabCounts(all)).toEqual({ all: 10, 'to-pay': 2, 'to-ship': 2, 'to-receive': 2, completed: 1, cancelled: 1, returns: 1 })
    expect(ORDER_TABS.map((t) => t.label)).toEqual(['All', 'To pay', 'To ship', 'To receive', 'Completed', 'Cancelled', 'Returns/Refund'])
  })
  it('matches an order to its tab', () => {
    expect(matchesTab({ status: 'PAID' }, 'to-ship')).toBe(true)
    expect(matchesTab({ status: 'PAID' }, 'to-pay')).toBe(false)
    expect(matchesTab({ status: 'SOMETHING_NEW' }, 'all')).toBe(true)
  })
  it('links tracking only for an order on its way and only to a secure web address', () => {
    const shipment = (trackingUrl: string | null) => ({ status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl })
    expect(trackingLink({ status: 'DISPATCHED', shipment: shipment('https://t.test/1') })).toBe('https://t.test/1')
    expect(trackingLink({ status: 'OUT_FOR_DELIVERY', shipment: shipment('HTTPS://t.test/1') })).toBe('HTTPS://t.test/1')
    expect(trackingLink({ status: 'DISPATCHED', shipment: shipment('http://t.test/1') })).toBeNull()
    expect(trackingLink({ status: 'DELIVERED', shipment: shipment('https://t.test/1') })).toBeNull()
    expect(trackingLink({ status: 'DISPATCHED', shipment: shipment('javascript:alert(1)') })).toBeNull()
    expect(trackingLink({ status: 'DISPATCHED', shipment: shipment(null) })).toBeNull()
    expect(trackingLink({ status: 'DISPATCHED', shipment: null })).toBeNull()
  })
})

it('toOrder falls back to createdAt when the API sends no updatedAt', () => {
  expect(toOrder(raw()).updatedAt).toBe('2026-11-14T05:49:00.000Z')
})

describe('requests', () => {
  beforeEach(() => mockRequest.mockReset())

  it('GETs a page with the session', async () => {
    mockRequest.mockResolvedValue({ data: [raw()], meta: { total: 1, page: 2, hasNextPage: false } })
    const signal = new AbortController().signal
    expect((await fetchOrdersPage({ page: 2, limit: 10 }, signal)).page).toBe(2)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/orders?page=2&limit=10', undefined, signal)
  })
  describe('fetchAllOrders', () => {
    const pageBody = (ids: string[], page: number, hasNextPage: boolean) => ({ data: ids.map((id) => raw({ id })), meta: { total: 9, page, hasNextPage } })
    it('reads pages of 100 until there is no next page and drops a repeated order', async () => {
      mockRequest.mockResolvedValueOnce(pageBody(['a', 'b'], 1, true)).mockResolvedValueOnce(pageBody(['b', 'c'], 2, false))
      const signal = new AbortController().signal
      expect((await fetchAllOrders(signal)).map((o) => o.id)).toEqual(['a', 'b', 'c'])
      expect(mockRequest).toHaveBeenNthCalledWith(1, 'GET', '/orders?page=1&limit=100', undefined, signal)
      expect(mockRequest).toHaveBeenNthCalledWith(2, 'GET', '/orders?page=2&limit=100', undefined, signal)
      expect(mockRequest).toHaveBeenCalledTimes(2)
    })
    it('stops at 5 pages', async () => {
      mockRequest.mockImplementation(async (_m: string, path: string) => pageBody([path], Number(/page=(\d+)/.exec(path)?.[1]), true))
      expect(await fetchAllOrders()).toHaveLength(5)
      expect(mockRequest).toHaveBeenCalledTimes(5)
    })
    it('fails when a page fails', async () => {
      mockRequest.mockResolvedValueOnce(pageBody(['a'], 1, true)).mockRejectedValueOnce(new ApiError('network'))
      await expect(fetchAllOrders()).rejects.toMatchObject({ kind: 'network' })
    })
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

describe('quoteShipping', () => {
  beforeEach(() => mockRequest.mockReset())
  const quote = { quotationId: 'q1', courier: 'Lalamove', shippingFee: '150.50', expiresAt: '2026-11-15T10:00:00.000Z' }
  it('POSTs the address and parses the quote', async () => {
    mockRequest.mockResolvedValue(quote)
    expect(await quoteShipping('a1')).toEqual({ ...quote, shippingFee: 150.5 })
    expect(mockRequest).toHaveBeenCalledWith('POST', '/orders/quote-shipping', { addressId: 'a1' }, undefined)
  })
  it('falls back to Courier when none is named', async () => {
    mockRequest.mockResolvedValue({ ...quote, courier: undefined })
    expect((await quoteShipping('a1')).courier).toBe('Courier')
  })
  it('rejects a bad shape', async () => {
    for (const body of [null, {}, { ...quote, quotationId: '' }, { ...quote, shippingFee: 'free' }, { ...quote, expiresAt: 'soon' }, { ...quote, expiresAt: undefined }]) {
      mockRequest.mockResolvedValueOnce(body)
      await expect(quoteShipping('a1')).rejects.toMatchObject({ kind: 'server' })
    }
  })
})

describe('createOrder', () => {
  beforeEach(() => mockRequest.mockReset())
  it('sends exactly addressId, cartItemIds and quotationId, and parses the order', async () => {
    mockRequest.mockResolvedValue(raw())
    const order = await createOrder({ addressId: 'a1', cartItemIds: ['c1'], quotationId: 'q1' })
    expect(order.id).toBe('o1')
    expect(mockRequest).toHaveBeenCalledWith('POST', '/orders', { addressId: 'a1', cartItemIds: ['c1'], quotationId: 'q1' }, undefined)
  })
  it('omits quotationId when absent', async () => {
    mockRequest.mockResolvedValue(raw())
    await createOrder({ addressId: 'a1', cartItemIds: ['c1'] })
    expect(mockRequest.mock.calls[0][2]).toStrictEqual({ addressId: 'a1', cartItemIds: ['c1'] })
  })
  it('rejects a malformed order', async () => {
    mockRequest.mockResolvedValue({})
    await expect(createOrder({ addressId: 'a1', cartItemIds: ['c1'] })).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('live poll helpers', () => {
  it.each([['DELIVERED', true], ['CANCELLED', true], ['REFUNDED', true], ['PAID', false], ['PENDING_PAYMENT', false], ['MYSTERY', false]])('isClosed(%s) is %s', (status, closed) => {
    expect(isClosed({ status })).toBe(closed)
  })
  it('a signature changes with what a customer sees, not with a fresh copy of the same order', () => {
    const base = toOrder(raw())
    expect(orderSignature(toOrder(raw()))).toBe(orderSignature(base))
    expect(orderSignature(toOrder(raw({ status: 'PAID', paymentStatus: 'PAID' })))).not.toBe(orderSignature(base))
    expect(orderSignature(toOrder(raw({ shipment: { status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl: null } })))).not.toBe(orderSignature(base))
    expect(ordersSignature([base, base])).toBe(ordersSignature([toOrder(raw()), toOrder(raw())]))
    expect(ordersSignature([base])).not.toBe(ordersSignature([base, base]))
  })
})

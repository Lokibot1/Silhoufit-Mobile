import { ApiError } from '@/lib/api'
import { fetchBodyProfile, saveBodyProfile, toBodyProfile, updateBodyProfile } from '../bodyProfile'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest: jest.Mock = jest.requireMock('@/lib/api').request

const raw = { id: 'b1', userId: 'u1', heightCm: 170, weightKg: '65.5', chestCm: 90, waistCm: 70, hipsCm: 95, bodyModel: 'female', bodyBuild: 'lean', skinTone: 40 }

describe('toBodyProfile', () => {
  it('keeps known fields, reads decimal strings and nulls the rest', () =>
    expect(toBodyProfile(raw)).toMatchObject({ heightCm: 170, weightKg: 65.5, chestCm: 90, bustCm: null, shoulderWidthCm: null, bodyModel: 'female', bodyBuild: 'lean' }))
  it('drops models and builds the app does not know', () => expect(toBodyProfile({ ...raw, bodyModel: 'unisex', bodyBuild: 'x' })).toMatchObject({ bodyModel: null, bodyBuild: null }))
  it.each([null, 'x', {}, { heightCm: 'tall' }])('rejects %p', (body) => expect(toBodyProfile(body)).toBeNull())
})

describe('requests', () => {
  beforeEach(() => mockRequest.mockReset())
  it('GET returns the parsed profile', async () => {
    mockRequest.mockResolvedValue(raw)
    await expect(fetchBodyProfile()).resolves.toMatchObject({ heightCm: 170 })
    expect(mockRequest).toHaveBeenCalledWith('GET', '/users/me/body-profile', undefined, undefined)
  })
  it('GET 404 means no profile yet', async () => {
    mockRequest.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await expect(fetchBodyProfile()).resolves.toBeNull()
  })
  it.each([['network'], ['forbidden'], ['server']] as const)('GET lets a %s failure through', async (kind) => {
    mockRequest.mockRejectedValue(new ApiError(kind))
    await expect(fetchBodyProfile()).rejects.toMatchObject({ kind })
  })
  it('GET with a body that is not a profile throws a server error', async () => {
    mockRequest.mockResolvedValue({ ok: true })
    await expect(fetchBodyProfile()).rejects.toMatchObject({ kind: 'server' })
  })
  it('PUT sends the whole profile, PATCH only the patch', async () => {
    mockRequest.mockResolvedValue(raw)
    const full = toBodyProfile(raw)!
    await saveBodyProfile(full)
    expect(mockRequest).toHaveBeenLastCalledWith('PUT', '/users/me/body-profile', full, undefined)
    await updateBodyProfile({ chestCm: 91 })
    expect(mockRequest).toHaveBeenLastCalledWith('PATCH', '/users/me/body-profile', { chestCm: 91 }, undefined)
  })
  it('surfaces a validation failure with the server message', async () => {
    mockRequest.mockRejectedValue(new ApiError('validation', 'heightCm must not be greater than 300', 400))
    await expect(saveBodyProfile(toBodyProfile(raw)!)).rejects.toMatchObject({ kind: 'validation', detail: 'heightCm must not be greater than 300' })
  })
})

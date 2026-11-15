import { rememberCreated, takeCreated } from '@/checkout/newAddress'

describe('the address just saved from checkout', () => {
  it('is handed back once, to the account that saved it', () => {
    rememberCreated('u1', 'a1')
    expect(takeCreated('u1')).toBe('a1')
    expect(takeCreated('u1')).toBeNull()
  })
  it('is never handed to another account, and is forgotten once asked for', () => {
    rememberCreated('u1', 'a1')
    expect(takeCreated('u2')).toBeNull()
    expect(takeCreated('u1')).toBeNull()
    rememberCreated('u1', 'a2')
    expect(takeCreated(undefined)).toBeNull()
  })
})

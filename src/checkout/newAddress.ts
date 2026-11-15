// The address just saved from checkout's "Add New Address": checkout takes it on return and selects it.
// It belongs to the account that saved it, so another account (or a later visit) never receives it.
let created: { userId: string; id: string } | null = null

export const rememberCreated = (userId: string, id: string) => {
  created = { userId, id }
}

export function takeCreated(userId: string | undefined) {
  const mine = created && created.userId === userId ? created.id : null
  created = null
  return mine
}

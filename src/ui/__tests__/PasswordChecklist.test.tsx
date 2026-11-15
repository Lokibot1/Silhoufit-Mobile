import { render, screen } from '@testing-library/react-native'

import { PasswordChecklist } from '../PasswordChecklist'
import { color } from '../theme'

const group = () => screen.getByTestId('password-checklist')
const flat = (id: string) => Object.assign({}, ...[screen.getByTestId(id, { includeHiddenElements: true }).props.style].flat())

it('reports met and not met in the accessibility label and announces changes politely', async () => {
  await render(<PasswordChecklist password="Abcdefg1" email="" firstName="" />)
  expect(group().props.accessibilityLiveRegion).toBe('polite')
  expect(group().props.accessibilityLabel).toContain('One lowercase letter, met')
  expect(group().props.accessibilityLabel).toContain('One special character, not met')
  expect(group().props.accessibilityLabel).toContain('Strength: Weak')
})

it('updates as the password is typed', async () => {
  const { rerender } = await render(<PasswordChecklist password="" email="" firstName="" />)
  expect(screen.getByTestId('password-checklist-label')).toHaveTextContent('Too weak')
  await rerender(<PasswordChecklist password="Tr0ub4dor&3xKq9!z" email="" firstName="" />)
  expect(screen.getByTestId('password-checklist-label')).toHaveTextContent('Strong')
  expect(group().props.accessibilityLabel).not.toContain('not met')
  for (const bar of [1, 2, 3, 4]) expect(flat(`password-checklist-bar-${bar}`).backgroundColor).toBe(color.obsidian)
})

it('fills only as many segments as the level and never uses red', async () => {
  await render(<PasswordChecklist password="Abcdefg1!" email="" firstName="" />)
  expect([1, 2, 3, 4].map((bar) => flat(`password-checklist-bar-${bar}`).backgroundColor)).toEqual([color.obsidian, color.obsidian, color.porcelain, color.porcelain])
})

it('lowers the strength when the password contains the email name or first name', async () => {
  await render(<PasswordChecklist password="Anabel9!kLm2#Rt5" email="anabel@example.com" firstName="Ana" />)
  expect(screen.getByTestId('password-checklist-label')).toHaveTextContent('Good')
})

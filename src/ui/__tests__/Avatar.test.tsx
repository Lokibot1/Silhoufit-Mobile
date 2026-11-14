import { fireEvent, render, screen } from '@testing-library/react-native'

import { Avatar, avatarColor, initials } from '../Avatar'
import { color } from '../theme'

const palette = [color.obsidian, color.graphite, color.red]

it('gives the same name the same colour, from the palette, and varies by name', async () => {
  expect(avatarColor('Ana Cruz')).toBe(avatarColor('Ana Cruz'))
  const names = ['Ana Cruz', 'Ben Lee', 'Cy Diaz', 'Dee Tan', 'Eli Ong', 'Fay Go']
  const colours = names.map(avatarColor)
  colours.forEach((c) => expect(palette).toContain(c))
  expect(new Set(colours).size).toBeGreaterThan(1)
})

it('extracts initials', async () => {
  expect(initials('ana', 'cruz')).toBe('AC')
  expect(initials('Ana', '')).toBe('A')
  expect(initials('', '')).toBe('')
  expect(initials('😀', '1')).toBe('')
})

it('shows initials without a photo', async () => {
  await render(<Avatar name="Ana Cruz" url={null} />)
  expect(screen.getByText('AC')).toBeTruthy()
  expect(screen.getByLabelText('Ana Cruz initials')).toBeTruthy()
})

it('shows one initial for a one-word name', async () => {
  await render(<Avatar name="Ana" url={null} />)
  expect(screen.getByText('A')).toBeTruthy()
})

it('shows the person icon for an empty or letterless name', async () => {
  const { unmount } = await render(<Avatar name="" url={null} />)
  expect(screen.getByLabelText(/profile$/)).toBeTruthy()
  expect(screen.queryByLabelText(/initials/)).toBeNull()
  await unmount()
  await render(<Avatar name="😀 123" url={null} />)
  expect(screen.getByLabelText('😀 123 profile')).toBeTruthy()
  expect(screen.queryByLabelText(/initials/)).toBeNull()
})

it('skips a leading emoji and never splits it', async () => {
  await render(<Avatar name="😀 Ana" url={null} />)
  expect(screen.getByText('A')).toBeTruthy()
})

it('labels the photo, then falls back to initials when it fails', async () => {
  await render(<Avatar name="Ana Cruz" url="https://x.test/a.png" />)
  await fireEvent(screen.getByLabelText('Profile photo of Ana Cruz'), 'error', { nativeEvent: {} })
  expect(screen.getByText('AC')).toBeTruthy()
})

it('tries the photo again when the url changes', async () => {
  const { rerender } = await render(<Avatar name="Ana Cruz" url="https://x.test/a.png" />)
  await fireEvent(screen.getByLabelText('Profile photo of Ana Cruz'), 'error', { nativeEvent: {} })
  expect(screen.queryByLabelText('Profile photo of Ana Cruz')).toBeNull()
  await rerender(<Avatar name="Ana Cruz" url="https://x.test/b.png" />)
  expect(screen.getByLabelText('Profile photo of Ana Cruz')).toBeTruthy()
})

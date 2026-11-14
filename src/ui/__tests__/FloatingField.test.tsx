import { fireEvent, render, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { StyleSheet } from 'react-native'

import { FloatingField } from '../FloatingField'
import { color } from '../theme'
import { useReduceMotion } from '../useReduceMotion'

jest.mock('../useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }))

function Harness(props: Partial<React.ComponentProps<typeof FloatingField>>) {
  const [value, setValue] = useState(props.value ?? '')
  return <FloatingField testID="f" label="Email" {...props} value={value} onChangeText={(t) => { setValue(t); props.onChangeText?.(t) }} />
}
const label = () => screen.getByTestId('f-label', { includeHiddenElements: true })
const scale = () => {
  const { transform } = StyleSheet.flatten(label().props.style)
  return transform.find((t: object) => 'scale' in t).scale as number
}

it('sits at rest, then floats and takes the active colour on focus', async () => {
  await render(<Harness />)
  expect(scale()).toBe(1)
  expect(StyleSheet.flatten(label().props.style).color).toBe(color.graphite)
  await fireEvent(screen.getByTestId('f'), 'focus')
  expect(StyleSheet.flatten(label().props.style).color).toBe(color.obsidian)
})

it('floats the label onto the border with the border patch behind it', async () => {
  await render(<Harness value="a" />)
  const style = StyleSheet.flatten(label().props.style)
  expect(style.transform.find((t: object) => 'translateY' in t).translateY).toBeLessThan(0)
  expect(style.backgroundColor).toBe(color.paper)
})

it('keeps the border patch while the label is at rest, so blur never exposes the border', async () => {
  await render(<Harness />)
  expect(StyleSheet.flatten(label().props.style).backgroundColor).toBe(color.paper)
})

it('passes focus and blur through to the caller', async () => {
  const onFocus = jest.fn()
  const onBlur = jest.fn()
  await render(<Harness onFocus={onFocus} onBlur={onBlur} />)
  await fireEvent(screen.getByTestId('f'), 'focus')
  await fireEvent(screen.getByTestId('f'), 'blur')
  expect(onFocus).toHaveBeenCalledTimes(1)
  expect(onBlur).toHaveBeenCalledTimes(1)
})

it('stays floated when it has a value', async () => {
  await render(<Harness value="a@b.co" />)
  expect(scale()).toBe(14 / 16)
})

it('snaps without animating when reduce motion is on', async () => {
  jest.mocked(useReduceMotion).mockReturnValue(true)
  await render(<Harness />)
  await fireEvent.changeText(screen.getByTestId('f'), 'x')
  expect(scale()).toBe(14 / 16)
  jest.mocked(useReduceMotion).mockReturnValue(false)
})

it('names the input by its label and passes text and maxLength through', async () => {
  const onChangeText = jest.fn()
  await render(<Harness maxLength={5} onChangeText={onChangeText} />)
  const input = screen.getByLabelText('Email')
  expect(input.props.maxLength).toBe(5)
  await fireEvent.changeText(input, 'abc')
  expect(onChangeText).toHaveBeenCalledWith('abc')
})

it('shows the error in red as a polite live region, announced once (no hint on the input)', async () => {
  await render(<Harness error="Email is required." />)
  const error = screen.getByText('Email is required.')
  expect(error.props.accessibilityLiveRegion).toBe('polite')
  expect(StyleSheet.flatten(error.props.style).color).toBe(color.red)
  expect(screen.getByLabelText('Email').props.accessibilityHint).toBeUndefined()
  expect(StyleSheet.flatten(label().props.style).color).toBe(color.red)
})

it('shows the helper when there is no error', async () => {
  await render(<Harness helper="Use your store email." />)
  expect(screen.getByText('Use your store email.')).toBeTruthy()
})

it('toggles the password between hidden and shown with a matching label', async () => {
  await render(<Harness secureTextEntry label="Password" toggleTestID="t" />)
  expect(screen.getByTestId('f').props.secureTextEntry).toBe(true)
  await fireEvent.press(screen.getByLabelText('Show password'))
  expect(screen.getByTestId('f').props.secureTextEntry).toBe(false)
  expect(screen.getByLabelText('Hide password')).toBeTruthy()
  expect(screen.getByTestId('t')).toBeTruthy()
})

it('is disabled when not editable', async () => {
  await render(<Harness editable={false} />)
  expect(screen.getByLabelText('Email').props.accessibilityState.disabled).toBe(true)
  expect(screen.getByTestId('f').props.editable).toBe(false)
})

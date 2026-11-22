// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {createElement} from 'react'
import {SessionAction} from '../session-action.tsx'
import {zh} from '../locales.ts'

afterEach(cleanup)

it('does no upload work until hover; a failed upload never opens a dialog', async () => {
  const readUpload = vi.fn(async () => 'failed' as const)
  render(createElement(SessionAction, {readUpload, t: (key: keyof typeof zh) => zh[key]} as never))
  expect(readUpload).not.toHaveBeenCalled()
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.mouseEnter(screen.getByRole('button', {name: 'Loop 上传状态'}))
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('上传失败'))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.mouseLeave(screen.getByRole('button', {name: 'Loop 上传状态'}).parentElement!)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('shows uploading in hover details and supports keyboard dismissal', async () => {
  render(createElement(SessionAction, {readUpload: async () => 'uploading', t: (key: keyof typeof zh) => zh[key]} as never))
  const button = screen.getByRole('button', {name: 'Loop 上传状态'})
  fireEvent.focus(button)
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('正在上传中'))
  fireEvent.keyDown(button, {key: 'Escape'})
  expect(screen.queryByRole('tooltip')).toBeNull()
})


it('clicking a focused upload status keeps its details open', async () => {
  render(createElement(SessionAction, {readUpload: async () => 'uploaded', t: (key: keyof typeof zh) => zh[key]} as never))
  const button = screen.getByRole('button', {name: 'Loop 上传状态'})
  fireEvent.focus(button)
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('已上传'))
})

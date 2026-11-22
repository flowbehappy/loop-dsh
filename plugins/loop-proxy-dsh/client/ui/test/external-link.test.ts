import assert from 'node:assert/strict'
import test from 'node:test'

import {
  externalUrlWithLocale,
  openExternal,
  openExternalInWindow,
} from '../external-link.ts'

test('Web still treats a blocked popup as failure', () => {
  assert.equal(openExternal('https://loop.example.test/login', {
    protocol: 'http:',
    open: () => null,
  }), false)
  assert.equal(openExternal('javascript:alert(1)', {
    protocol: 'http:',
    open: () => ({opener: {}}),
  }), false)
})

test('Desktop accepts the official shell external-browser handoff', () => {
  const opened: Array<[string, string]> = []
  assert.equal(openExternal('http://127.0.0.1:33392/oauth/authorize', {
    protocol: 'dsh-app:',
    open: (url, target) => {
      opened.push([url, target])
      return null
    },
  }), true)
  assert.deepEqual(opened, [['http://127.0.0.1:33392/oauth/authorize', '_blank']])
})

test('an opened Web popup has its opener cleared', () => {
  const popup = {opener: {}}
  assert.equal(openExternal('https://loop.example.test/login', {
    protocol: 'https:',
    open: () => popup,
  }), true)
  assert.equal(popup.opener, null)
})

test('navigates only a validated window opened during the original click', () => {
  const opened: string[] = []
  const target = {
    opener: {},
    location: {replace: (url: string) => { opened.push(url) }},
    close: () => {},
  }
  assert.equal(openExternalInWindow('https://loop.example.test/oauth', target), true)
  assert.equal(target.opener, null)
  assert.deepEqual(opened, ['https://loop.example.test/oauth'])
  assert.equal(openExternalInWindow('javascript:alert(1)', target), false)
  assert.deepEqual(opened, ['https://loop.example.test/oauth'])
})

test('carries locale on login fragments and ordinary Loop handoffs', () => {
  assert.equal(
    externalUrlWithLocale(
      'https://loop.example.test/external-host/page-login#next=%2Fw%2Fwsp_1',
      'zh-CN',
    ),
    'https://loop.example.test/external-host/page-login#next=%2Fw%2Fwsp_1&locale=zh-CN',
  )
  assert.equal(
    externalUrlWithLocale(
      'https://loop.example.test/oauth/authorize?client_id=client_1',
      'en',
    ),
    'https://loop.example.test/oauth/authorize?client_id=client_1&locale=en',
  )
  assert.equal(externalUrlWithLocale('javascript:alert(1)', 'en'), null)
  assert.equal(externalUrlWithLocale('https://user:secret@loop.example.test/', 'en'), null)
})

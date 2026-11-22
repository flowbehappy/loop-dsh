import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'

import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
  LOOP_LOGO_BLACK_DATA_URL,
  LOOP_LOGO_BLACK_SVG,
  LOOP_LOGO_WHITE_DATA_URL,
  LOOP_LOGO_WHITE_SVG,
  loopLogoDataURL,
} from '../loop-brand-assets.ts'
import {LoopBrandMark} from '../loop-brand.ts'

const blackSource = readFileSync(
  new URL('../assets/loop-logo-black.svg', import.meta.url),
  'utf8',
)
const whiteSource = readFileSync(
  new URL('../assets/loop-logo-white.svg', import.meta.url),
  'utf8',
)

test('bundle-safe Loop artwork matches the packaged SVG assets', () => {
  assert.equal(LOOP_LOGO_BLACK_SVG, blackSource.replaceAll('\r\n', '\n'))
  assert.equal(LOOP_LOGO_WHITE_SVG, whiteSource.replaceAll('\r\n', '\n'))
  assert.equal(loopLogoDataURL(false), LOOP_LOGO_BLACK_DATA_URL)
  assert.equal(loopLogoDataURL(true), LOOP_LOGO_WHITE_DATA_URL)
  assert.match(LOOP_LOGO_BLACK_DATA_URL, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.match(LOOP_LOGO_WHITE_DATA_URL, /^data:image\/svg\+xml;charset=utf-8,/)
})

test('LoopBrandMark honors host size and class with accessible brand text', () => {
  const html = renderToStaticMarkup(createElement(LoopBrandMark, {
    className: 'host-hero-mark',
    size: 34,
  }))

  assert.match(html, /alt="Loop"/)
  assert.match(html, /class="host-hero-mark"/)
  assert.match(html, /data-loop-brand-theme="light"/)
  assert.match(html, /height="34"/)
  assert.match(html, /width="34"/)
  assert.doesNotMatch(html, /<(?:a|button)\b/iu)
})

/** Loop artwork for plugin-owned UI, such as the Loop account dialog. */

import {createElement, useSyncExternalStore} from 'react'
import {loopLogoDataURL} from './loop-brand-assets.ts'

export interface LoopBrandMarkProps {
  size: number
  className?: string
}

const DARK_THEME_ATTRIBUTE = 'data-ds-dark-theme'

function isDarkTheme(): boolean {
  return typeof document !== 'undefined'
    && document.body?.hasAttribute(DARK_THEME_ATTRIBUTE) === true
}

function subscribeTheme(listener: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined'
    || document.body === null) {
    return () => {}
  }
  const observer = new MutationObserver(listener)
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [DARK_THEME_ATTRIBUTE],
  })
  return () => { observer.disconnect() }
}

/** Render the Loop mark within plugin-owned surfaces. */
export function LoopBrandMark({size, className}: LoopBrandMarkProps) {
  const darkTheme = useSyncExternalStore(subscribeTheme, isDarkTheme, () => false)
  return createElement('img', {
    alt: 'Loop',
    className,
    'data-loop-brand-mark': '',
    'data-loop-brand-theme': darkTheme ? 'dark' : 'light',
    draggable: false,
    height: size,
    src: loopLogoDataURL(darkTheme),
    style: {height: size, width: size},
    width: size,
  })
}

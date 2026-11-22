/** Native-shaped settings launcher, with Loop owning only the sign-in action. */

import {useEffect, useRef, useState, type ReactNode} from 'react'
import {
  IconEllipsisOutlineMedium,
  IconPaperPlaneOutlineMedium,
  IconSettingsOutlineMedium,
  IconUserOutlineMedium,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {InjectFace, PropsLocale, PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {NS} from './locales.ts'
import type {SettingsAccess} from './settings-access.ts'
import css from './loop-ui.module.css'

export interface LoopBottomMenuInjected {
  readonly signIn: () => void
  readonly contactUs: () => void
  readonly settingsAccess: SettingsAccess
}

export type LoopBottomMenuProps =
  PropsRuntime<'settings.launcher'>
  & PropsLocale<typeof NS>
  & InjectFace<LoopBottomMenuInjected>

/** Keep the host's three entries and public Menu keyboard/focus behavior. */
export function LoopBottomMenu({
  signIn,
  contactUs,
  wide,
  settingsOpen,
  settingsShortcut,
  openSettings,
  settingsAccess,
  t,
}: LoopBottomMenuProps): ReactNode {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    settingsAccess.setSettingsOpen(settingsOpen)
    if (settingsOpen) setOpen(false)
  }, [settingsAccess, settingsOpen])
  useEffect(() => {
    const unbind = settingsAccess.bind(openSettings)
    return () => {
      unbind()
      settingsAccess.setSettingsOpen(false)
    }
  }, [openSettings, settingsAccess])

  return <div className={css.launcherRoot}>
    <Menu
      open={open}
      side="top"
      portal
      autoFocus
      className={css.launcherAnchor}
      listClassName={css.launcherMenu}
      onClose={() => { setOpen(false) }}
      anchor={(
        <button
          ref={trigger}
          type="button"
          className={css.launcherTrigger}
          data-collapsed={!wide}
          aria-label={t('launcher.open')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconEllipsisOutlineMedium size={14} />
          {wide && <span className={css.launcherLabel}>{t('launcher.more')}</span>}
        </button>
      )}
      items={[
        {id: 'settings', label: t('launcher.settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : {shortcut: settingsShortcut})},
        {id: 'feedback', label: t('launcher.feedback'), icon: <IconPaperPlaneOutlineMedium size={16} />},
        {id: 'signin', label: t('launcher.signIn'), icon: <IconUserOutlineMedium size={16} />},
      ]}
      onSelect={id => {
        setOpen(false)
        if (id === 'settings') {
          trigger.current?.focus()
          openSettings()
        } else if (id === 'feedback') contactUs()
        else if (id === 'signin') signIn()
      }}
    />
  </div>
}

import {useEffect, useState} from 'react'
import type {InjectFace, PropsLocale, PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {LoopHostClient} from './types.ts'
import type {NS} from './locales.ts'

export interface LoopSettingsInjected { readonly remote: LoopHostClient }
type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & InjectFace<LoopSettingsInjected>

export function LoopSettings({remote, t}: Props) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void remote.getSyncPreferences({}, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (!result.ok) { setFailed(true); return }
      setEnabled(result.value.uploadDisconnectedHistory)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [remote])
  const save = async (value: boolean) => {
    setBusy(true)
    setFailed(false)
    try {
      const result = await remote.setSyncPreferences({uploadDisconnectedHistory: value})
      if (!result.ok) { setFailed(true); return }
      setEnabled(result.value.uploadDisconnectedHistory)
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <div>
    <label><input type="checkbox" checked={enabled} disabled={busy}
      onChange={event => { void save(event.target.checked) }} /> {t('settings.uploadDisconnectedHistory')}</label>
    <p>{t('settings.uploadDisconnectedHistoryHint')}</p>
    {failed && <p role="alert">{t('settings.uploadPreferencesError')}</p>}
  </div>
}

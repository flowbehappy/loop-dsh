/** Quiet upload receipt; opening it never starts authorization or an upload. */
import {useEffect, useId, useState, type ReactNode} from 'react'
import {Button} from '@deepseek-ai/dsh-client-ui-primitives'
import type {PropsLocale, PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {NS} from './locales.ts'
import css from './loop-ui.module.css'

export type UploadStatus = 'uploading' | 'uploaded' | 'failed' | 'off'
export interface SessionActionInjected {
  readonly readUpload: (signal: AbortSignal) => Promise<UploadStatus>
}
export type SessionActionProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS> & SessionActionInjected

export function SessionAction({readUpload, t}: SessionActionProps): ReactNode {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UploadStatus>('uploading')
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      let next: UploadStatus
      try { next = await readUpload(abort.signal) } catch { next = 'failed' }
      if (abort.signal.aborted) return
      setStatus(next)
      timer = setTimeout(() => { void refresh() }, 1500)
    }
    void refresh()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [open, readUpload])
  return (
    <span className={css.uploadEntry}
      onMouseEnter={() => { setOpen(true) }}
      onMouseLeave={() => { setOpen(false) }}
      onFocus={() => { setOpen(true) }}
      onBlur={() => { setOpen(false) }}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
      <Button size="sm" variant="toolbar" className={css.sessionAction as string}
        aria-describedby={open ? tooltipId : undefined} aria-label={t('upload.label')} onClick={() => { setOpen(true) }}>
        Loop
      </Button>
      {open && <span id={tooltipId} className={css.uploadDetails} role="tooltip">
        {t(`upload.${status}`)}
      </span>}
    </span>
  )
}

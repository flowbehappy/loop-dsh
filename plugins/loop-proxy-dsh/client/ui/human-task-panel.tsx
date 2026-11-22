import {useState} from 'react'
import {Button} from '@deepseek-ai/dsh-client-ui-primitives'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {PropsLocale, HostObservable, StandardSourceBinding} from '@deepseek-ai/dsh-client-ui-slots'
import type {HumanTaskFrame} from '../../remote.mjs'
import {openExternal} from './external-link.ts'
import type {NS} from './locales.ts'
import type {LoopHostClient} from './types.ts'
import css from './loop-ui.module.css'

type ActiveFrame = Exclude<HumanTaskFrame,{state:'idle'}>
export type PersonalTaskInteraction = {
  kind:'loop-personal-task'; key:string; sessionId:SessionId; frame:ActiveFrame
}
declare module '@deepseek-ai/dsh-client-ui-session/client' {
  interface SessionPendingInteractionMap { 'loop-personal-task':PersonalTaskInteraction }
}

// A composer takeover is mounted by DSH only for the Session owning this request.
// Its subscription lives outside the composer, so replacing the editor is safe.
export function watchHumanTask(
  selected:HostObservable<StandardSourceBinding>, remote:LoopHostClient,
  publish:(value:PersonalTaskInteraction, delegate:()=>Promise<void>)=>()=>void,
) {
  let session:string|undefined
  let stream:AbortController|undefined
  let remove:(()=>void)|undefined
  const clear = () => { const off=remove; remove=undefined; off?.() }
  const update = () => {
    const id=selected.getSnapshot().key as SessionId|undefined
    if (session === id) return
    session=id
    stream?.abort()
    clear()
    if (!id || !remote.humanTaskEvents) return
    const controller=new AbortController()
    stream=controller
    const events=remote.humanTaskEvents.bind(remote)
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          for await (const frame of events({sessionId:id},controller.signal)) {
            if (controller.signal.aborted) return
            clear()
            if (frame.state !== 'idle') {
              remove=publish({kind:'loop-personal-task',key:frame.requestId,sessionId:id,frame},async()=>{})
            }
          }
        } catch { /* A reconnect receives the current task snapshot. */ }
        if (!controller.signal.aborted) {
          clear()
          await new Promise(resolve=>setTimeout(resolve,2000))
        }
      }
    })()
  }
  const off=selected.subscribe(update)
  update()
  return () => {off();stream?.abort();clear()}
}

export function HumanTaskPanel({matched,remote,t}:PropsLocale<typeof NS> & {
  matched:PersonalTaskInteraction; remote:LoopHostClient
}) {
  const {sessionId,frame}=matched
  const [failure,setFailure]=useState('')
  const decide = async (decision:'reuse'|'cancel') => {
    try {
      const result = await remote.decideHumanTask?.({sessionId,requestId:frame.requestId,decision})
      if (!result?.ok) setFailure(frame.requestId)
    } catch { setFailure(frame.requestId) }
  }
  return <section className={css.taskConsent} aria-label={t('human.title')}>
    {frame.agentDenied && <p>{t('human.agentDenied')}</p>}
    <strong>{frame.summary}</strong>
    <p>{t('human.title')} · {frame.action}{frame.manage && ' · '+t('human.manage')}</p>
    <p>{frame.resources.length ? frame.resources.join(' · ') : t('human.all')}</p>
    <p>{frame.state === 'browser' ? t('human.reusable') : t('human.expires',{date:new Date(frame.expiresAt).toLocaleString()})}</p>
    <div>
      <Button variant="primary" onClick={() => {
        if (frame.state === 'reuse') void decide('reuse')
        else if (!openExternal(frame.loginUrl,{protocol:window.location.protocol,open:window.open.bind(window)})) setFailure(frame.requestId)
      }}>{t(frame.state === 'reuse' ? 'human.reuse' : 'human.open')}</Button>
      <Button onClick={() => {void decide('cancel')}}>{t('human.cancel')}</Button>
    </div>
    {failure === frame.requestId && <p role="alert">{t('human.failed')}</p>}
  </section>
}

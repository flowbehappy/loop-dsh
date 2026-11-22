import {afterEach, expect, it, vi} from 'vitest'
import {LoopProjectSyncController} from '../project-sync-controller.ts'
import type {LoopHostClient} from '../types.ts'

afterEach(() => vi.useRealTimers())

it('checks only an opened challenge, preserves it while waiting, and stops after authorization', async () => {
  vi.useFakeTimers()
  const ready = {state:'ready',projects:[],imported:1,updated:0,skipped:0}
  const waiting = {...ready,state:'needs_auth',challenge:{id:'agent',loginUrl:'https://loop.test/login',expiresAt:new Date(Date.now()+60000).toISOString()}}
  let allowed=false
  const syncProjects=vi.fn(async()=>({ok:true,value:allowed?ready:waiting}))
  const onAuthorized=vi.fn()
  const controller=new LoopProjectSyncController({remote:{syncProjects} as unknown as LoopHostClient,openExternal:()=>true,onAuthorized})
  controller.actions.connect()
  await vi.advanceTimersByTimeAsync(10000)
  expect(syncProjects).toHaveBeenCalledTimes(1)
  controller.actions.openChallenge()
  await vi.advanceTimersByTimeAsync(1500)
  expect(syncProjects).toHaveBeenCalledTimes(2)
  expect(controller.store.getSnapshot().challengeOpened).toBe(true)
  allowed=true
  await vi.advanceTimersByTimeAsync(1500)
  expect(onAuthorized).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(10000)
  expect(syncProjects).toHaveBeenCalledTimes(3)
  for (let n = 1; n <= 3; n++) expect(syncProjects).toHaveBeenNthCalledWith(n, {}, expect.any(AbortSignal))
  controller.dispose()
})

it('does not open a second authorization without a click and cancels checks on disposal', async () => {
  vi.useFakeTimers()
  let challengeID='agent'
  const openExternal=vi.fn(()=>true)
  const syncProjects=vi.fn(async()=>({ok:true,value:{state:'needs_auth',projects:[],challenge:{id:challengeID,loginUrl:'https://loop.test/'+challengeID,expiresAt:new Date(Date.now()+60000).toISOString()}}}))
  const controller=new LoopProjectSyncController({remote:{syncProjects} as unknown as LoopHostClient,openExternal})
  controller.actions.connect()
  await vi.advanceTimersByTimeAsync(0)
  controller.actions.openChallenge()
  challengeID='upload'
  await vi.advanceTimersByTimeAsync(1500)
  expect(controller.store.getSnapshot().challengeOpened).toBe(false)
  expect(controller.store.getSnapshot().challenge?.id).toBe('upload')
  await vi.advanceTimersByTimeAsync(10000)
  expect(syncProjects).toHaveBeenCalledTimes(2)
  expect(openExternal).toHaveBeenCalledOnce()
  controller.actions.openChallenge()
  controller.dispose()
  await vi.advanceTimersByTimeAsync(10000)
  expect(syncProjects).toHaveBeenCalledTimes(2)
})

it('stops checking when authorization expires', async () => {
  vi.useFakeTimers()
  const waiting={state:'needs_auth',projects:[],challenge:{id:'expired',loginUrl:'https://loop.test/login',expiresAt:new Date(Date.now()+3000).toISOString()}}
  const syncProjects=vi.fn(async()=>({ok:true,value:waiting}))
  const controller=new LoopProjectSyncController({remote:{syncProjects} as unknown as LoopHostClient,openExternal:()=>true})
  controller.actions.connect()
  await vi.advanceTimersByTimeAsync(0)
  controller.actions.openChallenge()
  await vi.advanceTimersByTimeAsync(60000)
  expect(controller.store.getSnapshot().challenge).toBeNull()
  expect(controller.store.getSnapshot().error?.code).toBe('loop-host/challenge-expired')
  expect(syncProjects).toHaveBeenCalledTimes(3)
  controller.dispose()
})

it('does not open an expired sign-in and lets the user restart it', async () => {
  vi.useFakeTimers()
  const openExternal=vi.fn(()=>true)
  const waiting={state:'needs_auth',projects:[],challenge:{id:'old',loginUrl:'https://loop.test/login',expiresAt:new Date(Date.now()+1000).toISOString()}}
  const syncProjects=vi.fn(async()=>({ok:true,value:waiting}))
  const projectSyncSettings=vi.fn(async()=>({ok:true,value:{state:'needs_auth',projects:[]}}))
  const controller=new LoopProjectSyncController({remote:{syncProjects,projectSyncSettings} as unknown as LoopHostClient,openExternal})
  controller.actions.connect()
  await vi.advanceTimersByTimeAsync(2000)
  controller.actions.openChallenge()
  expect(openExternal).not.toHaveBeenCalled()
  expect(controller.store.getSnapshot().challenge).toBeNull()
  controller.actions.open()
  await vi.advanceTimersByTimeAsync(0)
  expect(projectSyncSettings).toHaveBeenCalledOnce()
  controller.dispose()
})

it('finishes sign-out automatically after the opened confirmation and then stops polling', async () => {
  vi.useFakeTimers()
  let done=false
  const challenge={id:'disconnect',loginUrl:'https://loop.test/disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}
  const disconnectAccount=vi.fn(async()=>({ok:true,value:done?{state:'signed_out'}:{state:'needs_confirmation',challenge}}))
  const projectSyncSettings=vi.fn(async()=>({ok:true,value:{state:'needs_auth',projects:[],canDisconnect:false}}))
  const onDisconnected=vi.fn()
  const controller=new LoopProjectSyncController({remote:{disconnectAccount,projectSyncSettings} as unknown as LoopHostClient,openExternal:()=>true,onDisconnected})
  controller.actions.disconnect()
  await vi.advanceTimersByTimeAsync(0)
  expect(controller.store.getSnapshot().disconnecting).toBe(true)
  controller.actions.openChallenge()
  await vi.advanceTimersByTimeAsync(1500)
  done=true
  await vi.advanceTimersByTimeAsync(1500)
  expect(onDisconnected).toHaveBeenCalledOnce()
  expect(controller.store.getSnapshot().disconnecting).toBe(false)
  expect(controller.store.getSnapshot().challenge).toBeNull()
  await vi.advanceTimersByTimeAsync(10000)
  expect(disconnectAccount).toHaveBeenCalledTimes(3)
  controller.dispose()
})

it('requires opening the actual disconnect confirmation after recovery login, even with the same operation ID', async () => {
  vi.useFakeTimers()
  const challenge={id:'same-operation',loginUrl:'https://loop.test/login',expiresAt:new Date(Date.now()+60000).toISOString(),recoveryMode:'human_confirmed'}
  const disconnectAccount=vi.fn(async(input:unknown)=>({ok:true,value:{state:'needs_confirmation',challenge:disconnectAccount.mock.calls.length===1?challenge:{...challenge,loginUrl:'https://loop.test/external-host/disconnect#confirm'}}}))
  const openExternal=vi.fn(()=>true)
  const controller=new LoopProjectSyncController({remote:{disconnectAccount} as unknown as LoopHostClient,openExternal})
  controller.actions.disconnect()
  await vi.advanceTimersByTimeAsync(0)
  controller.actions.openChallenge()
  await vi.advanceTimersByTimeAsync(1500)
  expect(disconnectAccount.mock.calls[1][0]).toEqual({recoveryMode:'human_confirmed'})
  expect(controller.store.getSnapshot().challengeOpened).toBe(false)
  await vi.advanceTimersByTimeAsync(10000)
  expect(disconnectAccount).toHaveBeenCalledTimes(2)
  expect(openExternal).toHaveBeenCalledOnce()
  controller.dispose()
})

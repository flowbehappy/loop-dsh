import test from 'node:test'
import assert from 'node:assert/strict'
import {LoopKnowledgeRuntime, decodeKnowledgeReference} from '../loop-knowledge-runtime.ts'
import type {LoopHostClient, SkillCatalogEventFrame} from '../types.ts'
import type {InputTriggerSource, InputTriggerServiceContract, ClientSessionContext, CandidateRequest} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

test('knowledge menu uses shared invalidation lazily and preserves already returned rows and selections', async () => {
  let rows = [{kbId:'kb_a',name:'Alpha'}, {kbId:'kb_b',name:'Beta'}]
  let reads = 0
  let push: ((frame: SkillCatalogEventFrame) => void) | undefined
  const options = {
    remote:{knowledgeCatalog:async () => { reads++; return {ok:true, value:{scope:{sessionId:'s',hostWorkspaceId:'w',workspaceId:'loop',serverBaseUrl:'https://loop.test',accountId:'a',installationId:'i'},data:{items:rows,hasMore:false}}} }} as unknown as LoopHostClient,
    workspaceForSession:() => ({workspaceId:'w',path:'/tmp/qa',displayTitle:'QA'}),
    catalogEvents: async function* (_id: string, signal: AbortSignal) {
      while (!signal.aborted) {
        const frame = await new Promise<SkillCatalogEventFrame | undefined>(resolve => {
          push = resolve
          signal.addEventListener('abort',() => resolve(undefined),{once:true})
        })
        if (frame) yield frame
      }
    },
    failureText:'Unavailable',showFailure:() => { throw new Error('unexpected error') },
  }
  const runtime = new LoopKnowledgeRuntime(options)
  let source: InputTriggerSource | undefined
  runtime.registerSource({registerSource(value:InputTriggerSource) { source=value; return () => {} }} as InputTriggerServiceContract,'Knowledge')
  const session = {sessionId:'s'} as ClientSessionContext
  const request = {query:'',position:'leading',drilled:false,signal:new AbortController().signal} as CandidateRequest
  const opened = await source!.candidates(session,request)
  assert.equal(reads,1)
  assert.equal(opened.length,2)
  for (const query of ['l', 'lo', 'loo', 'LOO', 'Loop', 'loop']) {
    const matches = await source!.candidates(session, {...request, query})
    assert.equal(matches.length, 2, `/${query} matches the Loop display prefix`)
  }
  assert.equal((await source!.candidates(session, {...request, query:'ALPHA'})).length, 1)
  assert.equal((await source!.candidates(session, {...request, query:'loop:Alpha'})).length, 1)
  assert.equal((await source!.candidates(session, {...request, query:'unrelated'})).length, 0)
  assert.equal(reads, 1)
  rows=[{kbId:'kb_c',name:'Gamma'}]
  push!({type:'change',event:{kind:'catalog.changed',eventId:'e1',sessionId:'s'}} as SkillCatalogEventFrame)
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(reads,1)
  assert.equal(opened[0]!.label,'Loop · Alpha')
  const selection = decodeKnowledgeReference(opened[0]!.value as string)
  assert.equal(selection.kbId,'kb_a')
  const next = await source!.candidates(session,{...request,query:'Gamma'})
  assert.equal(reads,2)
  assert.equal(next.length,1)
  assert.equal(next[0]!.label,'Loop · Gamma')
  runtime.dispose()
  const reopened = new LoopKnowledgeRuntime(options)
  reopened.registerSource({registerSource(value:InputTriggerSource) { source=value; return () => {} }} as InputTriggerServiceContract,'Knowledge')
  const serialized = await source!.codec!.serialize(opened[0]!.value!, request.signal)
  assert.equal(decodeKnowledgeReference(serialized).kbId, 'kb_a')
  assert.equal(reads, 2)
  reopened.dispose()
})

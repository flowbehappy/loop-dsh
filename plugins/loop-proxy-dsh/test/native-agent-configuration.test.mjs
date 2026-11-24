import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {HumanConnectionService} from '../backend/human.ts'

const base=process.env.LOOP_TS_E2E_BASE_URL
test('real Loop discovers Agent configuration and enforces exact creation grants',{skip:!base,timeout:120_000},async t=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'isolated Test Hub required')
  const root=await mkdtemp(tmpdir()+'/loop-agent-options-')
  const ctx=new Context()
  await ctx.plugin(LocalCredentialProvider,{dshHome:root,watch:false})
  let token='',lost=false,invocations=0
  const service=new HumanConnectionService({provider:ctx.get('credentials'),server:base,installation:randomUUID(),fetch:async(url,init)=>{
    const response=await fetch(url,init)
    if(String(url).endsWith('/actions/agent.create-direct/invocations')){
      invocations++
      if(lost){lost=false;assert.ok(response.ok);await response.body?.cancel();throw new Error('isolated lost response')}
    }
    return response
  }})
  t.after(async()=>{await service.dispose();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
  async function api(method,path,body){
    const response=await fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'})
    assert.ok(response.ok,`${method} ${path.split('?')[0]} returned ${response.status}`)
    return response.status===204?undefined:response.json()
  }
  const account=await api('POST','/api/v1/auth/register',{name:'options_'+randomUUID().slice(0,8),email:randomUUID()+'@example.com',password:'Isolated-Only-7!'+randomUUID()})
  token=account.accessToken
  if(!account.user.emailVerified){
    const mail=await api('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(account.user.email))
    await api('POST','/api/v1/auth/verify-email',{token:mail.token})
  }
  const workspace=(await api('GET','/api/v1/workspaces'))[0].id
  const path='/api/v1/workspaces/'+workspace
  const first=(await api('POST',path+'/machines',{name:'iMac'})).machine
  const second=(await api('POST',path+'/machines',{name:'iMac'})).machine
  const profile=async(wireApi)=> (await api('POST','/api/v1/me/model-profiles',{
    displayName:'Isolated model '+wireApi,model:'glm-isolated',models:['glm-isolated'],baseUrl:'https://model.example.test/v1',
    apiKey:'isolated-only-secret',headers:{'X-Fixture':'isolated-private-header'},wireApi,verifiedWireApis:[wireApi],
  }))[0]
  const compatible=await profile('responses'),incompatible=await profile('anthropic')
  const owner={accountPrincipal:account.user.id,workspaceId:workspace,verify:async()=>assert.equal((await api('GET','/api/v1/me')).id,account.user.id)}
  const signal=AbortSignal.timeout(110_000)
  async function grant(allowedActions,resourceConstraints=[]){
    const pending=await service.begin(owner,'business',{allowedActions,resourceConstraints,manage:true},signal)
    const login=new URL(pending.challenge.loginUrl),q=login.searchParams
    const consent=await api('POST',login.pathname,{
      responseType:q.get('response_type'),clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),workspaceId:workspace,
      resource:q.get('resource'),state:q.get('state'),scope:q.get('scope'),codeChallenge:q.get('code_challenge'),
      codeChallengeMethod:q.get('code_challenge_method'),deviceLabel:q.get('device_label'),allowedActions,resourceConstraints,
    })
    const redirect=new URL(consent.redirectTo)
    assert.equal(redirect.origin+redirect.pathname,q.get('redirect_uri'))
    assert.equal((await fetch(redirect,{redirect:'error'})).status,200)
    for(let i=0;i<100;i++){
      if((await service.complete(owner,'business',pending.challenge.id,signal)).state==='connected')return
      await delay(25)
    }
    assert.fail('Human OAuth did not complete')
  }
  const action=(name,args)=>service.action(owner,'business','humanAction',{name,arguments:args,requireReadOnly:false},signal)
  await grant(['agent.options'])
  const schema=await service.action(owner,'business','humanSchema',{name:'agent.options'},signal)
  assert.equal(schema.readOnly,true)
  async function options(kind){
    const items=[],seen=new Set()
    let cursor
    do{
      const result=await action('agent.options',{kind,limit:1,...(cursor?{cursor}:{})})
      assert.ok(!/isolated-only-secret|isolated-private-header|baseUrl|apiKey/u.test(JSON.stringify(result)))
      const page=result.data.data
      items.push(...page.items)
      if(!page.hasMore)return items
      assert.ok(page.nextCursor&&!seen.has(page.nextCursor))
      cursor=page.nextCursor;seen.add(cursor)
    }while(seen.size<50)
    assert.fail('options pagination did not terminate')
  }
  const runners=await options('runners'),models=await options('models')
  assert.deepEqual(runners.map(r=>r.runnerId).sort(),[first.id,second.id].sort())
  assert.ok(runners.every(r=>r.name==='iMac'&&r.status!=='online'))
  const selected=models.find(m=>m.modelProfileId===compatible.id)
  assert.ok(selected)
  assert.equal(selected.model,'glm-isolated')
  assert.deepEqual(selected.wireAPIs,['responses'])
  await assert.rejects(action('agent.create-direct',{name:'Denied',runnerId:first.id,runtime:'codex'}))
  await service.disconnect(owner,'business',signal)
  await grant(['agent.create-direct'],['agent-runner:'+first.id,'model-profile:'+compatible.id,'model-profile:'+incompatible.id])
  const create=name=>action('agent.create-direct',{name,runnerId:first.id,runtime:'codex',modelProfileId:selected.modelProfileId})
  const created=[]
  for(const name of ['Researcher','Writer']){
    const receipt=(await create(name)).data.data
    assert.equal(receipt.status,'created')
    created.push(receipt.agentId)
    const detail=await api('GET',path+'/agents/'+receipt.agentId)
    const agent=detail.agent??detail
    assert.equal(agent.runtime,'codex')
    assert.equal(agent.modelProfileId,compatible.id)
    assert.equal(agent.model,'glm-isolated')
  }
  await assert.rejects(action('agent.create-direct',{name:'Wrong runner',runnerId:second.id,runtime:'codex',modelProfileId:compatible.id}),e=>e.status===403)
  await assert.rejects(action('agent.create-direct',{name:'Wrong profile',runnerId:first.id,runtime:'codex',modelProfileId:'ump_ungranted'}),e=>e.status===403)
  await assert.rejects(action('agent.create-direct',{name:'Incompatible',runnerId:first.id,runtime:'codex',modelProfileId:incompatible.id}))
  const before=invocations
  lost=true
  await assert.rejects(create('Uncertain receipt'),e=>e.outcomeUnknown===true)
  assert.equal(invocations,before+1,'writes must not be replayed after a lost response')
  const listed=await api('GET',path+'/agents')
  const agents=listed.agents??listed
  assert.equal(agents.filter(a=>a.displayName==='Uncertain receipt').length,1)
  assert.ok(!agents.some(a=>['Denied','Wrong runner','Wrong profile','Incompatible'].includes(a.displayName)))
  await service.disconnect(owner,'business',signal)
  await assert.rejects(create('After revoke'))
  await grant(['agent.update-direct'],['agent:'+created[0],'model-profile:'+compatible.id])
  assert.equal((await action('agent.update-direct',{agentId:created[0],modelProfileId:compatible.id})).data.data.status,'updated')
  await assert.rejects(action('agent.update-direct',{agentId:created[1],modelProfileId:compatible.id}),e=>e.status===403)
  await service.disconnect(owner,'business',signal)
})

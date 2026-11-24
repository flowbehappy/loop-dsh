// Run every catalog group and retain each first attempt, even after a failure.
import {readFile,mkdir,writeFile,open} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {join,resolve} from 'node:path'
import {randomUUID} from 'node:crypto'

for (const key of ['LOOP_TS_E2E_BASE_URL','LOOP_TS_E2E_DSH_BIN','LOOP_TEST_MODEL_FILE','LOOP_TEST_EVIDENCE_DIR']) {
  if (!process.env[key]) throw new Error('Missing explicit test setting: '+key)
}
const root=fileURLToPath(new URL('../../../',import.meta.url))
const catalog=JSON.parse(await readFile(join(root,'docs/testing/super-agent-scenarios.json'),'utf8'))
const directory=join(resolve(process.env.LOOP_TEST_EVIDENCE_DIR),'live-'+Date.now()+'-'+randomUUID().slice(0,8))
await mkdir(directory,{recursive:true,mode:0o700})
const results=[]
for (const {id} of catalog.realModel.groups) {
  const log=await open(join(directory,id+'.log'),'wx',0o600)
  const child=spawn(process.execPath,['--test','--test-name-pattern=browser','plugins/loop-proxy-dsh/test/native-dsh-runtime.test.mjs'],{
    cwd:root,env:{...process.env,LOOP_TS_E2E_INSTALL_PACKAGE:'1',LOOP_TS_E2E_LIVE_BUSINESS:'1',LOOP_TEST_EVIDENCE_DIR:directory,AUDIT_GROUP:id},
    stdio:['ignore',log.fd,log.fd],
  })
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code))})
  await log.close()
  let evidence
  try { evidence=JSON.parse(await readFile(join(directory,'release-'+id+'.json'),'utf8')) } catch { /* Missing evidence is a failure. */ }
  const cases=evidence?.cases?.map(({id,ok,error})=>({id,status:ok?'pass':'fail',error}))??[]
  const status=exitCode===0&&cases.length>0&&cases.every(c=>c.status==='pass')?'pass':'fail'
  results.push({id,status,exitCode,cases,log:id+'.log'})
  await writeFile(join(directory,'results.json'),JSON.stringify(results,null,2),{mode:0o600})
  console.log(id+': '+status)
}
console.log('Evidence: '+directory)
if(results.some(r=>r.status!=='pass'))process.exitCode=1

import {acquireLock,DurableJSON} from '../../backend/storage.ts'
import {integer} from '../../backend/codec.ts'
const [mode,path]=process.argv.slice(2)
if(mode==='hold') {
  const release=await acquireLock(path)
  process.stdout.write('locked\n')
  process.stdin.resume()
  process.stdin.on('end',async()=>{await release();process.exit(0)})
} else if(mode==='increment') {
  const store=new DurableJSON(path)
  for(let i=0;i<20;i++) await store.transaction(async(current,save)=>save({count:integer(current?.count??0)+1n}))
} else if(mode==='try') {
  try { const release=await acquireLock(path,AbortSignal.timeout(80));await release();process.stdout.write('acquired\n') }
  catch(error) { if(error.code!=='loop-host/cancelled')throw error;process.stdout.write('blocked\n') }
}

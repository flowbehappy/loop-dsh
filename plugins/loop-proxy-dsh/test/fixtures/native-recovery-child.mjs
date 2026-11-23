import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {HostCredentialStore} from '../../backend/credentials.ts'
import {beginHostLogin} from '../../backend/oauth.ts'
const [root,base]=process.argv.slice(2),ctx=new Context()
let login
try{
  await ctx.plugin(LocalCredentialProvider,{dshHome:root,watch:false})
  const provider=ctx.get('credentials'),store=new HostCredentialStore(provider,base,'workspace','installation')
  login=await beginHostLogin({provider,server:base,installation:'installation',pageOrigin:'http://127.0.0.1:4333',recovery:await store.read()})
  process.send({state:'ready'})
  await login.result
  process.send({state:'recovered'})
}catch(error){process.send({state:'rejected',code:error.code})}
finally{login?.cancel();await ctx.fiber.dispose();process.disconnect()}

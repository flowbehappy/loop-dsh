import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {HostCredentialStore} from '../../backend/credentials.ts'
import {TokenManager} from '../../backend/http.ts'
const [home, base] = process.argv.slice(2)
const ctx = new Context()
try {
  await ctx.plugin(LocalCredentialProvider, {dshHome: home, watch: false})
  const store = new HostCredentialStore(ctx.get('credentials'), base, 'workspace', 'installation')
  const credential = await store.read()
  const result = await new TokenManager(store, credential).credential()
  if (result.refresh_state || result.access_token !== 'access-rotated') throw new Error('unexpected test credential')
  process.stdout.write('ok\n')
} finally { await ctx.fiber.dispose() }

import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'

import {LOOP_LAUNCHER_PRIORITY} from '../loop-launcher.ts'
import {LOOP_MODULES} from '../loop-navigation.ts'

const clientEntry = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../loop-navigation.ts', import.meta.url), 'utf8')
const panels = readFileSync(new URL('../loop-panels.tsx', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../loop-bottom-menu.tsx', import.meta.url), 'utf8')
const onboarding = readFileSync(new URL('../loop-onboarding.tsx', import.meta.url), 'utf8')
const packageJSON = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as {dsh?: {client?: {inject?: string[]}}}

test('Loop shadows the published host launcher at a deterministic lower priority', () => {
  assert.equal(LOOP_LAUNCHER_PRIORITY, -1000)
  assert.match(
    clientEntry,
    /slots\.inject\('settings\.launcher'[\s\S]*name: 'settings\.launcher'[\s\S]*priority: LOOP_LAUNCHER_PRIORITY/u,
  )
  assert.doesNotMatch(clientEntry, /settings-account|AccountMenu/u)
  assert.match(menu, /settingsShortcut/u)
  assert.doesNotMatch(clientEntry, /slots\.inject\('settings\.models\.sign-in'/u)
  assert.match(clientEntry, /settings\.onboarding[\s\S]*id: LOOP_ONBOARDING_ID[\s\S]*priority: LOOP_ONBOARDING_PRIORITY/u)
  assert.match(clientEntry, /settings\.onboarding[\s\S]*id: 'welcome-notice'/u)
  assert.match(clientEntry, /settings\.section[\s\S]*id: LOOP_SETTINGS_ID[\s\S]*priority: LOOP_LAUNCHER_PRIORITY/u)
  assert.match(clientEntry, /locale\.register\(NS, 'zh-TW', zhTW\)/u)
  assert.match(clientEntry, /locale\.register\(NS, 'ja', ja\)/u)
})

test('the native sidebar keeps Tasks and exposes other Loop modules through More', () => {
  assert.equal(LOOP_MODULES.find(module => module.id === 'loop-inbox')?.placement, 'more')
  assert.deepEqual(
    LOOP_MODULES
      .filter(module => module.placement === 'sidebar')
      .map(module => module.id),
    ['loop-tasks'],
  )
  assert.match(
    clientEntry,
    /slots\.inject\('sidebar\.panellist\.actions'[\s\S]*name: 'sidebar\.panellist\.actions'[\s\S]*LoopMoreMenu/u,
  )
  assert.match(panels, /module\.placement === 'more'/u)
  assert.match(panels, /onDismiss\(\)[\s\S]*openModule\(module\.id\)/u)
  assert.match(clientEntry, /inject: \(\): LoopMoreMenuInjected => \(\{openModule: selectLoopModule\}\)/u)
})

test('the bottom menu keeps settings, feedback and Loop sign-in only', () => {
  assert.doesNotMatch(menu, /module\.tasks|module\.capabilities|module\.contacts|module\.workflows/u)
  assert.match(menu, /launcher\.feedback/u)
  assert.match(menu, /launcher\.signIn/u)
  assert.doesNotMatch(menu, /useModels|useProjectSync|useGlobalPage/u)
  assert.match(menu, /launcher\.settings/u)
})

test('the Loop bottom menu leaves account and model state to their existing owners', () => {
  assert.doesNotMatch(menu, /openOnboarding/u)
  assert.doesNotMatch(menu, /dshSign|dshAccount|accountActions|useAccount/u)
  assert.match(menu, /launcher\.settings/u)
  assert.match(onboarding, /openLoopModule/u)
  assert.doesNotMatch(onboarding, /onboarding\.authorizeModels/u)
  assert.doesNotMatch(onboarding, /modelActions\.authorize/u)
  assert.doesNotMatch(onboarding, /<Modal|<Button/u)
  assert.doesNotMatch(onboarding, /rootInert/u)

})

test('Desktop and account use same-cell lower-priority ownership with no Session prerequisite', () => {
  assert.match(
    clientEntry,
    /id: LOOP_DESKTOP_ONBOARDING_ID[\s\S]*priority: LOOP_DESKTOP_ONBOARDING_PRIORITY/u,
  )
  assert.match(navigation, /LOOP_SETTINGS_ID = 'account'/u)
  assert.doesNotMatch(
    clientEntry,
    /connectLoopFromOnboarding|uiSession\.adapter\.current\.getSnapshot\(\)\.key/u,
  )
  assert.doesNotMatch(onboarding, /LoopPageFrame|attachWorkspacePage/u)
  assert.match(onboarding, /openLoopModule/u)
  assert.match(onboarding, /signed_in/u)
  assert.match(clientEntry, /AccountConnectionController/u)
})

test('the client composition uses the public model onboarding child while not loading supplier account UI', () => {
  const inject = packageJSON.dsh?.client?.inject ?? []
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-settings-models'))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-session'))
  assert.equal(inject.includes('@deepseek-ai/dsh-api-account-controller'), false)
  assert.equal(inject.includes('@deepseek-ai/dsh-client-ui-settings-account'), false)
  assert.doesNotMatch(clientEntry, /DshAccountRuntime|AccountView|AccountMenu/u)
})

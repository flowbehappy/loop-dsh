import test from 'node:test'
import assert from 'node:assert/strict'
import { en, zh, zhTW, ja } from '../locales.ts'

test('every registered Loop dictionary exposes the same complete key set', () => {
  const keys = Object.keys(en).sort()
  assert.deepEqual(Object.keys(zh).sort(), keys)
  assert.deepEqual(Object.keys(zhTW).sort(), keys)
  assert.deepEqual(Object.keys(ja).sort(), keys)
})

test('Project removal explains its limited scope and last-project disconnect', () => {
  assert.equal(en['menu.unbind'], 'Unlink project')
  assert.equal(en['dialog.unbindProject'], 'Unlink project')
  assert.equal(en['dialog.confirmUnbind'], 'Unlink project')
  assert.equal(zh['menu.unbind'], '取消项目关联')
  assert.equal(zh['dialog.unbindProject'], '取消项目关联')
  assert.equal(zh['dialog.confirmUnbind'], '取消项目关联')

  const confirmation = [
    en['dialog.unbindTitle'],
    en['dialog.unbindBody'],
    zh['dialog.unbindTitle'],
    zh['dialog.unbindBody'],
  ].join(' ')
  assert.doesNotMatch(confirmation, /until they end|keep their current target|直到结束|保留当前目标/u)
  assert.match(en['dialog.unbindBody'], /Other project connections stay connected/u)
  assert.match(zh['dialog.unbindBody'], /其他项目连接不受影响/u)
  assert.match(en['dialog.unbindBody'], /existing chats will immediately stop Loop actions and syncing/u)
  assert.match(zh['dialog.unbindBody'], /已有会话会立即停止 Loop 操作和同步/u)
  assert.match(en['dialog.unbindBody'], /If this is the last project[\s\S]*models, sync, and remote access/u)
  assert.match(zh['dialog.unbindBody'], /若这是最后一个项目[\s\S]*模型、同步和远程访问/u)
  assert.match(en['dialog.unbindBody'], /chats and Loop content will remain/u)
})

test('global page exposes concise reconnect and retry copy', () => {
  assert.equal(en['global.reconnect'], 'Reconnect Loop')
  assert.equal(zh['global.reconnect'], '重新连接 Loop')
  assert.equal(en['global.retry'], 'Retry')
  assert.equal(zh['global.retry'], '重试')
})

test('Loop projects entry and binding-open copy are complete in both locales', () => {
  assert.equal(en['module.projects'], 'Projects')
  assert.equal(zh['module.projects'], '项目')
  assert.equal(en['menu.openProject'], 'Open Loop project')
  assert.equal(zh['menu.openProject'], '打开 Loop 项目')
  assert.equal(en['dialog.currentBindingTitle'], 'Current project')
  assert.equal(zh['dialog.currentBindingTitle'], '当前项目')
  assert.equal(en['dialog.chooseAnotherProject'], 'Choose another project')
  assert.equal(zh['dialog.chooseAnotherProject'], '选择其他项目')
  assert.equal(en['dialog.viewLoop'], 'Open Loop project')
  assert.equal(zh['dialog.viewLoop'], '打开 Loop 项目')
})

test('global server settings copy is complete in both locales', () => {
  assert.equal(en['settings.serverTitle'], 'Loop server')
  assert.equal(zh['settings.serverTitle'], 'Loop 服务器')
  assert.equal(en['global.serverLabel'], 'Server address')
  assert.equal(zh['global.serverLabel'], '服务器地址')
  assert.equal(en['global.serverSave'], 'Save and connect')
  assert.equal(zh['global.serverSave'], '保存并连接')
  assert.equal(en['dialog.chooseLoopWorkspace'], 'Choose Loop workspace')
  assert.equal(zh['dialog.chooseLoopWorkspace'], '选择 Loop 工作区')
  assert.match(en['error.workspaceRequired'], /Open a Loop module/u)
  assert.match(zh['error.workspaceRequired'], /打开任一 Loop 模块/u)
  assert.match(en['global.workspaceError'], /Choose it again/u)
  assert.match(zh['global.workspaceError'], /重新选择/u)
})

test('translations preserve interpolation parameters and have nonempty copy', () => {
  const parameters = (value: string) => [...value.matchAll(/\{([a-zA-Z]+)\}/gu)].map(match => match[1]).sort()
  for (const [key, value] of Object.entries(en)) {
    for (const dictionary of [zh, zhTW, ja]) {
      const translated = dictionary[key as keyof typeof en]
      assert.ok(translated.trim(), key)
      assert.deepEqual(parameters(translated), parameters(value), key)
    }
  }
})

test('share confirmation continues the original message instead of asking for a resend', () => {
  assert.equal(en['collab.dialog.shareConfirm'], 'Confirm scope and send')
  assert.equal(zh['collab.dialog.shareConfirm'], '确认范围并发送')
  assert.match(en['collab.notice.shareConfirmed'], /original message will continue/u)
  assert.match(zh['collab.notice.shareConfirmed'], /原消息将继续发送/u)
  assert.doesNotMatch(en['collab.dialog.shareConfirm'], /again/u)
  assert.doesNotMatch(zh['collab.dialog.shareConfirm'], /重新|再次/u)
})

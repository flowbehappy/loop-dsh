import test from 'node:test'
import assert from 'node:assert/strict'
import {loopReferenceDisplayRule} from '../loop-reference-display.ts'
import {encodeLoopSkillReference, referenceForLoopSkill} from '../loop-skill-reference.ts'
import {serializeCollaborationReference} from '../collaboration-reference.ts'

const skill = encodeLoopSkillReference(referenceForLoopSkill('session-1', {
  skillId: 'skill-1', name: '协作检查', libraryName: '团队技能',
  path: 'review/SKILL.md', versionId: 'version-1', sourceRevision: 'revision-1',
}))
const agent = serializeCollaborationReference({
  version: 1, sessionId: 'session-1', targetId: 'agent-1', targetType: 'agent',
  stableRef: 'agent:1', displayName: '审阅 & <检查>', bindingRevision: 'revision-1',
})
const context = {read() { throw new Error('Display must not read account state') }}

test('sent skill and agent references display readable names while retaining exact wire text', () => {
  const text = `开始 ${skill} 然后 ${agent} 完成`
  const first = loopReferenceDisplayRule.match(text, 0, context)
  assert.ok(first?.id === 'text')
  assert.equal(first.data.display, 'Loop · 协作检查')
  assert.equal(first.data.text, skill)
  assert.equal(text.slice(first.start, first.end), skill)
  const second = loopReferenceDisplayRule.match(text, first.end, context)
  assert.ok(second?.id === 'text')
  assert.equal(second.data.display, '@审阅 & <检查>')
  assert.equal(second.data.text, agent)
  assert.equal(loopReferenceDisplayRule.match(text, second.end, context), undefined)
})

test('a current directory mention displays only the selected name', () => {
  const wire = agent.replace('">', '" directory="dsh-current">')
  const node = loopReferenceDisplayRule.match(wire, 0, context)
  assert.equal(node?.data.display, '@审阅 & <检查>')
  assert.equal(node?.data.text, wire)
})

test('malformed references remain visible and do not prevent a later valid match', () => {
  const invalid = '<loop-skill-ref>not-json</loop-skill-ref>'
  const text = `${invalid} ${skill}`
  const node = loopReferenceDisplayRule.match(text, 0, context)
  assert.equal(node?.start, invalid.length + 1)
  assert.equal(loopReferenceDisplayRule.match(invalid, 0, context), undefined)
  assert.equal(loopReferenceDisplayRule.match('普通消息 /Loop @名字', 0, context), undefined)
})

test('matching from within a reference never replaces an incomplete source span', () => {
  assert.equal(loopReferenceDisplayRule.match(skill, 1, context), undefined)
  const oversized = `<loop-skill-ref>${'a'.repeat(21846)}</loop-skill-ref>`
  assert.equal(loopReferenceDisplayRule.match(oversized, 0, context), undefined)
})

test('knowledge references display the library name and preserve permission-scoped wire text', () => {
  const reference = '<loop-knowledge-ref>' + Buffer.from(JSON.stringify({version: 1, sessionId: 'session-1', kbId: 'kb-1', name: '订单 & <资料>'})).toString('base64url') + '</loop-knowledge-ref>'
  const node = loopReferenceDisplayRule.match(reference, 0, context)
  assert.ok(node?.id === 'text')
  assert.equal(node.data.display, 'Loop · 订单 & <资料>')
  assert.equal(node.data.text, reference)
  assert.equal(node.end, reference.length)
  const invalid = '<loop-knowledge-ref>not-json</loop-knowledge-ref>'
  assert.equal(loopReferenceDisplayRule.match(invalid, 0, context), undefined)
  assert.equal(loopReferenceDisplayRule.match(invalid + reference, 0, context)?.start, invalid.length)
  assert.equal(loopReferenceDisplayRule.match(reference, 1, context), undefined)
})

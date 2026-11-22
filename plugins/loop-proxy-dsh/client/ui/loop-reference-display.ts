/** Display Loop references without changing their durable or model-facing text. */
import type {UserTextRule} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {decodeKnowledgeReference} from './loop-knowledge-runtime.ts'
import {decodeLoopSkillReference} from './loop-skill-reference.ts'

export const loopReferenceDisplayRule: UserTextRule<'loop.reference-display'> = {
  id: 'loop.reference-display',
  order: 20,
  match(text, from) {
    const references = /<loop-knowledge-ref>[A-Za-z0-9_-]{1,8192}<\/loop-knowledge-ref>|<loop-skill-ref>[A-Za-z0-9_-]{1,21845}<\/loop-skill-ref>|<loop-collaboration type="(?:agent|human)" target="[^"<>]{1,1200}" ref="[^"<>]{1,3072}"(?: directory="[A-Za-z0-9_.:-]{1,200}")?>([^<]{1,1530})<\/loop-collaboration>/gu
    references.lastIndex = from
    for (let match = references.exec(text); match !== null; match = references.exec(text)) {
      let knowledgeName: string | undefined
      if (match[0].startsWith('<loop-knowledge-ref>')) {
        try { knowledgeName = `Loop · ${decodeKnowledgeReference(match[0]).name}` } catch { continue }
      }
      const display = knowledgeName ?? (match[1] === undefined
        ? decodeLoopSkillReference(match[0])?.displayName
        : '@' + match[1].replace(/&(amp|quot|lt|gt);/gu, entity =>
          ({'&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>'})[entity]!))
      if (display === undefined) continue
      return {
        id: 'text', start: match.index, end: match.index + match[0].length,
        data: {text: match[0], display},
      }
    }
    return undefined
  },
}

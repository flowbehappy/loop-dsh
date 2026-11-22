import type { LoopModelDescriptor } from './types.ts'

type ModelSource = LoopModelDescriptor['source']
type ModelSourceLabelKey =
  | 'settings.modelsSourcePersonal'
  | 'settings.modelsSourceOrganization'
  | 'settings.modelsSourceLoopHosted'

const SOURCE_LABEL_KEYS: Record<ModelSource, ModelSourceLabelKey> = {
  loop_personal: 'settings.modelsSourcePersonal',
  loop_proxy: 'settings.modelsSourceOrganization',
  loop_hosted: 'settings.modelsSourceLoopHosted',
}

interface ModelDisplayNameParts {
  readonly baseName: string
  readonly source?: ModelSource
  readonly providerName?: string
}

export function modelDisplayNameParts(model: LoopModelDescriptor): ModelDisplayNameParts {
  const providerName = model.providerName.trim()
  const suffix = sourceSuffix(model)
  const baseName = suffix !== '' && model.name.endsWith(suffix)
    ? model.name.slice(0, -suffix.length)
    : model.name
  if (!model.name.endsWith(suffix)) return {baseName: model.name}
  return {
    baseName,
    source: model.source,
    ...providerName !== '' ? {providerName} : {},
  }
}

export function formatModelDisplayName(
  model: LoopModelDescriptor,
  translate: (key: ModelSourceLabelKey) => string,
): string {
  const parts = modelDisplayNameParts(model)
  const labels = [parts.baseName]
  if (parts.source !== undefined) labels.push(translate(SOURCE_LABEL_KEYS[parts.source]))
  if (parts.providerName !== undefined) labels.push(parts.providerName)
  return labels.filter(label => label !== '').join(' · ')
}

function sourceSuffix(model: LoopModelDescriptor): string {
  const providerName = model.providerName.trim()
  if (model.source === 'loop_personal') {
    return providerName === '' ? ' · Personal' : ` · Personal · ${providerName}`
  }
  if (model.source === 'loop_hosted') return ' · Loop hosted'
  return providerName === '' ? ' · Organization' : ` · Organization · ${providerName}`
}

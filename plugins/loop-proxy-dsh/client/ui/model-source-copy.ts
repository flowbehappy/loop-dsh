/** Locale keys for the effective model's source and billing owner. */

import type { LoopKey } from './locales.ts'
import type {
  SelectedModelBilling,
  SelectedModelSource,
} from './model-controller.ts'

export const MODEL_SOURCE_KEYS: Record<SelectedModelSource, LoopKey> = {
  loop_personal: 'settings.modelsSourcePersonal',
  loop_proxy: 'settings.modelsSourceOrganization',
  loop_hosted: 'settings.modelsSourceLoopHosted',
  external: 'launcher.modelSourceExternal',
  unknown: 'launcher.modelSourceUnknown',
}

export const MODEL_BILLING_KEYS: Record<SelectedModelBilling, LoopKey> = {
  'personal-provider': 'launcher.modelBillingPersonal',
  organization: 'launcher.modelBillingOrganization',
  'loop-hosted': 'launcher.modelBillingLoopHosted',
  'provider-account': 'launcher.modelBillingProvider',
  unknown: 'launcher.modelBillingUnknown',
}

export function selectedModelLabelKey(model: {
  readonly scope: 'active-session' | 'new-session'
  readonly basis: 'next' | 'lastUsed' | 'default'
  readonly available: boolean
}): LoopKey {
  if (model.scope === 'new-session') {
    return model.available
      ? 'launcher.modelNewSessionDefault'
      : 'launcher.modelNewSessionDefaultUnavailable'
  }
  if (model.basis === 'default') {
    return model.available
      ? 'launcher.modelSessionDefault'
      : 'launcher.modelSelectedUnavailable'
  }
  return model.available
    ? 'launcher.modelSelected'
    : 'launcher.modelSelectedUnavailable'
}

/** The host's public feedback form configuration, independent of account login. */

const DEFAULT_CONTACT_FORM = 'https://trtgsjkv6r.feishu.cn/share/base/form/shrcnlCoGElW7MQznGy9r3YYXcg?hide_uid=1&hide_device_info=1&hide_harness_version=1'

export function hostFeedbackUrl(config: unknown): string {
  const configured = typeof config === 'object' && config !== null &&
    'contactFormUrl' in config && typeof config.contactFormUrl === 'string'
    ? config.contactFormUrl : DEFAULT_CONTACT_FORM
  let url: URL
  try {
    url = new URL(configured)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
      url = new URL(DEFAULT_CONTACT_FORM)
    }
  } catch {
    url = new URL(DEFAULT_CONTACT_FORM)
  }
  // Loop identities are not DeepSeek account IDs. Never prefill one as the other.
  url.searchParams.delete('prefill_uid')
  url.searchParams.set('hide_uid', '1')
  return url.href
}

export function openHostFeedback(): void {
  const host = window as typeof window & {__DSH_CONTACT_CONFIG__?: unknown}
  window.open(hostFeedbackUrl(host.__DSH_CONTACT_CONFIG__), '_blank', 'noopener,noreferrer')
}

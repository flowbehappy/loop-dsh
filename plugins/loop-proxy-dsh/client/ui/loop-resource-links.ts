/** Plugin-lifetime link delegation for DSH surfaces, including dynamically rendered Markdown. */
export function registerLoopResourceLinks(
  document: Document,
  open: (href: string) => boolean,
): () => void {
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.composedPath().find((node): node is HTMLAnchorElement =>
      node instanceof HTMLAnchorElement)
    if (anchor === undefined || anchor.hasAttribute('download') ||
        anchor.isContentEditable ||
        !['', '_self', '_blank'].includes(anchor.target.toLowerCase())) return
    const href = anchor.getAttribute('href')
    if (href === null || !open(href)) return
    // Consume before the host's React handler hands the same link to a browser.
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  document.addEventListener('click', onClick, true)
  return () => { document.removeEventListener('click', onClick, true) }
}

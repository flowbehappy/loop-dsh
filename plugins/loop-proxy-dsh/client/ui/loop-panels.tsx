/** Native sidebar icons and More-menu rows for the shared Loop page. */

import type { ComponentType, ReactNode } from 'react'
import {
  IconBranchOutlineRegular,
  IconChecklistOutlineRegular,
  IconDatabaseOutlineRegular,
  IconDataOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenOutlineRegular,
  IconNewChatOutlineRegular,
  IconLinkOutlineRegular,
  IconSkillOutlineRegular,
  IconUsersOutlineRegular,
  MenuItemButton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { LOOP_MODULES } from './loop-navigation.ts'
import type { NS } from './locales.ts'

type LoopModuleId = typeof LOOP_MODULES[number]['id']
type PanelProps = PropsRuntime<'sidebar.panellist'>
  & { readonly moduleId: LoopModuleId }
type MoreProps = PropsRuntime<'sidebar.panellist.actions'>
  & PropsLocale<typeof NS>
  & InjectFace<LoopMoreMenuInjected>

export interface LoopMoreMenuInjected {
  readonly openModule: (panelId: string, destination: 'home' | 'resume') => void
}

export function loopModuleIcon(moduleId: string, size = 16): ReactNode {
  switch (moduleId) {
    case 'loop-inbox':
      return <IconNewChatOutlineRegular size={size} />
    case 'loop-connectors':
      return <IconLinkOutlineRegular size={size} />
    case 'loop-projects':
      return <IconFolderCloseRegular size={size} />
    case 'loop-tasks':
      return <IconChecklistOutlineRegular size={size} />
    case 'loop-knowledge':
      return <IconDataOutlineRegular size={size} />
    case 'loop-drive':
      return <IconFolderOpenOutlineRegular size={size} />
    case 'loop-dataspaces':
      return <IconDatabaseOutlineRegular size={size} />
    case 'loop-capabilities':
      return <IconSkillOutlineRegular size={size} />
    case 'loop-contacts':
      return <IconUsersOutlineRegular size={size} />
    case 'loop-workflows':
      return <IconBranchOutlineRegular size={size} />
    default:
      return <IconDataOutlineRegular size={size} />
  }
}

export function LoopPanelIcon({ size, moduleId }: PanelProps): ReactNode {
  return <span
    style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    aria-hidden="true"
  >
    {loopModuleIcon(moduleId, size)}
  </span>
}

export function loopPanelIconComponent(
  moduleId: LoopModuleId,
): ComponentType<PropsRuntime<'sidebar.panellist'>> {
  return function BoundLoopPanelIcon(props) {
    return <LoopPanelIcon {...props} moduleId={moduleId} />
  }
}

/** Add lower-frequency Loop destinations to the sidebar owner's native More menu. */
export function LoopMoreMenu({
  usePanelInfo,
  openModule,
  onDismiss,
  t,
}: MoreProps): ReactNode {
  const activePanelId = usePanelInfo(info => info.activePanelId)
  return <>
    {LOOP_MODULES.filter(module => module.placement === 'more').map(module => (
      <MenuItemButton
        key={module.id}
        icon={loopModuleIcon(module.id)}
        current={activePanelId === module.id}
        onSelect={() => {
          onDismiss()
          // The host's onOpen only resolves resident sidebar entries.
          openModule(module.id, activePanelId === module.id ? 'home' : 'resume')
        }}
      >
        {t(module.label)}
      </MenuItemButton>
    ))}
  </>
}

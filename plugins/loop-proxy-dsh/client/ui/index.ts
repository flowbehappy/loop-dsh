import {LoopKnowledgeRuntime} from './loop-knowledge-runtime.ts'
import { AccountConnectionController } from './account-connection-controller.ts'
/** Client UI contribution for the trusted Loop DSH Host Remote. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { CollaborationDock, CollaborationOverlayHost, type CollaborationDockInjected, type CollaborationOverlayHostInjected } from './collaboration-dock.tsx'
import { CollaborationRuntime } from './collaboration-runtime.ts'
import {
  externalUrlWithLocale,
  openExternal,
} from './external-link.ts'
import {
  collaborationFailureText,
  skillCatalogFailureText,
} from './failure-text.ts'
import { loopReferenceDisplayRule } from './loop-reference-display.ts'
import { registerLoopResourceLinks } from './loop-resource-links.ts'
import {
  LoopGlobalPageController,
  startLoopGlobalPageRuntime,
} from './global-page-controller.ts'
import { zh, en, zhTW, ja, NS, type LoopKey } from './locales.ts'
import {
  LoopGlobalHost,
  LoopGlobalPanel,
  type LoopGlobalHostInjected,
} from './loop-global-panel.tsx'
import {
  LOOP_MODULES,
  LOOP_PROJECTS_PANEL_ID,
  LOOP_SETTINGS_ID,
  loopModuleForPanel,
} from './loop-navigation.ts'
import { normalizedLoopLocale } from './global-workspace-bridge.ts'
import {
  LoopBottomMenu,
  type LoopBottomMenuInjected,
} from './loop-bottom-menu.tsx'
import { LOOP_LAUNCHER_PRIORITY } from './loop-launcher.ts'
import { openHostFeedback } from './host-feedback.ts'
import {
  LOOP_DESKTOP_ONBOARDING_ID,
  LOOP_DESKTOP_ONBOARDING_PRIORITY,
  LOOP_ONBOARDING_ID,
  LOOP_ONBOARDING_PRIORITY,
  LoopOnboardingGate,
  LoopDesktopOnboarding,
  type LoopOnboardingInjected,
  type LoopDesktopOnboardingInjected,
  LoopWelcomeNoticeSuppressor,
} from './loop-onboarding.tsx'
import { LoopMoreMenu, loopPanelIconComponent, type LoopMoreMenuInjected } from './loop-panels.tsx'
import { HumanTaskPanel, watchHumanTask, type PersonalTaskInteraction } from './human-task-panel.tsx'
import { LoopSettings } from './loop-settings.tsx'
import { LoginDialogController } from './login-dialog-controller.ts'
import { LoopLoginDialog, type LoopLoginDialogInjected } from './loop-login-dialog.tsx'
import {
  LoopModelController,
  type HarnessModelCatalog,
} from './model-controller.ts'
import {
  retainModelSelectionObservation,
  SessionModelSelectionAdapter,
} from './session-model-selection.ts'
import { LoopProjectSyncController } from './project-sync-controller.ts'
import { LoopSkillRuntime, LoopSkillRuntimeError } from './loop-skill-runtime.ts'
import { SessionAction, type SessionActionInjected } from './session-action.tsx'
import { LoopSettingsAccess } from './settings-access.ts'
import type { LoopHostClient, RemoteResult, WorkspaceRef } from './types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    loopProxy: LoopKey
  }
}

function workspaceTarget(
  ctx: ClientContext,
  sessionId: string,
): WorkspaceRef | undefined {
  const workspace = ctx.workspaces.list.getSnapshot().items.find(row =>
    row.sessionIds.some(id => String(id) === sessionId))
  if (workspace === undefined) return undefined
  return {
    workspaceId: workspace.workspaceId,
    path: workspace.path,
    displayTitle: workspace.title,
  }
}

/**
 * Register the native Loop modules, Workspace binding menu, Settings, and Session sync.
 * Host's generated client entry calls this only after mounting
 * `ctx.remote.loopHost`.
 * @param ctx - DSH client root.
 * @param remote - generated trusted Host Remote namespace.
 */
export function applyLoopUi(ctx: ClientContext, remote: LoopHostClient): void {
  ctx.effect(
    () => {
      const disposeBase = ctx.locale.register(NS, { zh, en })
      const disposeTraditional = ctx.locale.register(NS, 'zh-TW', zhTW)
      const disposeJapanese = ctx.locale.register(NS, 'ja', ja)
      return () => {
        disposeJapanese()
        disposeTraditional()
        disposeBase()
      }
    },
    'loop-proxy: client dictionaries',
  )
  ctx.uiConversation.userText.register(loopReferenceDisplayRule)
  const t = ctx.locale.bind(NS)
  const currentLoopLocale = () =>
    normalizedLoopLocale(ctx.locale.getSnapshot().active) ?? 'en'
  const openLoopExternal = (url: string) => {
    const localized = externalUrlWithLocale(url, currentLoopLocale())
    return localized !== null && openExternal(localized, {
      protocol: window.location.protocol,
      open: (target, name) => window.open(target, name),
    })
  }
  const selectLoopModule: LoopMoreMenuInjected['openModule'] = (panelId, destination) => {
    ctx.layout.selectPanel(panelId as MainPanelId)
    void globalPage.openModule(panelId, destination)
  }
  const globalPage = new LoopGlobalPageController(remote, {
    onRoute: (panelId, _path) => {
      const activePanelId = ctx.layout.panelInfo.getSnapshot().activePanelId
      if (loopModuleForPanel(activePanelId) !== null &&
          activePanelId !== panelId) {
        ctx.layout.selectPanel(panelId as MainPanelId)
        return true
      }
      return false
    },
  })
  globalPage.setLocale(currentLoopLocale())
  ctx.effect(() => registerLoopResourceLinks(document, href => {
    const panelId = globalPage.openResourceLink(href)
    if (panelId === null) return false
    ctx.layout.selectPanel(panelId as MainPanelId)
    return true
  }), 'loop-proxy: resource links')
  ctx.effect(
    () => ctx.locale.subscribe(() => { globalPage.setLocale(currentLoopLocale()) }),
    'loop-proxy: embedded page locale',
  )
  const openLoopModules = () => {
    selectLoopModule(LOOP_PROJECTS_PANEL_ID, 'resume')
  }
  const skills = new LoopSkillRuntime({
    remote,
    workspaceForSession: sessionId => workspaceTarget(ctx, sessionId),
    formatFailure: failure => skillCatalogFailureText(t, failure),
    showFailure: error => {
      ctx.contextMenus.notify(
        skillCatalogFailureText(t, error instanceof LoopSkillRuntimeError
          ? {code: error.code, message: error.message}
          : {code: 'loop-skill/internal', message: ''}),
        false,
      )
    },
  })
  const knowledge = new LoopKnowledgeRuntime({
    remote,
    workspaceForSession: sessionId => workspaceTarget(ctx, sessionId),
    catalogEvents: (sessionId, signal) => skills.catalogEvents(sessionId, signal),
    failureText: t('knowledge.error.unavailable'),
    showFailure: message => ctx.contextMenus.notify(message, false),
  })
  ctx.effect(() => knowledge.registerSource(ctx.inputTriggers, t('slash.loopKnowledge')), 'loop-proxy: knowledge source')
  ctx.effect(() => () => knowledge.dispose(), 'loop-proxy: knowledge runtime')
  const openLoopWorksite = async (target: {
    readonly loopWorkspaceId: string
    readonly serviceBaseUrl: string
  }): Promise<boolean> => {
    const opened = await globalPage.openWorksite(target)
    if (opened) {
      ctx.layout.selectPanel(LOOP_PROJECTS_PANEL_ID as MainPanelId)
    } else {
      ctx.contextMenus.notify(t('error.projectTarget'), false)
    }
    return opened
  }
  const collaboration = new CollaborationRuntime({
    remote,
    sessions: ctx.sessions as ISessions,
    workspaceForSession: sessionId => workspaceTarget(ctx, sessionId),
    openBinding: () => { settingsAccess.openApiKey() },
    openLoopProject: openLoopModules,
    openWorksiteSetup: scope => {
      void openLoopWorksite({
        loopWorkspaceId: scope.workspaceId,
        serviceBaseUrl: scope.serverBaseUrl,
      })
    },
    openTask: (workspaceId, taskId) => {
      if (globalPage.openTask(workspaceId, taskId)) {
        ctx.layout.selectPanel('loop-tasks' as MainPanelId)
        return true
      }
      return false
    },
  })
  const projectSync = new LoopProjectSyncController({
    remote,
    onAuthorized: globalPage.actions.reconnect,
    onDisconnected: () => {
      accountConnection.reset()
      globalPage.actions.reconnect()
      void models.open(true)
    },
    openExternal: openLoopExternal,
  })
  const sessionModelSelection = new SessionModelSelectionAdapter({
    selectModel: (input, signal) => {
      if (signal?.aborted) {
        return Promise.resolve({
          ok: false,
          error: {code: 'loop/transport', message: ''},
        })
      }
      // The official 0.2.2 Session Remote accepts one request argument. The
      // adapter fences cancellation and ignores a late result after dispatch.
      return ctx.remote.session.selectModel({
        sessionId: input.sessionId as SessionId,
        provider: input.provider,
        model: input.model,
      })
    },
    observeModelSelection: (sessionId, signal) =>
      retainModelSelectionObservation(ctx.sessions, sessionId as SessionId, signal),
  })
  const models = new LoopModelController({
    remote,
    autoSelectAfterLogin: true,
    loadModelCatalog: async () =>
      (await ctx.remote.session.modelCatalog()) as RemoteResult<HarnessModelCatalog>,
    subscribeCatalogEvents: listener => {
      const disposers = [
        ctx.remote.$on('llm/adapters-updated', () => { listener('refresh') }),
        ctx.remote.$on('llm/models-updated', () => { listener('refresh') }),
        ctx.remote.$on('settings/document-updated', () => { listener('refresh') }),
        ctx.remote.$on('credentials/record-updated', () => { listener('refresh') }),
        ctx.remote.$on('credentials/reference-updated', () => { listener('refresh') }),
        ctx.on('connection/reset', () => { listener('reset') }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    scopeSources: {
      globalPage: globalPage.store,
      sharedData: globalPage.sharedData.store,
    },
    selectModel: (input, signal) => sessionModelSelection.select(input, signal),
  })
  const accountConnection = new AccountConnectionController(remote, globalPage, models,
    () => currentLoopLocale().startsWith('zh') ? 'zh' : 'en', openLoopExternal)
  const loginDialog = new LoginDialogController(globalPage, accountConnection, projectSync, models, openLoopModules, () => {
    if (window.location.protocol === 'dsh-app:') return null
    const target = window.open('about:blank', '_blank')
    if (target === null) return null
    target.opener = null
    let navigated = false
    return {
      open: url => {
        const localized = externalUrlWithLocale(url, currentLoopLocale())
        if (localized === null || target.closed) return false
        target.location.replace(localized); navigated = true; return true
      },
      close: () => { if (!navigated && !target.closed) target.close() },
    }
  })
  const signInLoop = loginDialog.open
  ctx.effect(() => () => loginDialog.dispose(), 'loop-proxy: login dialog')
  ctx.effect(() => () => accountConnection.dispose(), 'loop-proxy: account login')
  const settingsAccess = new LoopSettingsAccess()
  ctx.effect(
    () => collaboration.registerSource(
      ctx.inputTriggers,
      type => t(type === 'agent' ? 'collab.section.agents' : 'collab.section.humans'),
      failure => collaborationFailureText(t, failure),
      {
        delegate: t('collab.candidate.delegate'),
        notify: t('collab.candidate.notify'),
        needsAccess: t('collab.candidate.needsAccess'),
        unavailable: t('collab.candidate.unavailable'),
      },
    ),
    'loop-proxy: collaborator @ source',
  )
  ctx.effect(() => () => collaboration.dispose(), 'loop-proxy: collaboration runtime')
  ctx.effect(
    () => skills.registerSource(ctx.inputTriggers, t('slash.loopSkills')),
    'loop-proxy: Loop Skill / source',
  )
  ctx.effect(() => () => skills.dispose(), 'loop-proxy: Loop Skill runtime')
  ctx.effect(
    () => startLoopGlobalPageRuntime(globalPage),
    'loop-proxy: global page bootstrap',
  )
  ctx.effect(() => () => projectSync.dispose(), 'loop-proxy: project sync controller')
  ctx.effect(() => {
    models.start(ctx.uiSession.adapter.current)
    return () => { models.dispose() }
  }, 'loop-proxy: model controller')
  for (const module of LOOP_MODULES) {
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: module.id as MainPanelId,
      locale: NS,
    }, LoopGlobalPanel))
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'loop-proxy.global-page',
    order: 30,
    locale: NS,
    inject: (): LoopGlobalHostInjected => ({
      actions: globalPage.actions,
      retryLogin: signInLoop,
      authorizePages: loginDialog.authorizePages,
      recoverLogin: () => accountConnection.recover(),
      cancelRecovery: () => accountConnection.cancelRecovery(),
      attachWorkspacePage: (frame, pageUrl) => {
        globalPage.attachWorkspacePage(frame, pageUrl)
      },
      hooks: {
        globalPage: globalPage.store,
        sharedData: globalPage.sharedData.store,
        accountConnection: accountConnection.store,
      },
    }),
  }, LoopGlobalHost))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'loop-proxy.login',
    order: 40,
    locale: NS,
    inject: (): LoopLoginDialogInjected => ({
      dialog: loginDialog,
      pageActions: globalPage.actions,
      hooks: {
        loginDialog: loginDialog.store,
        globalPage: globalPage.store,
        projectSync: projectSync.store,
        accountConnection: accountConnection.store,
        models: models.store,
        sharedData: globalPage.sharedData.store,
      },
    }),
  }, LoopLoginDialog))

  LOOP_MODULES.forEach((module, index) => {
    if (module.placement !== 'sidebar') return
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: module.id as MainPanelId,
      order: 10 + index,
      locale: NS,
      label: () => t(module.label),
    }, loopPanelIconComponent(module.id)))
  })

  ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
    name: 'sidebar.panellist.actions',
    id: 'loop-proxy.modules',
    order: -10,
    locale: NS,
    inject: (): LoopMoreMenuInjected => ({openModule: selectLoopModule}),
  }, LoopMoreMenu))

  ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher',
    priority: LOOP_LAUNCHER_PRIORITY,
    locale: NS,
    inject: (): LoopBottomMenuInjected => ({
      signIn: signInLoop,
      contactUs: openHostFeedback,
      settingsAccess,
      hooks: {globalPage: globalPage.store},
    }),
  }, LoopBottomMenu))

  if (!('dshDesktop' in globalThis)) {
    ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
      name: 'settings.onboarding',
      id: LOOP_ONBOARDING_ID,
      priority: LOOP_ONBOARDING_PRIORITY,
      locale: NS,
      inject: (): LoopOnboardingInjected => ({
        openLoopModule: signInLoop,
        hooks: {globalPage: globalPage.store},
      }),
    }, LoopOnboardingGate))
  }

  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'welcome-notice',
    priority: LOOP_LAUNCHER_PRIORITY,
    order: -100,
    locale: NS,
  }, LoopWelcomeNoticeSuppressor))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: LOOP_SETTINGS_ID,
    priority: LOOP_LAUNCHER_PRIORITY,
    order: -10,
    locale: NS,
    label: () => t('settings.title'),
    inject: () => ({remote}),
  }, LoopSettings))

  if ('dshDesktop' in globalThis) {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: LOOP_DESKTOP_ONBOARDING_ID,
      priority: LOOP_DESKTOP_ONBOARDING_PRIORITY,
      order: 20,
      locale: NS,
      inject: (): LoopDesktopOnboardingInjected => ({
        openLoopModule: signInLoop,
        hooks: {globalPage: globalPage.store},
      }),
    }, LoopDesktopOnboarding))
  }

  /**
   * Session-header entry remains live even for an empty or non-current
   * Workspace menu interaction; it resolves only this Session's Workspace.
   */
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'loop-proxy',
    order: -10,
    locale: NS,
    inject: (sessionId: string): SessionActionInjected => ({
      readUpload: async signal => {
        const workspace = workspaceTarget(ctx, sessionId)
        if (workspace === undefined) return 'off'
        const result = await remote.syncStatus({workspaceId: workspace.workspaceId, sessionId}, signal)
        if (!result.ok) return 'failed'
        const sync = result.value
        if (sync.state === 'error' || sync.state === 'retrying' || sync.state === 'needs_auth') return 'failed'
        if (sync.state === 'off') return 'off'
        return sync.state === 'pending' || sync.pending > 0 ? 'uploading' : 'uploaded'
      },
    }),
  }, SessionAction))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'loop-proxy-collaboration',
    order: 45,
    locale: NS,
    inject: (): CollaborationOverlayHostInjected => ({
      hooks: {sessionBinding: ctx.uiSession.adapter.current},
      forSession: sessionId => ({
        runtime: collaboration.forSession(sessionId),
        focusComposer: () => {
          const scope = ctx.sessions.scope(sessionId)
          scope?.get('conversation')?.input.for(scope).focus()
        },
      }),
    }),
  }, CollaborationOverlayHost))

  const publishTask = ctx.uiSession.registerPendingInteraction<PersonalTaskInteraction>(() => 3)
  ctx.effect(() => watchHumanTask(ctx.uiSession.adapter.current, remote, publishTask), 'loop-proxy: task consent')
  ctx.slots.inject('conversation.composer', () => ctx.slots.register({
    name: 'conversation.composer', priority: 3, locale: NS,
    select: ({pendingInteraction}) => pendingInteraction?.kind === 'loop-personal-task' ? pendingInteraction : null,
    inject: () => ({remote}),
  }, HumanTaskPanel))

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'loop-proxy-collaboration',
    order: 20,
    locale: NS,
    inject: (sessionId: string): CollaborationDockInjected => {
      const runtime = collaboration.forSession(sessionId)
      return {runtime, hooks: {collaboration: runtime.store}}
    },
  }, CollaborationDock))


}

window.__ModuleLoader__.load({
  id: "@pingkai/loop-dsh",
  factory: (require) => {
    const styleID = "loop-proxy-dsh-client";
    if (document.querySelector("style[data-loop-proxy-dsh]") === null) {
      const style = document.createElement("style");
      style.id = styleID;
      style.dataset.loopProxyDsh = "";
      style.textContent = "/* client/ui/loop-ui.module.css */\n.loop_ui_modal {\n  width: min(620px, 100%);\n  max-height: 100%;\n}\n.loop_ui_modalContent {\n  padding: 0;\n}\n.loop_ui_panel {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  min-height: 0;\n  max-height: min(720px, calc(100vh - 48px));\n}\n.loop_ui_header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding: 18px 20px 12px;\n}\n.loop_ui_workspaceHeading {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  gap: 2px;\n}\n.loop_ui_eyebrow {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n  letter-spacing: 0.02em;\n}\n.loop_ui_workspaceHeading h2 {\n  max-width: 100%;\n  margin: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary);\n  font-size: 17px;\n  font-weight: 600;\n  line-height: 24px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.loop_ui_body {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  padding: 0 20px 20px;\n  overflow-y: auto;\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\n}\n.loop_ui_status {\n  margin: 4px 0 16px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n}\n.loop_ui_section {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 16px 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n.loop_ui_section:first-of-type {\n  border-top: 0;\n}\n.loop_ui_sectionHeading {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 18px;\n}\n.loop_ui_sectionTitle {\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;\n}\n.loop_ui_subsectionTitle {\n  margin: 2px 0 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n}\n.loop_ui_hint,\n.loop_ui_warning,\n.loop_ui_error {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_hint {\n  color: var(--dsw-alias-label-secondary);\n}\n.loop_ui_warning {\n  color: var(--dsw-static-amber-500);\n}\n.loop_ui_authPrompt {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.loop_ui_agentMissing {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 8px;\n}\n.loop_ui_error {\n  color: var(--dsw-alias-state-error-primary);\n  overflow-wrap: anywhere;\n}\n.loop_ui_errorBlock {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin-bottom: 12px;\n  padding: 10px 12px;\n  border-left: 2px solid var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-state-error-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_errorBlock strong {\n  font-weight: 500;\n}\n.loop_ui_choiceList {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin: 0;\n  padding: 0;\n  border: 0;\n}\n.loop_ui_choice {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  min-width: 0;\n  padding: 8px 10px;\n  border-radius: 8px;\n  cursor: pointer;\n}\n.loop_ui_choice:hover {\n  background: var(--dsw-alias-bg-layer-2);\n}\n.loop_ui_choice:has(input:focus-visible) {\n  outline: 1px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n.loop_ui_choice input {\n  flex: none;\n  margin: 3px 0 0;\n  accent-color: var(--dsw-alias-brand-primary);\n}\n.loop_ui_choiceText {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  gap: 1px;\n}\n.loop_ui_choiceTitle {\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 19px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.loop_ui_choiceCaption {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n}\n.loop_ui_select {\n  width: 100%;\n  height: 34px;\n  padding: 0 10px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-base);\n  font: inherit;\n  font-size: 13px;\n}\n.loop_ui_select:focus-visible {\n  outline: 1px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n.loop_ui_createProject {\n  padding: 14px 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n.loop_ui_createProject summary {\n  cursor: pointer;\n  user-select: none;\n}\n.loop_ui_createRow {\n  display: flex;\n  align-items: flex-end;\n  gap: 8px;\n  padding-top: 10px;\n}\n.loop_ui_field {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  min-width: 0;\n  gap: 5px;\n}\n.loop_ui_footerActions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding-top: 14px;\n}\n.loop_ui_footerHint {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n.loop_ui_inlineActions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n.loop_ui_summary {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  padding: 4px 0 16px;\n}\n.loop_ui_bindingDetail {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.loop_ui_projectLine {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 6px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n}\n.loop_ui_projectLine strong {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 500;\n}\n.loop_ui_metadata {\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_metadata > div {\n  display: grid;\n  grid-template-columns: minmax(112px, 0.42fr) minmax(0, 1fr);\n  gap: 12px;\n}\n.loop_ui_metadata dt {\n  color: var(--dsw-alias-label-tertiary);\n}\n.loop_ui_metadata dd {\n  min-width: 0;\n  margin: 0;\n  overflow-wrap: anywhere;\n  color: var(--dsw-alias-label-primary);\n}\n.loop_ui_sessionAction {\n  min-width: 0;\n}\n.loop_ui_globalStatus,\n.loop_ui_globalError {\n  box-sizing: border-box;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  background: var(--dsw-alias-bg-base);\n}\n.loop_ui_globalHost {\n  position: absolute;\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  overflow: hidden;\n  padding-top: var(--dsh-frame-top-clearance, 0px);\n  visibility: hidden;\n  pointer-events: none;\n  contain: layout paint;\n  background: var(--dsw-alias-bg-base);\n}\n.loop_ui_globalHost[data-active=true] {\n  visibility: visible;\n  pointer-events: auto;\n}\n.loop_ui_globalFrame {\n  display: block;\n  flex: 1;\n  width: 100%;\n  min-width: 0;\n  min-height: 0;\n  border: 0;\n}\n.loop_ui_globalConnectionStatus {\n  position: absolute;\n  right: 12px;\n  bottom: 12px;\n  z-index: 1;\n  max-width: min(320px, calc(100% - 24px));\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 9px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 7px;\n  background: color-mix(in srgb, var(--dsw-alias-bg-base) 94%, transparent);\n  box-shadow: 0 2px 10px rgb(0 0 0 / 8%);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_globalConnectionAction {\n  flex: none;\n  height: 26px;\n  padding-inline: 8px;\n  font-size: 12px;\n}\n.loop_ui_launcherRoot {\n  flex: 1;\n  min-width: 0;\n}\n.loop_ui_launcherAnchor {\n  width: 100%;\n}\n.loop_ui_launcherMenu[role=menu] {\n  min-width: 124px;\n  max-width: 280px;\n  padding: 4px;\n}\n.loop_ui_launcherMenu [role=menuitem] {\n  min-height: 40px;\n  gap: 8px;\n  padding: 8px 10px;\n  border-radius: var(--dsw-radius-md);\n  font-size: 14px;\n  line-height: 22px;\n}\n.loop_ui_launcherTrigger {\n  display: flex;\n  width: 100%;\n  min-width: 0;\n  height: 32px;\n  align-items: center;\n  gap: 8px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  text-align: start;\n  cursor: pointer;\n  transition: background-color 160ms ease, color 160ms ease;\n}\n.loop_ui_launcherTrigger:hover,\n.loop_ui_launcherTrigger:focus-visible,\n.loop_ui_launcherTrigger[aria-expanded=true] {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.loop_ui_launcherTrigger:focus-visible {\n  outline: 2px solid var(--dsw-alias-label-primary);\n  outline-offset: 2px;\n}\n@media (prefers-reduced-motion: reduce) {\n  .loop_ui_launcherTrigger {\n    transition: none;\n  }\n}\n.loop_ui_launcherTrigger[data-collapsed=true] {\n  box-sizing: border-box;\n  width: 36px;\n  height: 36px;\n  justify-content: center;\n  padding-inline: 0;\n}\n.loop_ui_launcherLabel {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.loop_ui_settingsAdvanced > summary,\n.loop_ui_collaborationSection > summary {\n  cursor: pointer;\n  padding: 6px 0;\n}\n.loop_ui_settingsAdvanced[open] > summary,\n.loop_ui_collaborationSection[open] > summary {\n  margin-bottom: 8px;\n}\n.loop_ui_launcherHeader strong {\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 18px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.loop_ui_launcherEyebrow {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 16px;\n  text-transform: uppercase;\n}\n.loop_ui_launcherConnection {\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_launcherConnection > span {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: var(--dsw-alias-state-success-primary, #12805c);\n}\n.loop_ui_launcherConnection[data-attention=true] > span {\n  background: var(--dsw-alias-state-warning-primary, #dc6803);\n}\n.loop_ui_launcherModal {\n  width: min(430px, calc(100vw - 32px));\n}\n.loop_ui_launcherModal h2 {\n  margin: 0 0 10px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 17px;\n  line-height: 24px;\n}\n.loop_ui_launcherModal p {\n  margin: 0 0 8px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n}\n.loop_ui_settingsPage {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  max-width: 760px;\n  gap: 8px;\n}\n.loop_ui_settingsHeader {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 4px 0 12px;\n}\n.loop_ui_settingsHeader h2,\n.loop_ui_settingsSection h3 {\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n  font-weight: 500;\n}\n.loop_ui_settingsHeader h2 {\n  font-size: 20px;\n  line-height: 28px;\n}\n.loop_ui_settingsHeader p,\n.loop_ui_settingsSectionHeading p {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n}\n.loop_ui_settingsSection {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  padding: 18px 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n.loop_ui_settingsSectionHeading {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n}\n.loop_ui_settingsSectionHeading > div {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.loop_ui_settingsSection h3 {\n  font-size: 15px;\n  line-height: 22px;\n}\n.loop_ui_settingsForm {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-end;\n  gap: 10px;\n}\n.loop_ui_settingsField {\n  display: flex;\n  flex: 1 1 360px;\n  flex-direction: column;\n  gap: 6px;\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_settingsActions {\n  display: flex;\n  gap: 8px;\n}\n.loop_ui_settingsStatus,\n.loop_ui_settingsPlaceholder {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_settingsConnected {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n}\n.loop_ui_settingsPlaceholder {\n  padding: 12px 0;\n}\n.loop_ui_settingsSyncControl {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 12px;\n}\n.loop_ui_settingsState {\n  padding: 2px 7px;\n  border-radius: 999px;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  font-size: 11px;\n  line-height: 16px;\n}\n.loop_ui_settingsState[data-state=ready] {\n  color: var(--dsw-alias-state-success-primary);\n}\n.loop_ui_settingsState[data-state=partial],\n.loop_ui_settingsState[data-state=needs_auth],\n.loop_ui_settingsState[data-state=needs_config] {\n  color: var(--dsw-static-amber-500);\n}\n.loop_ui_settingsState[data-state=error] {\n  color: var(--dsw-alias-state-error-primary);\n}\n.loop_ui_settingsMetadata {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 16px;\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n.loop_ui_settingsMetadata > div {\n  display: flex;\n  gap: 6px;\n}\n.loop_ui_settingsMetadata dd {\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n}\n.loop_ui_settingsRecovery {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 12px 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n.loop_ui_settingsRecovery p,\n.loop_ui_settingsProjects p {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_settingsSuccess {\n  margin: 0;\n  color: var(--dsw-alias-state-success-primary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_settingsModelSelection {\n  display: grid;\n  gap: 3px;\n  padding: 8px 0;\n  border-block: 0.5px solid var(--dsw-alias-border-l1);\n}\n.loop_ui_settingsModelSelection strong {\n  font-size: 13px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.loop_ui_settingsModelSelection > span {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.loop_ui_settingsProjects {\n  display: flex;\n  flex-direction: column;\n  gap: 0;\n  padding-top: 4px;\n}\n.loop_ui_settingsProjects h4 {\n  margin: 0 0 6px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n}\n.loop_ui_settingsProject {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 12px 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l1);\n}\n.loop_ui_settingsModelConnection {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding: 12px 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l1);\n}\n.loop_ui_settingsModelConnection > div {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  gap: 3px;\n}\n.loop_ui_settingsModelConnection strong {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 19px;\n}\n.loop_ui_settingsProjectHeading {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  font-size: 11px;\n  line-height: 16px;\n}\n.loop_ui_settingsProjectHeading > div {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  gap: 3px;\n}\n.loop_ui_settingsProjectHeading strong {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 19px;\n}\n.loop_ui_settingsProjectHeading span {\n  overflow-wrap: anywhere;\n  color: var(--dsw-alias-label-tertiary);\n}\n.loop_ui_settingsProjectHeading > span[data-state=synced] {\n  color: var(--dsw-alias-state-success-primary);\n}\n.loop_ui_settingsProjectHeading > span[data-state=error],\n.loop_ui_settingsProjectHeading > span[data-state=workspace_missing] {\n  color: var(--dsw-alias-state-error-primary);\n}\n.loop_ui_settingsDirectoryEditor {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 12px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n.loop_ui_globalWorkspaceNotice {\n  position: absolute;\n  top: calc(var(--dsh-frame-top-clearance, 0px) + 12px);\n  left: 50%;\n  z-index: 2;\n  max-width: min(520px, calc(100% - 32px));\n  padding: 7px 10px;\n  border: 0.5px solid var(--dsw-alias-state-error-primary);\n  border-radius: 8px;\n  color: var(--dsw-alias-state-error-primary);\n  background: var(--dsw-alias-bg-base);\n  box-shadow: var(--dsw-alias-shadow-l2);\n  font-size: 12px;\n  line-height: 18px;\n  text-align: center;\n  transform: translateX(-50%);\n}\n.loop_ui_serverActions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n}\n.loop_ui_globalStatus {\n  display: grid;\n  place-items: center;\n}\n.loop_ui_spinner {\n  color: var(--dsw-alias-label-secondary);\n  animation: loop_ui_loop-spin 1s linear infinite;\n}\n.loop_ui_globalError {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  padding-inline: 24px;\n  text-align: center;\n}\n.loop_ui_globalError p {\n  max-width: 440px;\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 20px;\n}\n.loop_ui_globalError .loop_ui_hint {\n  color: var(--dsw-alias-label-secondary);\n}\n@keyframes loop_ui_loop-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.loop_ui_visuallyHidden {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n.loop_ui_collaborationDock {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 28px;\n  max-width: 100%;\n  overflow: hidden;\n}\n.loop_ui_collaborationDock > :first-child {\n  min-width: 0;\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.loop_ui_collaborationNotice {\n  color: var(--muted-foreground, #6b7280);\n  font-size: 12px;\n  max-width: min(52ch, 60%);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.loop_ui_collaborationSection {\n  display: grid;\n  gap: 10px;\n  padding-block: 14px;\n  border-top: 1px solid var(--border, rgb(127 127 127 / 20%));\n}\n.loop_ui_collaborationList {\n  display: grid;\n  gap: 8px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.loop_ui_collaborationItem {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 12px;\n  min-width: 0;\n  padding: 8px 0;\n  border-bottom: 1px solid var(--border, rgb(127 127 127 / 14%));\n}\n.loop_ui_collaborationItem:last-child {\n  border-bottom: 0;\n}\n.loop_ui_collaborationItemText {\n  display: grid;\n  gap: 3px;\n  min-width: 0;\n}\n.loop_ui_collaborationItemText strong,\n.loop_ui_collaborationItemText span {\n  overflow-wrap: anywhere;\n}\n.loop_ui_collaborationItemActions {\n  display: flex;\n  flex: 0 0 auto;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 6px;\n}\n.loop_ui_collaborationChoices {\n  display: grid;\n  gap: 8px;\n  margin: 0;\n  padding: 0;\n  border: 0;\n}\n.loop_ui_collaborationChoices > legend {\n  margin-bottom: 8px;\n  font-size: 13px;\n  font-weight: 600;\n}\n.loop_ui_collaborationContinuation {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 8px 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.loop_ui_collaborationContinuation span {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n@media (max-width: 640px) {\n  .loop_ui_collaborationItem {\n    align-items: stretch;\n    flex-direction: column;\n  }\n  .loop_ui_collaborationItemActions {\n    justify-content: flex-start;\n  }\n  .loop_ui_collaborationNotice {\n    max-width: 46%;\n  }\n}\n@media (max-width: 640px) {\n  .loop_ui_header {\n    padding-inline: 16px;\n  }\n  .loop_ui_body {\n    padding-inline: 16px;\n  }\n  .loop_ui_metadata > div {\n    grid-template-columns: 1fr;\n    gap: 1px;\n  }\n  .loop_ui_createRow {\n    align-items: stretch;\n    flex-direction: column;\n  }\n  .loop_ui_pageShell {\n    padding-inline: 10px;\n  }\n}\n.loop_ui_uploadEntry {\n  position: relative;\n  display: inline-flex;\n}\n.loop_ui_uploadDetails {\n  position: absolute;\n  top: 100%;\n  right: 0;\n  z-index: 20;\n  white-space: nowrap;\n  padding: 8px 12px;\n  border-radius: 6px;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l2);\n  font-size: 13px;\n  pointer-events: none;\n}\n.loop_ui_loginDialog {\n  width: min(440px, 100%);\n}\n.loop_ui_loginForm {\n  display: flex;\n  flex-direction: column;\n  gap: 20px;\n}\n.loop_ui_loginIntro {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n.loop_ui_loginIntro p {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n}\n.loop_ui_loginBrand {\n  display: flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  width: 48px;\n  height: 48px;\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-l2);\n}\n.loop_ui_loginField {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n}\n.loop_ui_loginStatus {\n  display: flex;\n  align-items: flex-start;\n  gap: 9px;\n  padding: 14px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-l2);\n}\n.loop_ui_loginStatus > div {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  gap: 4px;\n}\n.loop_ui_loginStatus strong {\n  font-size: 13px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n}\n.loop_ui_loginStatusDot {\n  flex: none;\n  width: 7px;\n  height: 7px;\n  margin-top: 5px;\n  border-radius: 50%;\n  background: var(--dsw-alias-label-tertiary);\n}\n.loop_ui_loginStatus[data-connected=true] .loop_ui_loginStatusDot {\n  background: var(--dsw-static-green-500, #22a06b);\n}\n.loop_ui_loginCurrentServer {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.loop_ui_loginActions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 10px;\n}\n.loop_ui_loginActions > button {\n  min-width: 88px;\n}\n.loop_ui_loginTabs {\n  display: flex;\n  gap: 1rem;\n  border-bottom: 1px solid var(--dsh-border, #8885);\n}\n.loop_ui_loginTabs button {\n  background: transparent;\n  color: inherit;\n  border: 0;\n  border-bottom: 2px solid transparent;\n  padding: .5rem .125rem;\n  cursor: pointer;\n}\n.loop_ui_loginTabs button[aria-selected=true] {\n  font-weight: 600;\n  border-bottom-color: currentColor;\n}\n.loop_ui_taskConsent {\n  box-sizing: border-box;\n  width: min(100%, 720px);\n  margin: 0 auto;\n  padding: 14px 18px;\n  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);\n  border-radius: 12px;\n  font-size: 13px;\n  overflow-wrap: anywhere;\n}\n.loop_ui_taskConsent p {\n  margin: 4px 0;\n}\n.loop_ui_taskConsent div {\n  display: flex;\n  gap: 8px;\n  margin-top: 8px;\n}\n";
      document.head.append(style);
    }
    const module = {exports: {}};
    const exports = module.exports;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // client/index.ts
    var index_exports = {};
    __export(index_exports, {
      apply: () => apply,
      inject: () => inject,
      name: () => name
    });
    module.exports = __toCommonJS(index_exports);

    // model-identity.mjs
    var LOOP_MODEL_ROUTE_PREFIX = "loop-model-";
    var LOOP_MODEL_ROUTE_HEX_LENGTH = 20;
    function loopModelRouteInput(workspaceId, connectionId) {
      return `${workspaceId}\0${connectionId}`;
    }
    function loopModelRouteFromDigest(digestHex) {
      return `${LOOP_MODEL_ROUTE_PREFIX}${digestHex.slice(0, LOOP_MODEL_ROUTE_HEX_LENGTH)}`;
    }
    function loopModelPickerID(model) {
      return [
        model.wireApi,
        model.source,
        encodeURIComponent(model.providerId ?? ""),
        encodeURIComponent(model.id)
      ].join(":");
    }
    function parseLoopModelPickerID(value) {
      const parts = value.split(":");
      if (parts.length !== 4) return null;
      const [wireApi, source, encodedProviderID, encodedModelID] = parts;
      if (wireApi === void 0 || wireApi === "" || source === void 0 || source === "") return null;
      try {
        const providerId = decodeURIComponent(encodedProviderID);
        const modelId = decodeURIComponent(encodedModelID);
        if (modelId === "") return null;
        return { wireApi, source, providerId, modelId };
      } catch {
        return null;
      }
    }

    // host-protocol.mjs
    function isAbsolute(value) {
      return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(value);
    }
    var ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
    var MAX_STRING = 2048;
    var WORKSPACE_REF_KEYS = /* @__PURE__ */ new Set(["workspaceId", "path", "displayTitle"]);
    function fail(message) {
      throw new TypeError(message);
    }
    function object(value, label, allowed) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) fail(`${label} has an unknown field`);
      }
      return value;
    }
    function text(value, label, max = MAX_STRING) {
      if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value) > max) {
        fail(`${label} must be a non-empty bounded string`);
      }
      return value;
    }
    function textAllowEmpty(value, label, max) {
      if (typeof value !== "string" || Buffer.byteLength(value) > max) {
        fail(`${label} must be a bounded string`);
      }
      return value;
    }
    function id(value, label) {
      text(value, label, 200);
      if (!ID.test(value)) fail(`${label} is invalid`);
      return value;
    }
    function absolutePath(value, label) {
      text(value, label);
      if (!isAbsolute(value) || value.includes("\0")) fail(`${label} must be absolute`);
      return value;
    }
    function validateWorkspaceRef(value) {
      object(value, "workspace", WORKSPACE_REF_KEYS);
      return workspaceRef(value);
    }
    function workspaceRef(value) {
      return {
        workspaceId: id(value.workspaceId, "workspaceId"),
        path: absolutePath(value.path, "workspace path"),
        displayTitle: text(value.displayTitle, "workspace displayTitle", 255)
      };
    }
    var BIND_KEYS = /* @__PURE__ */ new Set([...WORKSPACE_REF_KEYS, "mode", "choice", "locale"]);
    function validateBeginBind(value) {
      object(value, "beginBind request", BIND_KEYS);
      const request = workspaceRef(value);
      if (value.mode !== void 0 && value.mode !== "bind" && value.mode !== "switch") {
        fail("mode must be bind or switch");
      }
      request.mode = value.mode ?? "bind";
      if (value.locale !== void 0) {
        if (value.locale !== "zh" && value.locale !== "en") fail("locale must be zh or en");
        request.locale = value.locale;
      }
      if (value.choice !== void 0) {
        const choice = object(value.choice, "binding choice", /* @__PURE__ */ new Set(["projectId", "agentId"]));
        request.choice = {
          projectId: id(choice.projectId, "projectId"),
          agentId: id(choice.agentId, "agentId")
        };
      }
      return request;
    }
    var COMPLETE_KEYS = /* @__PURE__ */ new Set([...WORKSPACE_REF_KEYS, "challengeId", "projectId", "agentId", "expectedRevision"]);
    function validateCompleteBind(value) {
      object(value, "completeBind request", COMPLETE_KEYS);
      const request = workspaceRef(value);
      request.challengeId = id(value.challengeId, "challengeId");
      request.projectId = id(value.projectId, "projectId");
      request.agentId = id(value.agentId, "agentId");
      if (value.expectedRevision !== void 0 && value.expectedRevision !== null) {
        request.expectedRevision = id(value.expectedRevision, "expectedRevision");
      } else {
        request.expectedRevision = null;
      }
      return request;
    }
    var UNBIND_KEYS = /* @__PURE__ */ new Set([...WORKSPACE_REF_KEYS, "expectedRevision", "recoveryMode"]);
    function validateUnbind(value) {
      object(value, "unbind request", UNBIND_KEYS);
      const request = workspaceRef(value);
      request.expectedRevision = id(value.expectedRevision, "expectedRevision");
      if (value.recoveryMode !== void 0) {
        if (value.recoveryMode !== "human_confirmed") fail("recoveryMode must be human_confirmed");
        request.recoveryMode = value.recoveryMode;
      }
      return request;
    }
    function validateDisconnectAccount(value) {
      object(value, "disconnect request", /* @__PURE__ */ new Set(["recoveryMode"]));
      if (value.recoveryMode !== void 0 && value.recoveryMode !== "human_confirmed") fail("recoveryMode must be human_confirmed");
      return value.recoveryMode === void 0 ? {} : { recoveryMode: value.recoveryMode };
    }
    var SESSION_KEYS = /* @__PURE__ */ new Set(["workspaceId", "sessionId"]);
    function validateSessionRef(value) {
      object(value, "session request", SESSION_KEYS);
      return {
        workspaceId: id(value.workspaceId, "workspaceId"),
        sessionId: id(value.sessionId, "sessionId")
      };
    }
    var SYNC_KEYS = /* @__PURE__ */ new Set(["workspaceId", "sessionId", "enabled", "confirmedSourceSequence"]);
    function validateSetSync(value) {
      object(value, "setSync request", SYNC_KEYS);
      const request = {
        workspaceId: id(value.workspaceId, "workspaceId"),
        sessionId: id(value.sessionId, "sessionId")
      };
      if (typeof value.enabled !== "boolean") fail("enabled must be boolean");
      request.enabled = value.enabled;
      if (value.confirmedSourceSequence !== void 0) {
        if (!Number.isSafeInteger(value.confirmedSourceSequence) || value.confirmedSourceSequence < 0) {
          fail("confirmedSourceSequence must be a non-negative safe integer");
        }
        request.confirmedSourceSequence = value.confirmedSourceSequence;
      }
      return request;
    }
    var CREATE_PROJECT_KEYS = /* @__PURE__ */ new Set([...WORKSPACE_REF_KEYS, "challengeId", "name", "prefix"]);
    function validateCreateProject(value) {
      object(value, "createProject request", CREATE_PROJECT_KEYS);
      const request = workspaceRef(value);
      request.challengeId = id(value.challengeId, "challengeId");
      request.name = text(value.name, "project name", 255).trim();
      if (request.name === "") fail("project name must not be blank");
      request.prefix = text(value.prefix, "project prefix", 32).trim();
      if (!/^[A-Za-z]{1,32}$/.test(request.prefix)) {
        fail("project prefix must be 1-32 ASCII letters");
      }
      return request;
    }
    function validateGlobalPage(value) {
      return object(value, "globalPage request", /* @__PURE__ */ new Set());
    }
    function validateConfigureGlobalServer(value) {
      object(value, "configureGlobalServer request", /* @__PURE__ */ new Set(["serverUrl"]));
      return { serverUrl: text(value.serverUrl, "server URL").trim() };
    }
    function validateConfigureGlobalServerWorkspace(value) {
      object(value, "configureGlobalServerWorkspace request", /* @__PURE__ */ new Set([
        "workspaceId",
        "expectedServerRevision"
      ]));
      return {
        workspaceId: id(value.workspaceId, "Loop workspace id"),
        expectedServerRevision: id(value.expectedServerRevision, "expectedServerRevision")
      };
    }
    var OPEN_PAGE_KEYS = /* @__PURE__ */ new Set([...WORKSPACE_REF_KEYS, "sessionId", "projectId", "pagePath"]);
    function validateOpenLoopPage(value) {
      object(value, "openLoopPage request", OPEN_PAGE_KEYS);
      const request = workspaceRef(value);
      if (value.sessionId !== void 0) request.sessionId = id(value.sessionId, "sessionId");
      if (value.projectId !== void 0) request.projectId = id(value.projectId, "projectId");
      if (value.pagePath !== void 0) {
        text(value.pagePath, "page path");
        if (!value.pagePath.startsWith("/") || value.pagePath.startsWith("//") || value.pagePath.includes("\\")) {
          fail("page path must be an absolute Loop path");
        }
        request.pagePath = value.pagePath;
      }
      return request;
    }
    function validateProjectSyncSettingsRequest(value) {
      return object(value, "project sync settings request", /* @__PURE__ */ new Set());
    }
    function validateSetProjectSyncSettings(value) {
      object(value, "set project sync settings request", /* @__PURE__ */ new Set(["enabled", "defaultRoot"]));
      if (value.enabled === void 0 && value.defaultRoot === void 0) {
        fail("project sync settings require enabled or defaultRoot");
      }
      const request = {};
      if (value.enabled !== void 0) {
        if (typeof value.enabled !== "boolean") fail("project sync enabled must be boolean");
        request.enabled = value.enabled;
      }
      if (value.defaultRoot !== void 0) {
        request.defaultRoot = absolutePath(value.defaultRoot, "default project root");
        if (request.defaultRoot === "/") fail("default project root is invalid");
      }
      return request;
    }
    function validateSyncProjects(value) {
      object(value, "sync projects request", /* @__PURE__ */ new Set(["reconcileWorkspaceBinding", "expectedServerRevision", "expectedGrantId"]));
      if (value.reconcileWorkspaceBinding === void 0 && value.expectedServerRevision === void 0 && value.expectedGrantId === void 0) return {};
      if (value.reconcileWorkspaceBinding !== true) fail("workspace repair requires explicit confirmation");
      return { reconcileWorkspaceBinding: true, ...value.expectedGrantId === void 0 ? {} : { expectedGrantId: id(value.expectedGrantId, "connection grant") }, expectedServerRevision: id(value.expectedServerRevision, "server revision") };
    }
    function validateChangeProjectDirectory(value) {
      object(value, "change project directory request", /* @__PURE__ */ new Set([
        "projectId",
        "path",
        "expectedBindingRevision"
      ]));
      const request = {
        projectId: id(value.projectId, "projectId"),
        path: absolutePath(value.path, "project directory")
      };
      if (value.expectedBindingRevision !== void 0) {
        request.expectedBindingRevision = id(value.expectedBindingRevision, "expectedBindingRevision");
      }
      return request;
    }
    function collaborationRequest(value, label, allowed, required = []) {
      object(value, label, new Set(allowed));
      for (const field of required) {
        if (!Object.hasOwn(value, field)) fail(`${label}.${field} is required`);
      }
      return value;
    }
    function validateCollaborationStatus(value) {
      return collaborationRequest(value, "collaboration status", ["sessionId", "workspaceId"], ["sessionId"]);
    }
    function validateCollaborationSnapshot(value) {
      return collaborationRequest(value, "collaboration snapshot", [
        "sessionId",
        "workspaceId",
        "bindingRevision",
        "sessionGeneration"
      ], ["sessionId"]);
    }
    function validateCollaborationBoards(value) {
      return collaborationRequest(value, "collaboration boards", [
        "sessionId",
        "query",
        "cursor",
        "limit"
      ], ["sessionId"]);
    }
    function validateCollaborationBind(value) {
      return collaborationRequest(value, "collaboration bind", [
        "sessionId",
        "workspaceId",
        "boardId",
        "coordinatorAgentId",
        "expectedRevision",
        "expectedBindingEpoch",
        "sourceGeneration",
        "shareScope"
      ], ["sessionId", "boardId", "coordinatorAgentId"]);
    }
    function validateCollaborationDirectory(value) {
      return collaborationRequest(value, "collaboration directory", [
        "sessionId",
        "workspaceId",
        "bindingRevision",
        "scopeGeneration",
        "query",
        "kinds",
        "cursor",
        "limit"
      ], ["sessionId"]);
    }
    function validatePrepareCollaborationIntent(value) {
      if (value?.activateOnClaim !== void 0 && typeof value.activateOnClaim !== "boolean") fail("activateOnClaim must be boolean");
      return collaborationRequest(value, "prepare collaboration intent", [
        "sessionId",
        "workspaceId",
        "bindingRevision",
        "sessionGeneration",
        "serializedText",
        "payloadText",
        "payloadDigest",
        "references",
        "targets",
        "shareScope",
        "expiresAt",
        "activateOnClaim"
      ], ["sessionId"]);
    }
    function validateBindCollaborationIntent(value) {
      return collaborationRequest(value, "bind collaboration intent", [
        "intentRef",
        "requestId",
        "payloadDigest",
        "acceptedSerializedText",
        "sessionId",
        "sessionGeneration",
        "bindingRevision"
      ], ["sessionId", "requestId"]);
    }
    function validateBindCollaborationContinuation(value) {
      return collaborationRequest(value, "bind collaboration continuation", [
        "sessionId",
        "requestId",
        "continuationRef",
        "bindingRevision",
        "payloadDigest",
        "acceptedSerializedText"
      ], ["sessionId", "requestId", "continuationRef", "payloadDigest", "acceptedSerializedText"]);
    }
    function validateCancelCollaborationIntent(value) {
      return collaborationRequest(value, "cancel collaboration intent", [
        "sessionId",
        "intentRef",
        "clientRequestId",
        "reason",
        "expectedStatus"
      ], ["sessionId"]);
    }
    function validateFollowupCollaborationTask(value) {
      return collaborationRequest(value, "followup collaboration task", [
        "sessionId",
        "taskId",
        "targetId",
        "expectedRevision",
        "goal",
        "inputRefs",
        "shareScope",
        "clientRequestId"
      ], ["sessionId", "taskId", "goal"]);
    }
    function validateCollaborationInspect(value) {
      return collaborationRequest(value, "inspect collaboration", ["sessionId", "taskId", "messageId"], ["sessionId", "taskId"]);
    }
    function validateCollaborationReconcile(value) {
      return collaborationRequest(value, "reconcile collaboration", [
        "sessionId",
        "clientRequestIds",
        "eventIds"
      ], ["sessionId"]);
    }
    function validateCollaborationEvents(value) {
      return collaborationRequest(value, "collaboration events", [
        "sessionId",
        "afterEventId"
      ], ["sessionId"]);
    }
    var SKILL_CATALOG_KEYS = /* @__PURE__ */ new Set([
      "workspaceId",
      "sessionId",
      "query",
      "cursor",
      "limit"
    ]);
    function validateSkillCatalog(value) {
      object(value, "Skill catalog request", SKILL_CATALOG_KEYS);
      const request = {
        workspaceId: id(value.workspaceId, "workspaceId"),
        sessionId: id(value.sessionId, "sessionId")
      };
      if (value.query !== void 0) request.query = textAllowEmpty(value.query, "query", 200);
      if (value.cursor !== void 0) request.cursor = text(value.cursor, "catalog cursor", 2048);
      if (value.limit !== void 0) {
        if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 50) {
          fail("limit must be an integer from 1 to 50");
        }
        request.limit = value.limit;
      }
      return request;
    }
    var SKILL_CONTENT_KEYS = /* @__PURE__ */ new Set([
      "workspaceId",
      "sessionId",
      "skillId",
      "path",
      "expectedVersionId",
      "expectedCommitSha",
      "offset",
      "maxBytes"
    ]);
    function validateSkillContent(value) {
      object(value, "Skill content request", SKILL_CONTENT_KEYS);
      const request = {
        workspaceId: id(value.workspaceId, "workspaceId"),
        sessionId: id(value.sessionId, "sessionId"),
        skillId: id(value.skillId, "skillId"),
        path: text(value.path, "Skill content path", 1024)
      };
      if (request.path.includes("\0")) fail("Skill content path is invalid");
      if (value.expectedVersionId !== void 0) {
        request.expectedVersionId = text(value.expectedVersionId, "expectedVersionId", 128);
      }
      if (value.expectedCommitSha !== void 0) {
        request.expectedCommitSha = text(value.expectedCommitSha, "expectedCommitSha", 64);
      }
      if (request.expectedVersionId !== void 0 && request.expectedCommitSha !== void 0) {
        fail("expectedVersionId and expectedCommitSha are mutually exclusive");
      }
      if (value.offset !== void 0) {
        if (!Number.isSafeInteger(value.offset) || value.offset < 0) {
          fail("offset must be a non-negative safe integer");
        }
        request.offset = value.offset;
      }
      if ((request.offset ?? 0) > 0 && request.expectedVersionId === void 0 && request.expectedCommitSha === void 0) {
        fail("a Skill content continuation requires an exact version");
      }
      if (value.maxBytes !== void 0) {
        if (!Number.isSafeInteger(value.maxBytes) || value.maxBytes < 1 || value.maxBytes > 32768) {
          fail("maxBytes must be an integer from 1 to 32768");
        }
        request.maxBytes = value.maxBytes;
      }
      return request;
    }
    function validateModelStatus(value) {
      return object(value, "Loop model status request", /* @__PURE__ */ new Set());
    }
    var MODEL_DISCONNECT_KEYS = /* @__PURE__ */ new Set(["connectionId"]);
    function validateDisconnectModelConnection(value) {
      object(value, "disconnect Loop model connection request", MODEL_DISCONNECT_KEYS);
      return { connectionId: id(value.connectionId, "connectionId") };
    }
    var MODEL_DEFAULT_KEYS = /* @__PURE__ */ new Set([
      "kind",
      "provider",
      "model",
      "connectionId",
      "workspaceId",
      "expectedServerRevision",
      "expectedAccountPrincipal"
    ]);
    var MODEL_DEFAULT_LOOP_KEYS = [
      "connectionId",
      "workspaceId",
      "expectedServerRevision",
      "expectedAccountPrincipal"
    ];
    function validateSetDefaultModel(value) {
      object(value, "set default model request", MODEL_DEFAULT_KEYS);
      if (value.kind !== "loop" && value.kind !== "external") {
        fail("model kind must be loop or external");
      }
      const request = {
        kind: value.kind,
        provider: id(value.provider, "model provider"),
        model: text(value.model, "model id", 512)
      };
      const loopRoute = request.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX);
      if (request.kind === "loop" !== loopRoute) {
        fail("model kind must match its provider route");
      }
      if (request.kind === "external") {
        if (MODEL_DEFAULT_LOOP_KEYS.some((key) => Object.hasOwn(value, key))) {
          fail("external model requests cannot carry Loop scope fields");
        }
        return request;
      }
      request.connectionId = id(value.connectionId, "connectionId");
      request.workspaceId = id(value.workspaceId, "workspaceId");
      request.expectedServerRevision = id(value.expectedServerRevision, "expectedServerRevision");
      request.expectedAccountPrincipal = text(
        value.expectedAccountPrincipal,
        "expectedAccountPrincipal",
        512
      ).trim();
      if (request.expectedAccountPrincipal === "") fail("expectedAccountPrincipal must not be blank");
      return request;
    }
    var MODEL_ENSURE_KEYS = /* @__PURE__ */ new Set([
      "connectionId",
      "hostSessionId",
      "modelId",
      "providerId",
      "source",
      "wireApi",
      "purpose"
    ]);
    function validateModelSession(value) {
      object(value, "Loop model session request", MODEL_ENSURE_KEYS);
      const request = {
        connectionId: id(value.connectionId, "connectionId"),
        hostSessionId: id(value.hostSessionId, "hostSessionId"),
        modelId: text(value.modelId, "modelId", 512),
        source: value.source,
        wireApi: value.wireApi
      };
      if (value.providerId !== void 0) request.providerId = text(value.providerId, "providerId", 512);
      if (!["loop_proxy", "loop_hosted", "loop_personal"].includes(request.source)) {
        fail("source must be loop_proxy, loop_hosted, or loop_personal");
      }
      if (request.source === "loop_personal" && (request.providerId === void 0 || request.providerId.trim() === "")) {
        fail("personal model providerId is required");
      }
      if (!["openai-completions", "openai-responses", "anthropic-messages"].includes(request.wireApi)) {
        fail("wireApi is invalid");
      }
      if (value.purpose !== void 0) {
        if (!["conversation", "compaction", "session-title"].includes(value.purpose)) {
          fail("purpose is invalid");
        }
        request.purpose = value.purpose;
      }
      return request;
    }
    var MODEL_CLOSE_KEYS = /* @__PURE__ */ new Set(["hostSessionId"]);
    function validateCloseModelSession(value) {
      object(value, "close Loop model session request", MODEL_CLOSE_KEYS);
      return { hostSessionId: id(value.hostSessionId, "hostSessionId") };
    }
    function schema(validate) {
      return {
        parse: validate,
        safeParse(value) {
          try {
            return { success: true, data: validate(value) };
          } catch (error) {
            return { success: false, error };
          }
        },
        jsonSchema: { type: "object" }
      };
    }
    var workspaceRefSchema = schema(validateWorkspaceRef);
    var beginBindSchema = schema(validateBeginBind);
    var completeBindSchema = schema(validateCompleteBind);
    var unbindSchema = schema(validateUnbind);
    var disconnectAccountSchema = schema(validateDisconnectAccount);
    var sessionRefSchema = schema(validateSessionRef);
    var setSyncSchema = schema(validateSetSync);
    var createProjectSchema = schema(validateCreateProject);
    var globalPageSchema = schema(validateGlobalPage);
    var configureGlobalServerSchema = schema(validateConfigureGlobalServer);
    var configureGlobalServerWorkspaceSchema = schema(validateConfigureGlobalServerWorkspace);
    var openLoopPageSchema = schema(validateOpenLoopPage);
    var projectSyncSettingsSchema = schema(validateProjectSyncSettingsRequest);
    var setProjectSyncSettingsSchema = schema(validateSetProjectSyncSettings);
    var syncProjectsSchema = schema(validateSyncProjects);
    var changeProjectDirectorySchema = schema(validateChangeProjectDirectory);
    var collaborationStatusSchema = schema(validateCollaborationStatus);
    var collaborationSnapshotSchema = schema(validateCollaborationSnapshot);
    var collaborationBoardsSchema = schema(validateCollaborationBoards);
    var collaborationBindSchema = schema(validateCollaborationBind);
    var collaborationDirectorySchema = schema(validateCollaborationDirectory);
    var prepareCollaborationIntentSchema = schema(validatePrepareCollaborationIntent);
    var bindCollaborationIntentSchema = schema(validateBindCollaborationIntent);
    var bindCollaborationContinuationSchema = schema(validateBindCollaborationContinuation);
    var cancelCollaborationIntentSchema = schema(validateCancelCollaborationIntent);
    var followupCollaborationTaskSchema = schema(validateFollowupCollaborationTask);
    var collaborationInspectSchema = schema(validateCollaborationInspect);
    var collaborationReconcileSchema = schema(validateCollaborationReconcile);
    var collaborationEventsSchema = schema(validateCollaborationEvents);
    var skillCatalogSchema = schema(validateSkillCatalog);
    var skillContentSchema = schema(validateSkillContent);
    var modelStatusSchema = schema(validateModelStatus);
    var disconnectModelConnectionSchema = schema(validateDisconnectModelConnection);
    var setDefaultModelSchema = schema(validateSetDefaultModel);
    var modelSessionSchema = schema(validateModelSession);
    var closeModelSessionSchema = schema(validateCloseModelSession);
    function validateConnectAccount(value) {
      object(value, "connect account request", /* @__PURE__ */ new Set(["workspaceId", "principalId", "expectedServerRevision", "locale", "recoverCredentials", "accessToken", "requestPageAccess"]));
      const result = { expectedServerRevision: id(value.expectedServerRevision, "expectedServerRevision") };
      if (value.workspaceId !== void 0) result.workspaceId = id(value.workspaceId, "workspaceId");
      if (value.principalId !== void 0) result.principalId = id(value.principalId, "principalId");
      if (value.locale !== void 0) {
        if (!["zh", "en"].includes(value.locale)) fail("locale must be zh or en");
        result.locale = value.locale;
      }
      if (value.requestPageAccess !== void 0) {
        if (value.requestPageAccess !== true || value.accessToken !== void 0 || value.recoverCredentials) fail("Invalid page authorization request");
        result.requestPageAccess = true;
      }
      if (value.accessToken !== void 0) {
        if (typeof value.accessToken !== "string" || !/^loop_dsh_[A-Za-z0-9_-]{43}$/u.test(value.accessToken) || value.recoverCredentials) fail("A personal assistant DSH token is required");
        result.accessToken = value.accessToken;
      }
      if (value.recoverCredentials !== void 0) {
        if (value.recoverCredentials !== true) fail("recoverCredentials must be true when specified");
        result.recoverCredentials = true;
      }
      return result;
    }
    var connectAccountSchema = schema(validateConnectAccount);
    function validateKnowledgeCatalog(value) {
      object(value, "knowledge catalog request", /* @__PURE__ */ new Set(["workspaceId", "sessionId", "cursor", "kbId"]));
      return {
        workspaceId: id(value.workspaceId, "workspaceId"),
        sessionId: id(value.sessionId, "sessionId"),
        ...value.cursor === void 0 ? {} : { cursor: text(value.cursor, "cursor", 16) },
        ...value.kbId === void 0 ? {} : { kbId: text(value.kbId, "kbId", 255) }
      };
    }
    var knowledgeCatalogSchema = schema(validateKnowledgeCatalog);
    function humanConnection(value) {
      if (value.connection !== "business" && value.connection !== "apps") fail("Select a Human connection");
      return { connection: value.connection };
    }
    var humanTaskSessionSchema = schema((value) => {
      object(value, "Task", /* @__PURE__ */ new Set(["sessionId"]));
      return { sessionId: id(value.sessionId, "sessionId") };
    });
    var humanTaskDecisionSchema = schema((value) => {
      object(value, "Task authorization", /* @__PURE__ */ new Set(["sessionId", "requestId", "decision", "resourceUrl"]));
      if (value.decision === "select" && (typeof value.resourceUrl !== "string" || value.resourceUrl.length > 2048)) fail("A resource link is required");
      if (!["reuse", "cancel", "select"].includes(value.decision)) fail("Unknown task authorization decision");
      return { sessionId: id(value.sessionId, "sessionId"), requestId: id(value.requestId, "requestId"), decision: value.decision, ...value.decision === "select" ? { resourceUrl: value.resourceUrl } : {} };
    });
    var humanConnectionSchema = schema((value) => {
      return humanConnection(object(value, "Human connection", /* @__PURE__ */ new Set(["connection"])));
    });
    var humanChallengeSchema = schema((value) => {
      object(value, "Human connection challenge", /* @__PURE__ */ new Set(["connection", "challengeId"]));
      return { ...humanConnection(value), challengeId: id(value.challengeId, "challengeId") };
    });
    function selectors(value, label, pattern, min) {
      if (!Array.isArray(value) || value.length < min || value.length > 128 || value.some((item) => typeof item !== "string" || Buffer.byteLength(item) > 512 || !pattern.test(item)) || new Set(value).size !== value.length) fail(`${label} must contain distinct exact identifiers`);
      return [...value];
    }
    var humanLoginSchema = schema((value) => {
      object(value, "Human delegation request", /* @__PURE__ */ new Set(["connection", "allowedActions", "resourceConstraints", "manage"]));
      const connection = humanConnection(value);
      if (value.manage !== void 0 && typeof value.manage !== "boolean") fail("manage must be a boolean");
      return {
        ...connection,
        manage: value.manage === true,
        allowedActions: selectors(value.allowedActions, "allowedActions", /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u, 1),
        resourceConstraints: selectors(value.resourceConstraints ?? [], "resourceConstraints", /^[a-z][a-z0-9-]*:[^,:*?\x00-\x1f\x7f]+$/u, 0)
      };
    });
    var syncPreferencesSchema = schema((value) => {
      object(value, "sync preferences", /* @__PURE__ */ new Set(["uploadDisconnectedHistory"]));
      if (typeof value.uploadDisconnectedHistory !== "boolean") fail("uploadDisconnectedHistory must be boolean");
      return { uploadDisconnectedHistory: value.uploadDisconnectedHistory };
    });

    // remote.mjs
    var PACKAGE = "@pingkai/loop-dsh";
    var SERVICE = "loopHostService";
    var NAMESPACE = "loopHost";
    function codec(create, typeSymbol) {
      return {
        mode: "strict",
        typeSymbol,
        create: () => schemaValue(create)
      };
    }
    function schemaValue(create) {
      const value = create();
      return {
        parse: (input) => value.parse(input),
        safeParse: (input) => value.safeParse(input),
        jsonSchema: value.jsonSchema
      };
    }
    function method(name2, requestSchema, requestType) {
      return {
        service: SERVICE,
        invocation: { kind: "direct" },
        parameters: [{
          name: "request",
          wire: "request",
          source: "json",
          codec: codec(() => requestSchema, requestType),
          strictCodec: codec(() => requestSchema, requestType)
        }],
        cancellation: { parameter: "signal" },
        result: codec(() => genericResult, "unknown")
      };
    }
    function streamMethod(name2, requestSchema, requestType) {
      return {
        ...method(name2, requestSchema, requestType),
        mode: "stream",
        cancellation: { parameter: "signal" }
      };
    }
    var genericResult = {
      parse: (value) => value,
      safeParse(value) {
        try {
          return { success: true, data: value };
        } catch (error) {
          return { success: false, error };
        }
      },
      jsonSchema: {}
    };
    var descriptors = [];
    var methods = /* @__PURE__ */ Object.create(null);
    for (const [name2, requestSchema, requestType, isStream = false] of [
      ["status", workspaceRefSchema, "WorkspaceRef"],
      ["connectAccount", connectAccountSchema, "ConnectAccountRequest"],
      ["beginBind", beginBindSchema, "BeginBindRequest"],
      ["completeBind", completeBindSchema, "CompleteBindRequest"],
      ["unbind", unbindSchema, "UnbindRequest"],
      ["disconnectAccount", disconnectAccountSchema, "DisconnectAccountRequest"],
      ["sessionContext", sessionRefSchema, "SessionRef"],
      ["syncStatus", sessionRefSchema, "SessionRef"],
      ["setSync", setSyncSchema, "SetSyncRequest"],
      ["createProject", createProjectSchema, "CreateProjectRequest"],
      ["globalServerStatus", globalPageSchema, "GlobalServerStatusRequest"],
      ["globalServerWorkspaceStatus", globalPageSchema, "GlobalServerWorkspaceStatusRequest"],
      ["configureGlobalServer", configureGlobalServerSchema, "ConfigureGlobalServerRequest"],
      ["configureGlobalServerWorkspace", configureGlobalServerWorkspaceSchema, "ConfigureGlobalServerWorkspaceRequest"],
      ["globalPage", globalPageSchema, "GlobalPageRequest"],
      ["openLoopPage", openLoopPageSchema, "OpenLoopPageRequest"],
      ["retrySync", sessionRefSchema, "SessionRef"],
      ["humanTaskEvents", humanTaskSessionSchema, "HumanTaskSession", true],
      ["decideHumanTask", humanTaskDecisionSchema, "HumanTaskDecision"],
      ["humanStatus", humanConnectionSchema, "HumanConnectionRequest"],
      ["beginHumanLogin", humanLoginSchema, "BeginHumanLoginRequest"],
      ["completeHumanLogin", humanChallengeSchema, "HumanChallengeRequest"],
      ["cancelHumanLogin", humanChallengeSchema, "HumanChallengeRequest"],
      ["disconnectHuman", humanConnectionSchema, "HumanConnectionRequest"],
      ["getSyncPreferences", globalPageSchema, "SyncPreferencesRequest"],
      ["setSyncPreferences", syncPreferencesSchema, "SyncPreferences"],
      ["projectSyncSettings", projectSyncSettingsSchema, "ProjectSyncSettingsRequest"],
      ["setProjectSyncSettings", setProjectSyncSettingsSchema, "SetProjectSyncSettingsRequest"],
      ["syncProjects", syncProjectsSchema, "SyncProjectsRequest"],
      ["changeProjectDirectory", changeProjectDirectorySchema, "ChangeProjectDirectoryRequest"],
      ["collaborationStatus", collaborationStatusSchema, "CollaborationStatusRequest"],
      ["collaborationSnapshot", collaborationSnapshotSchema, "CollaborationSnapshotRequest"],
      ["collaborationBoards", collaborationBoardsSchema, "CollaborationBoardsRequest"],
      ["collaborationBind", collaborationBindSchema, "CollaborationBindRequest"],
      ["collaborationDirectory", collaborationDirectorySchema, "CollaborationDirectoryRequest"],
      ["prepareCollaborationIntent", prepareCollaborationIntentSchema, "PrepareCollaborationIntentRequest"],
      ["bindCollaborationIntent", bindCollaborationIntentSchema, "BindCollaborationIntentRequest"],
      ["bindCollaborationContinuation", bindCollaborationContinuationSchema, "BindCollaborationContinuationRequest"],
      ["cancelCollaborationIntent", cancelCollaborationIntentSchema, "CancelCollaborationIntentRequest"],
      ["followupCollaborationTask", followupCollaborationTaskSchema, "FollowupCollaborationTaskRequest"],
      ["collaborationInspect", collaborationInspectSchema, "CollaborationInspectRequest"],
      ["collaborationReconcile", collaborationReconcileSchema, "CollaborationReconcileRequest"],
      ["collaborationEvents", collaborationEventsSchema, "CollaborationEventsRequest", true],
      ["knowledgeCatalog", knowledgeCatalogSchema, "KnowledgeCatalogRequest"],
      ["skillCatalog", skillCatalogSchema, "SkillCatalogRequest"],
      ["skillContent", skillContentSchema, "SkillContentRequest"],
      ["skillCatalogEvents", sessionRefSchema, "SessionRef", true],
      ["modelStatus", modelStatusSchema, "ModelStatusRequest"],
      ["refreshModelConnections", modelStatusSchema, "RefreshModelConnectionsRequest"],
      ["disconnectModelConnection", disconnectModelConnectionSchema, "DisconnectModelConnectionRequest"],
      ["setDefaultModel", setDefaultModelSchema, "SetDefaultModelRequest"]
    ]) {
      const definition = isStream ? streamMethod(name2, requestSchema, requestType) : method(name2, requestSchema, requestType);
      const endpoint = `${NAMESPACE}/${name2}`;
      const descriptor = {
        ...definition,
        id: `${PACKAGE}#${endpoint}`,
        namespace: NAMESPACE,
        method: name2,
        result: {
          ...codec(() => genericResult, "unknown"),
          description: `${name2} result`
        }
      };
      const strictInput = {
        parse: (input) => validateNamedRequest(input, requestSchema),
        safeParse(input) {
          try {
            return { success: true, data: validateNamedRequest(input, requestSchema) };
          } catch (error) {
            return { success: false, error };
          }
        },
        create: () => ({
          parse: (input) => validateNamedRequest(input, requestSchema),
          safeParse(input) {
            try {
              return { success: true, data: validateNamedRequest(input, requestSchema) };
            } catch (error) {
              return { success: false, error };
            }
          },
          jsonSchema: {
            type: "object",
            properties: { request: requestSchema.jsonSchema },
            required: ["request"],
            additionalProperties: false
          }
        }),
        jsonSchema: {
          type: "object",
          properties: { request: requestSchema.jsonSchema },
          required: ["request"],
          additionalProperties: false
        }
      };
      descriptor.input = () => strictInput;
      descriptor.invoke = (remote, input, signal) => {
        const receiver = remote.loopHost;
        return receiver[name2](requestSchema.parse(input.request), signal);
      };
      descriptors.push(descriptor);
      methods[endpoint] = descriptor;
    }
    function validateNamedRequest(input, requestSchema) {
      if (input === null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, "request")) {
        throw new TypeError("Loop Host input requires exactly one request field");
      }
      return { request: requestSchema.parse(input.request) };
    }
    var TYPERT_REMOTE = Object.freeze({
      package: PACKAGE,
      descriptors: Object.freeze(descriptors),
      methods: Object.freeze(methods)
    });
    var remote_default = TYPERT_REMOTE;

    // client/ui/input-catalog-cache.ts
    function catalogScopeKey(catalog, sessionId, scope) {
      return JSON.stringify([
        catalog,
        sessionId,
        scope.serverBaseUrl,
        scope.accountId,
        scope.installationId,
        scope.workspaceId,
        scope.hostWorkspaceId ?? "",
        scope.bindingId ?? "",
        scope.bindingRevision ?? "",
        scope.bindingEpoch ?? "",
        scope.projectId ?? "",
        scope.agentId ?? "",
        scope.identityFingerprint ?? ""
      ]);
    }
    var InputCatalogCache = class {
      fetchPage;
      identity;
      entries = [];
      nextCursor;
      complete = false;
      revision = "";
      dirty = false;
      loaded = false;
      loadedPages = 0;
      generation = 0;
      firstLoad = null;
      nextLoad = null;
      constructor(identity, fetchPage) {
        this.identity = identity;
        this.fetchPage = fetchPage;
      }
      setIdentity(identity) {
        if (sameIdentity(this.identity, identity)) return false;
        this.identity = identity;
        this.reset();
        return true;
      }
      adoptAcceptedIdentity(identity, generation) {
        if (generation !== this.generation) return false;
        if (sameIdentity(this.identity, identity)) return false;
        this.identity = identity;
        if (this.loaded) {
          this.entries = [];
          this.nextCursor = void 0;
          this.complete = false;
          this.revision = "";
          this.loaded = false;
          this.loadedPages = 0;
        }
        return true;
      }
      scopeIdentity() {
        return this.identity;
      }
      reset() {
        this.generation += 1;
        this.entries = [];
        this.nextCursor = void 0;
        this.complete = false;
        this.revision = "";
        this.dirty = false;
        this.loaded = false;
        this.loadedPages = 0;
        this.firstLoad = null;
        this.nextLoad = null;
      }
      invalidate() {
        this.generation += 1;
        this.dirty = true;
        this.firstLoad = null;
        this.nextLoad = null;
        return true;
      }
      state() {
        return {
          loaded: this.loaded,
          dirty: this.dirty,
          complete: this.complete,
          loadedPages: this.loadedPages,
          revision: this.revision
        };
      }
      async ensureLoaded(signal) {
        if (this.loaded && !this.dirty) return this.entries;
        if (this.firstLoad !== null) {
          try {
            await this.firstLoad.promise;
          } catch (error) {
            if (signal.aborted) throw error;
            return await this.ensureLoaded(signal);
          }
          if (this.dirty) return await this.ensureLoaded(signal);
          return this.entries;
        }
        const generation = this.generation;
        const promise = this.loadFirst(signal, generation).finally(() => {
          if (this.firstLoad?.promise === promise) this.firstLoad = null;
        });
        this.firstLoad = { generation, promise };
        await promise;
        if (generation !== this.generation) return await this.ensureLoaded(signal);
        if (this.dirty) return await this.ensureLoaded(signal);
        return this.entries;
      }
      async find(query, matches, signal, maxAdditionalPages = 2) {
        let entries = await this.ensureLoaded(signal);
        const folded = query.trim().toLocaleLowerCase();
        if (folded === "") return entries;
        let found = entries.filter((entry) => matches(entry, folded));
        let pages = 0;
        while (found.length === 0 && !this.complete && pages < maxAdditionalPages) {
          pages += 1;
          const loaded = await this.loadNext(signal);
          if (!loaded) {
            entries = await this.ensureLoaded(signal);
            found = entries.filter((entry) => matches(entry, folded));
            continue;
          }
          signal.throwIfAborted();
          entries = this.entries;
          found = entries.filter((entry) => matches(entry, folded));
        }
        return found;
      }
      async loadFirst(signal, generation) {
        signal.throwIfAborted();
        const page = await this.fetchPage(void 0, signal);
        signal.throwIfAborted();
        if (generation !== this.generation) return;
        if (page.identity !== void 0) this.adoptAcceptedIdentity(page.identity, generation);
        this.entries = [...page.items];
        this.revision = page.revision;
        this.nextCursor = page.nextCursor;
        this.complete = !page.hasMore && page.nextCursor === void 0 && page.truncated !== true;
        this.loaded = true;
        this.loadedPages = 1;
        this.dirty = false;
      }
      async loadNext(signal) {
        signal.throwIfAborted();
        if (this.complete || this.nextCursor === void 0) return true;
        const cursor = this.nextCursor;
        const generation = this.generation;
        if (this.nextLoad !== null && this.nextLoad.generation === generation && this.nextLoad.cursor === cursor) {
          try {
            return await this.nextLoad.promise;
          } catch (error) {
            if (signal.aborted) throw error;
            return await this.loadNext(signal);
          }
        }
        const promise = (async () => {
          const page = await this.fetchPage(cursor, signal);
          signal.throwIfAborted();
          if (generation !== this.generation) return false;
          if (page.identity !== void 0 && !sameIdentity(page.identity, this.identity) || page.revision !== "" && this.revision !== "" && page.revision !== this.revision) {
            this.generation += 1;
            this.dirty = true;
            return false;
          }
          this.entries = [...this.entries, ...page.items];
          this.revision = page.revision || this.revision;
          this.nextCursor = page.nextCursor;
          this.complete = !page.hasMore && page.nextCursor === void 0 && page.truncated !== true;
          this.loadedPages += 1;
          return true;
        })().finally(() => {
          if (this.nextLoad?.promise === promise) this.nextLoad = null;
        });
        this.nextLoad = { generation, cursor, promise };
        return await promise;
      }
    };
    function sameIdentity(left, right) {
      return left.serverBaseUrl === right.serverBaseUrl && left.accountId === right.accountId && left.installationId === right.installationId && left.workspaceId === right.workspaceId && left.hostWorkspaceId === right.hostWorkspaceId && left.bindingId === right.bindingId && left.bindingRevision === right.bindingRevision && left.bindingEpoch === right.bindingEpoch && left.projectId === right.projectId && left.agentId === right.agentId && left.identityFingerprint === right.identityFingerprint;
    }

    // client/ui/loop-catalog-display.ts
    function loopCatalogDisplayName(name2) {
      return `Loop \xB7 ${name2}`;
    }

    // client/ui/loop-knowledge-runtime.ts
    var sourceName = "loop-knowledge";
    function encodeKnowledgeReference(ref) {
      const bytes = new TextEncoder().encode(JSON.stringify(ref));
      return `<loop-knowledge-ref>${btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "")}</loop-knowledge-ref>`;
    }
    function decodeKnowledgeReference(value) {
      const match = /^<loop-knowledge-ref>([A-Za-z0-9_-]{1,8192})<\/loop-knowledge-ref>$/u.exec(value);
      if (match === null) throw new Error("Invalid Loop knowledge reference");
      const encoded = match[1].replace(/-/gu, "+").replace(/_/gu, "/");
      const ref = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), (c) => c.charCodeAt(0))));
      if (ref?.version !== 1 || typeof ref.sessionId !== "string" || !ref.sessionId || typeof ref.kbId !== "string" || !ref.kbId || ref.kbId.length > 255 || typeof ref.name !== "string" || !ref.name || ref.name.length > 1024) throw new Error("Invalid Loop knowledge reference");
      return { version: 1, sessionId: ref.sessionId, kbId: ref.kbId, name: ref.name };
    }
    var LoopKnowledgeRuntime = class {
      sessions = /* @__PURE__ */ new Map();
      options;
      constructor(options) {
        this.options = options;
      }
      session(sessionId) {
        const workspaceId = this.options.workspaceForSession(sessionId)?.workspaceId;
        if (!workspaceId) throw new Error(this.options.failureText);
        const previous = this.sessions.get(sessionId);
        if (previous?.workspaceId === workspaceId && !previous.controller.signal.aborted) return previous;
        previous?.controller.abort();
        if (this.sessions.size >= 64) {
          const oldest = this.sessions.keys().next().value;
          if (oldest !== void 0) {
            this.sessions.get(oldest)?.controller.abort();
            this.sessions.delete(oldest);
          }
        }
        const controller = new AbortController();
        const cache = new InputCatalogCache({ serverBaseUrl: "", accountId: "", installationId: "", workspaceId }, async (cursor, signal) => {
          if (!this.options.remote.knowledgeCatalog) throw new Error(this.options.failureText);
          const result = await this.options.remote.knowledgeCatalog({ workspaceId, sessionId, ...cursor ? { cursor } : {} }, signal);
          if (!result.ok) throw new Error(`${this.options.failureText} (${result.error.code}) ${result.error.message}`);
          const { scope, data } = result.value;
          if (scope.sessionId !== sessionId || scope.hostWorkspaceId !== workspaceId) throw new Error(this.options.failureText);
          return { ...data, revision: "", identity: scope };
        });
        const entry = { workspaceId, cache, controller };
        this.sessions.set(sessionId, entry);
        void (async () => {
          try {
            for await (const frame of this.options.catalogEvents(sessionId, controller.signal)) {
              if (controller.signal.aborted) break;
              if (frame.type === "ready" || frame.event.kind === "catalog.changed" || frame.event.kind === "subscription.changed") cache.invalidate();
            }
          } catch {
          } finally {
            cache.invalidate();
            controller.abort();
          }
        })();
        return entry;
      }
      registerSource(inputTriggers, section) {
        const owner = this;
        const source = {
          trigger: "/",
          name: sourceName,
          order: 26,
          showGroupTitle: true,
          codec: {
            clipboardText: (value) => {
              try {
                return `/${decodeKnowledgeReference(value).name}`;
              } catch {
                return "";
              }
            },
            serialize: async (value, signal) => {
              signal.throwIfAborted();
              try {
                const ref = decodeKnowledgeReference(value);
                if (!owner.options.workspaceForSession(ref.sessionId)) throw new Error();
                return encodeKnowledgeReference(ref);
              } catch {
                throw new Error(owner.options.failureText);
              }
            }
          },
          async candidates(session, request) {
            try {
              const { cache } = owner.session(session.sessionId);
              const entries = await cache.find(
                request.query.replace(/^loop(?:\s*[·:]\s*|\s+|$)/iu, ""),
                (entry, query) => loopCatalogDisplayName(entry.name).toLocaleLowerCase().includes(query) || entry.kbId.toLocaleLowerCase().includes(query),
                request.signal,
                2
              );
              return [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.kbId.localeCompare(b.kbId)).map((entry) => ({
                name: loopCatalogDisplayName(entry.name),
                label: loopCatalogDisplayName(entry.name),
                section,
                description: section,
                hint: entry.kbId,
                value: encodeKnowledgeReference({ ...entry, sessionId: session.sessionId, version: 1 })
              }));
            } catch (error) {
              if (request.signal.aborted) return [];
              owner.options.showFailure(error instanceof Error ? error.message : owner.options.failureText);
              throw error;
            }
          },
          onPick(pick) {
            if (pick.action !== "pick" || typeof pick.candidate.value !== "string") return;
            try {
              const ref = decodeKnowledgeReference(pick.candidate.value);
              if (ref.sessionId !== pick.session.sessionId) return;
              return { insert: { source: sourceName, ref: encodeKnowledgeReference(ref), label: loopCatalogDisplayName(ref.name), appearance: "skill", clipboardText: `/${ref.name}` } };
            } catch {
              owner.options.showFailure(owner.options.failureText);
            }
          }
        };
        return inputTriggers.registerSource(source);
      }
      dispose() {
        for (const entry of this.sessions.values()) entry.controller.abort();
        this.sessions.clear();
      }
    };

    // client/ui/store.ts
    function createSnapshotStore(initial) {
      let current = initial;
      const listeners = /* @__PURE__ */ new Set();
      return {
        getSnapshot: () => current,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set(next) {
          if (Object.is(next, current)) return;
          current = next;
          for (const listener of [...listeners]) listener();
        }
      };
    }

    // client/ui/failure-text.ts
    function safeFailureText(value) {
      return value.slice(0, 320).replace(/\b(?:https?|wss?):\/\/\S+/giu, "[link hidden]").replace(/\b(token|cookie|authorization|code|secret)\s*[=:]\s*\S+/giu, "$1 [hidden]").replace(/[A-Za-z0-9_-]{24,}/gu, "[value hidden]").trim();
    }
    function failureText(t, failure2) {
      switch (failure2.code) {
        case "loop/transport":
          return t("error.transport");
        case "loop-host/backend-unavailable":
          return t("error.backendUnavailable");
        case "loop-host/credential-recovery-disabled":
          return t("error.credentialRecoveryDisabled");
        case "loop-host/credential-unavailable":
          return t("error.credentialUnavailable");
        case "loop-host/timeout":
          return t("error.timeout");
        case "loop/server-url-invalid":
          return t("error.serverUrl");
        case "loop-host/workspace-required":
          return t("error.workspaceRequired");
        case "loop/host-update-required":
          return t("error.hostUpdate");
        case "loop/selection-required":
          return t("error.selection");
        case "loop/popup-blocked":
          return t("error.popup");
        case "loop/challenge-required":
          return t("error.challenge");
        case "loop-host/challenge-expired":
          return t("error.challengeExpired");
        case "loop-host/needs-auth":
          return t("error.needsAuth");
        case "loop-host/waiting-for-access":
          return t("dialog.waitingBody");
        case "loop/sync-error":
          return t("error.sync");
        case "loop/project-prefix-invalid":
          return t("error.projectPrefix");
        case "loop/project-target":
          return t("error.projectTarget");
        case "loop/sync-unbound":
          return t("dialog.syncUnavailable");
        case "loop/sync-needs_auth":
          return t("dialog.syncAuth");
        default:
          return t("error.generic");
      }
    }
    function collaborationFailureText(t, failure2) {
      switch (failure2.code) {
        case "loop-host/waiting-for-access":
          return t("collab.error.permission");
        case "loop-host/needs-auth":
        case "loop-host/revoked":
          return t("collab.error.auth");
        case "loop-host/timeout":
        case "loop-host/backend-unavailable":
          return t("collab.error.offline");
        case "loop-collaboration/cancelled":
          return t("collab.notice.intentDiscarded");
        case "loop-collaboration/human-disabled":
          return t("collab.error.humanDisabled");
        case "loop-collaboration/not-bound":
          return t("collab.error.notBound");
        case "loop-collaboration/access-required":
        case "loop-collaboration/permission-denied":
          return t("collab.error.needsAccess");
        case "loop-collaboration/auth-required":
          return t("collab.error.auth");
        case "loop-collaboration/binding-stale":
          return t("collab.error.bindingStale");
        case "loop-collaboration/intent-expired":
          return t("collab.error.intentExpired");
        case "loop-collaboration/intent-already-bound":
        case "loop-collaboration/action-conflict":
          return t("collab.error.intentConflict");
        case "loop-collaboration/intent-digest-mismatch":
        case "loop-collaboration/intent-not-accepted":
          return t("collab.error.payloadMismatch");
        case "loop-collaboration/capability-unsupported":
        case "loop-collaboration/target-unavailable":
          return t("collab.error.unsupported");
        case "loop-host/conflict":
        case "loop-host/invalid-request":
          return t("collab.error.bindFailed");
        case "loop-collaboration/result-unknown":
        case "loop-collaboration/action-unknown":
          return t("collab.error.resultUnknown");
        case "loop-collaboration/queue-full":
          return t("collab.error.queue");
        case "loop-collaboration/storage-full":
          return t("collab.error.storage");
        case "loop-collaboration/proxy-offline":
        case "loop-collaboration/server-unavailable":
          return t("collab.error.offline");
        case "loop-collaboration/session-unavailable":
          return t("collab.error.session");
        default:
          return t("collab.error.internal");
      }
    }
    function skillCatalogFailureText(t, failure2) {
      switch (failure2.code) {
        case "loop-host/needs-auth":
        case "loop-host/revoked":
          return t("skill.error.auth");
        case "loop-host/capability-unsupported":
          return t("skill.error.hostUpdate");
        case "loop-host/backend-unavailable":
        case "loop-host/timeout":
          return t("skill.error.offline");
        case "loop-host/queue-full":
          return t("skill.error.busy");
        case "loop-host/workspace-required":
        case "loop-host/session-unavailable":
        case "loop-skill/session-mismatch":
        case "loop-skill/session-inactive":
          return t("skill.error.session");
        case "loop-host/cancelled":
          return t("skill.error.cancelled");
        case "loop-host/conflict":
        case "loop-skill/binding-stale":
          return t("skill.error.bindingStale");
        case "loop-skill/content-too-large":
          return t("skill.error.tooLarge");
        case "loop-skill/invalid-reference":
        case "loop-skill/invalid-version-handle":
        case "loop-skill/reference-too-large":
          return t("skill.error.reference");
        case "loop-skill/unsupported-path":
          return t("skill.error.path");
        case "loop-host/invalid-request":
        case "loop-host/backend-invalid":
        case "loop-host/action-failed":
        case "loop-skill/content-empty":
          return t("skill.error.unavailable");
        default:
          return t("error.loopSkills");
      }
    }

    // client/ui/account-connection-controller.ts
    var AccountConnectionController = class {
      constructor(remote, page, models, locale, openExternal2 = () => false) {
        this.remote = remote;
        this.page = page;
        this.models = models;
        this.locale = locale;
        this.openExternal = openExternal2;
        this.disposers = [
          page.store.subscribe(() => this.update()),
          page.sharedData.store.subscribe(() => this.update()),
          models.store.subscribe(() => this.updateModel())
        ];
      }
      remote;
      page;
      models;
      locale;
      openExternal;
      store = createSnapshotStore({ phase: "idle", error: null });
      recovery = false;
      active = false;
      generation = 0;
      request = null;
      timer = null;
      scope = "";
      challenge = "";
      modelRetries = 0;
      external = null;
      preparingModels = false;
      disposers;
      errorGrant;
      accessToken;
      start(external = null, accessToken) {
        this.cancel();
        this.accessToken = accessToken;
        this.external = external;
        this.active = true;
        this.store.set({ phase: "waiting", error: null });
        this.update();
      }
      /** Cancel any old login before sign-out or a new server selection. */
      reset() {
        this.cancel();
        this.store.set({ phase: "idle", error: null });
      }
      recover(external = null) {
        if (this.store.getSnapshot().error?.code !== "loop-host/credential-unavailable") return;
        this.cancel();
        this.external = external;
        this.recovery = true;
        this.active = true;
        this.store.set({ phase: "recovering", error: null });
        this.update();
      }
      cancelRecovery() {
        if (this.store.getSnapshot().phase !== "recovering") return;
        this.cancel();
        this.store.set({ phase: "error", error: { code: "loop-host/credential-unavailable", message: "" } });
      }
      dispose() {
        this.cancel();
        this.disposers.forEach((dispose) => dispose());
      }
      cancel() {
        this.accessToken = void 0;
        this.active = false;
        this.preparingModels = false;
        this.external?.close();
        this.external = null;
        this.recovery = false;
        this.generation += 1;
        this.request?.abort();
        this.request = null;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.scope = "";
        this.challenge = "";
        this.modelRetries = 0;
      }
      update() {
        const page = this.page.store.getSnapshot();
        if (!this.active) {
          if (this.store.getSnapshot().phase === "error" && page.connection?.state === "signed_in" && page.connection.grantId && page.connection.grantId !== this.errorGrant) this.reset();
          return;
        }
        const key = page.serverRevision;
        if (this.scope !== "" && (page.serverBusy || key !== "" && key !== this.scope)) {
          this.cancel();
          this.store.set({ phase: "error", error: { code: "loop-host/conflict", message: "" } });
          return;
        }
        if (this.scope !== "" || page.serverUrl === null || key === "" || page.serverBusy) return;
        this.scope = key;
        const generation = this.generation;
        const requestPageAccess = !this.accessToken && !this.recovery && page.connection?.deviceOnly === true && page.connection.state === "signed_in";
        const input = { ...requestPageAccess ? { requestPageAccess: true } : {}, expectedServerRevision: page.serverRevision, locale: this.locale() };
        let pageChallengeExpiry = 0;
        const poll = async () => {
          if (generation !== this.generation) return;
          if (pageChallengeExpiry && Date.now() >= pageChallengeExpiry) {
            this.fail("loop-host/challenge-expired");
            return;
          }
          if (this.remote.connectAccount === void 0) {
            this.fail("loop/host-update-required");
            return;
          }
          this.request = new AbortController();
          try {
            const accessToken = this.accessToken;
            this.accessToken = void 0;
            const recoverCredentials = this.recovery;
            this.recovery = false;
            const result = await this.remote.connectAccount({
              ...input,
              ...accessToken ? { accessToken } : {},
              ...recoverCredentials ? { recoverCredentials: true } : {}
            }, this.request.signal);
            if (generation !== this.generation) return;
            if (!result.ok) {
              this.fail(result.error.code, result.error.message);
              return;
            }
            if (result.value.state === "connected") {
              this.active = false;
              this.external?.close();
              this.external = null;
              this.preparingModels = true;
              this.store.set({ phase: "ready", error: null });
              void this.page.reconnect();
              void this.models.open(true).then(() => this.updateModel());
              return;
            }
            if (accessToken) {
              this.fail("loop/host-update-required");
              return;
            }
            const challenge = result.value.challenge;
            if (requestPageAccess) pageChallengeExpiry = Date.parse(challenge.expiresAt);
            if (this.challenge !== challenge.id) {
              if (!(this.external?.open(challenge.loginUrl) ?? this.openExternal(challenge.loginUrl))) {
                this.fail("loop/popup-blocked");
                return;
              }
              this.challenge = challenge.id;
            }
            this.store.set({ phase: "connecting", error: null });
            this.timer = setTimeout(() => {
              this.timer = null;
              void poll();
            }, 800);
          } catch (error) {
            if (generation === this.generation) this.fail("loop/transport", error instanceof Error ? error.message : "");
          }
        };
        void poll();
      }
      updateModel() {
        if (!this.preparingModels) return;
        const state = this.models.store.getSnapshot();
        const readiness = state.readiness;
        if (state.busy !== null || readiness.kind === "loading") return;
        if (readiness.kind === "loop-ready" || readiness.kind === "external-ready") {
          this.preparingModels = false;
          if (this.timer !== null) clearTimeout(this.timer);
          this.timer = null;
          this.store.set({ phase: "ready", error: null });
        } else if (readiness.kind === "selection-required" && state.busy === null && state.error === null) {
          this.models.ensureSelection();
        } else if (state.error !== null) {
          this.modelFailure(state.error.code, state.error.message);
        } else if (readiness.kind === "no-models") {
          return;
        } else if (readiness.kind === "error" || readiness.kind === "catalog-unavailable") {
          this.modelFailure(readiness.error?.code ?? "loop/transport", readiness.error?.message);
        }
      }
      modelFailure(code, message = "") {
        if ((code === "loop/transport" || code === "loop/catalog-timeout") && this.modelRetries < 3) {
          if (this.timer !== null) return;
          this.modelRetries += 1;
          const generation = this.generation;
          this.timer = setTimeout(() => {
            this.timer = null;
            if (!this.preparingModels || generation !== this.generation) return;
            void this.models.open(true).then(() => this.updateModel(), () => {
              if (this.preparingModels && generation === this.generation) this.modelFailure("loop/transport");
            });
          }, 500);
          return;
        }
        this.preparingModels = false;
      }
      fail(code, message = "") {
        this.errorGrant = this.page.store.getSnapshot().connection?.grantId;
        console.warn("[Loop sign-in]", code, safeFailureText(message));
        this.active = false;
        this.store.set({ phase: "error", error: { code, message } });
        this.external?.close();
        this.external = null;
      }
    };

    // client/ui/collaboration-dock.tsx
    var import_react = require("react");
    var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    // client/ui/collaboration-connection.ts
    function collaborationAccountName(scope, unavailable) {
      const name2 = scope?.accountName?.trim();
      return name2 === void 0 || name2 === "" ? unavailable : name2;
    }
    function boardPickerPresentation(state) {
      if (state.busy === "boards") return "loading";
      if (state.error !== null) return "error";
      return state.boards.length === 0 ? "empty" : "choices";
    }
    function collaborationConnectionAction(status, screen) {
      if (screen === "loading") {
        return { label: "collab.dialog.openConnection", target: "canonical", disabled: true };
      }
      if (screen === "error") {
        return { label: "collab.dialog.openConnection", target: "canonical", disabled: false };
      }
      switch (status?.state) {
        case "needs-auth":
          return { label: "collab.dialog.connectSignIn", target: "canonical", disabled: false };
        case "needs-board":
          return { label: "collab.dialog.chooseBoardAction", target: "boards", disabled: false };
        case "unbound":
          return { label: "collab.dialog.chooseBoardAction", target: "boards", disabled: false };
        case "target-unavailable":
        case "revoked":
          return { label: "collab.dialog.repairConnection", target: "canonical", disabled: false };
        default:
          return { label: "collab.dialog.openConnection", target: "canonical", disabled: false };
      }
    }

    // client/ui/loop-ui.module.css
    var loop_ui_default = {
      modal: "loop_ui_modal",
      modalContent: "loop_ui_modalContent",
      panel: "loop_ui_panel",
      header: "loop_ui_header",
      workspaceHeading: "loop_ui_workspaceHeading",
      eyebrow: "loop_ui_eyebrow",
      body: "loop_ui_body",
      status: "loop_ui_status",
      section: "loop_ui_section",
      sectionHeading: "loop_ui_sectionHeading",
      sectionTitle: "loop_ui_sectionTitle",
      subsectionTitle: "loop_ui_subsectionTitle",
      hint: "loop_ui_hint",
      warning: "loop_ui_warning",
      error: "loop_ui_error",
      authPrompt: "loop_ui_authPrompt",
      agentMissing: "loop_ui_agentMissing",
      errorBlock: "loop_ui_errorBlock",
      choiceList: "loop_ui_choiceList",
      choice: "loop_ui_choice",
      choiceText: "loop_ui_choiceText",
      choiceTitle: "loop_ui_choiceTitle",
      choiceCaption: "loop_ui_choiceCaption",
      select: "loop_ui_select",
      createProject: "loop_ui_createProject",
      createRow: "loop_ui_createRow",
      field: "loop_ui_field",
      footerActions: "loop_ui_footerActions",
      footerHint: "loop_ui_footerHint",
      inlineActions: "loop_ui_inlineActions",
      summary: "loop_ui_summary",
      bindingDetail: "loop_ui_bindingDetail",
      projectLine: "loop_ui_projectLine",
      metadata: "loop_ui_metadata",
      sessionAction: "loop_ui_sessionAction",
      globalStatus: "loop_ui_globalStatus",
      globalError: "loop_ui_globalError",
      globalHost: "loop_ui_globalHost",
      globalFrame: "loop_ui_globalFrame",
      globalConnectionStatus: "loop_ui_globalConnectionStatus",
      globalConnectionAction: "loop_ui_globalConnectionAction",
      launcherRoot: "loop_ui_launcherRoot",
      launcherAnchor: "loop_ui_launcherAnchor",
      launcherMenu: "loop_ui_launcherMenu",
      launcherTrigger: "loop_ui_launcherTrigger",
      launcherLabel: "loop_ui_launcherLabel",
      settingsAdvanced: "loop_ui_settingsAdvanced",
      collaborationSection: "loop_ui_collaborationSection",
      launcherHeader: "loop_ui_launcherHeader",
      launcherEyebrow: "loop_ui_launcherEyebrow",
      launcherConnection: "loop_ui_launcherConnection",
      launcherModal: "loop_ui_launcherModal",
      settingsPage: "loop_ui_settingsPage",
      settingsHeader: "loop_ui_settingsHeader",
      settingsSection: "loop_ui_settingsSection",
      settingsSectionHeading: "loop_ui_settingsSectionHeading",
      settingsForm: "loop_ui_settingsForm",
      settingsField: "loop_ui_settingsField",
      settingsActions: "loop_ui_settingsActions",
      settingsStatus: "loop_ui_settingsStatus",
      settingsPlaceholder: "loop_ui_settingsPlaceholder",
      settingsConnected: "loop_ui_settingsConnected",
      settingsSyncControl: "loop_ui_settingsSyncControl",
      settingsState: "loop_ui_settingsState",
      settingsMetadata: "loop_ui_settingsMetadata",
      settingsRecovery: "loop_ui_settingsRecovery",
      settingsProjects: "loop_ui_settingsProjects",
      settingsSuccess: "loop_ui_settingsSuccess",
      settingsModelSelection: "loop_ui_settingsModelSelection",
      settingsProject: "loop_ui_settingsProject",
      settingsModelConnection: "loop_ui_settingsModelConnection",
      settingsProjectHeading: "loop_ui_settingsProjectHeading",
      settingsDirectoryEditor: "loop_ui_settingsDirectoryEditor",
      globalWorkspaceNotice: "loop_ui_globalWorkspaceNotice",
      serverActions: "loop_ui_serverActions",
      spinner: "loop_ui_spinner",
      "loop-spin": "loop_ui_loop-spin",
      visuallyHidden: "loop_ui_visuallyHidden",
      collaborationDock: "loop_ui_collaborationDock",
      collaborationNotice: "loop_ui_collaborationNotice",
      collaborationList: "loop_ui_collaborationList",
      collaborationItem: "loop_ui_collaborationItem",
      collaborationItemText: "loop_ui_collaborationItemText",
      collaborationItemActions: "loop_ui_collaborationItemActions",
      collaborationChoices: "loop_ui_collaborationChoices",
      collaborationContinuation: "loop_ui_collaborationContinuation",
      pageShell: "loop_ui_pageShell",
      uploadEntry: "loop_ui_uploadEntry",
      uploadDetails: "loop_ui_uploadDetails",
      loginDialog: "loop_ui_loginDialog",
      loginForm: "loop_ui_loginForm",
      loginIntro: "loop_ui_loginIntro",
      loginBrand: "loop_ui_loginBrand",
      loginField: "loop_ui_loginField",
      loginStatus: "loop_ui_loginStatus",
      loginStatusDot: "loop_ui_loginStatusDot",
      loginCurrentServer: "loop_ui_loginCurrentServer",
      loginActions: "loop_ui_loginActions",
      loginTabs: "loop_ui_loginTabs",
      taskConsent: "loop_ui_taskConsent"
    };

    // client/ui/collaboration-dock.tsx
    var import_jsx_runtime = require("react/jsx-runtime");
    var actionKeys = {
      recorded: "collab.state.recorded",
      dispatching: "collab.state.dispatching",
      accepted: "collab.state.accepted",
      running: "collab.state.running",
      waiting: "collab.state.waiting",
      succeeded: "collab.state.succeeded",
      in_review: "collab.task.inReview",
      completed: "collab.state.completed",
      "cancel-requested": "collab.state.cancelRequested",
      canceled: "collab.state.canceled",
      failed: "collab.state.failed",
      unreachable: "collab.state.unreachable",
      unknown: "collab.state.unknown"
    };
    var deliveryKeys = {
      pending: "collab.delivery.pending",
      claimed: "collab.delivery.claimed",
      committed: "collab.delivery.committed",
      canceled: "collab.delivery.canceled",
      "needs-auth": "collab.delivery.needsAuth",
      reconcile: "collab.delivery.reconcile",
      revoked: "collab.delivery.revoked",
      "retired-route": "collab.delivery.retiredRoute",
      "binding-conflict": "collab.delivery.bindingConflict",
      blocked: "collab.delivery.blocked"
    };
    var worksiteKeys = {
      stopped: "collab.worksite.stopped",
      connecting: "collab.worksite.connecting",
      connected: "collab.worksite.connected",
      needs_enable: "collab.worksite.needsEnable",
      registration_conflict: "collab.worksite.registrationConflict",
      state_changed: "collab.worksite.stateChanged",
      blocked: "collab.worksite.blocked",
      offline: "collab.worksite.offline"
    };
    function actionText(t, state) {
      return t(actionKeys[state] ?? "collab.state.unknown");
    }
    var taskKeys = {
      todo: "collab.task.todo",
      in_progress: "collab.task.inProgress",
      in_review: "collab.task.inReview",
      done: "collab.task.done"
    };
    var noticeKeys = {
      connected: "collab.notice.connected",
      "share-confirmed": "collab.notice.shareConfirmed",
      "intent-discarded": "collab.notice.intentDiscarded",
      "intent-bound": "collab.notice.intentBound",
      "cancel-pending-delivery": "collab.notice.cancelPending",
      "cancel-requested": "collab.notice.cancelRequested",
      stopped: "collab.notice.stopped",
      "not-dispatched": "collab.notice.notDispatched",
      "already-terminal": "collab.notice.alreadyTerminal",
      "cancel-unknown": "collab.notice.cancelUnknown",
      reconciled: "collab.notice.reconciled",
      "continuation-linked": "collab.notice.continuationLinked",
      "continuation-needs-target": "collab.notice.continuationNeedsTarget",
      "continuation-unavailable": "collab.notice.continuationUnavailable",
      "continuation-failed": "collab.notice.continuationFailed"
    };
    function statusLabel(t, status, screen) {
      if (screen === "idle" || screen === "loading") return t("collab.status.waiting");
      if (screen === "error") return t("collab.status.unavailable");
      switch (status?.state) {
        case "ready":
        case "degraded": {
          const activeCount = status.active.filter(
            (work) => work.taskAvailable !== false && work.state !== "completed" && work.state !== "canceled" && work.state !== "failed"
          ).length;
          return status.scope?.boardName === void 0 || activeCount === 0 ? t("collab.status.ready") : t("collab.status.connected", {
            board: status.scope.boardName,
            count: activeCount
          });
        }
        case "needs-auth":
          return t("collab.status.needsAuth");
        case "needs-board":
          return t("collab.status.needsBoard");
        case "unbound":
          return t("collab.status.unbound");
        case "binding-conflict":
          return t("collab.status.unavailable");
        default:
          return t("collab.status.unavailable");
      }
    }
    function WorksiteStatus({
      status,
      runtime,
      t
    }) {
      if (status === void 0) return null;
      const needsSetupAction = status.state === "needs_enable" || status.state === "connecting" || status.state === "state_changed" || status.state === "blocked" || status.state === "offline";
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: loop_ui_default.collaborationSection, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: loop_ui_default.sectionTitle, children: t("collab.worksite.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t(worksiteKeys[status.state]) }),
        needsSetupAction && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: runtime.openWorksiteSetup, children: t("collab.worksite.openStartWork") })
      ] });
    }
    function ShareScopeChoices({
      state,
      runtime,
      t
    }) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: loop_ui_default.collaborationChoices, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: t("collab.dialog.shareTitle") }),
        [
          ["task-description", "collab.dialog.shareTask"],
          ["selected-resources", "collab.dialog.shareSelected"],
          ["task-discussion", "collab.dialog.shareDiscussion"]
        ].map(([value, key]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: loop_ui_default.choice, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "radio",
              name: "loop-collaboration-share",
              checked: state.shareScope.scope === value,
              onChange: () => {
                runtime.setShareScope(value);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.choiceText, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.choiceTitle, children: t(key) }) })
        ] }, value)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t("collab.dialog.shareHint") })
      ] });
    }
    function ActiveWork({
      state,
      runtime,
      focusComposer,
      t
    }) {
      const workspaceId = state.status?.scope?.workspaceId;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: loop_ui_default.collaborationSection, "aria-labelledby": "loop-collaboration-active", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "loop-collaboration-active", className: loop_ui_default.sectionTitle, children: t("collab.dialog.activeTitle") }),
        state.status?.active.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t("collab.dialog.activeEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: loop_ui_default.collaborationList, children: state.status?.active.map((work) => {
          const needsReconcile = work.resultUnknown || work.nextAction === "reconcile";
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: loop_ui_default.collaborationItem, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.collaborationItemText, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: work.taskAvailable === false ? t("collab.dialog.task") : work.taskTitle?.trim() || t("collab.dialog.task") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: work.taskAvailable === false ? t("collab.task.unavailable") : work.taskStatus && taskKeys[work.taskStatus] ? t(taskKeys[work.taskStatus]) : actionText(t, work.state) }),
              work.managementState && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.hint, children: t(work.managementState === "closed" ? "collab.management.closed" : work.managementState === "active" ? "collab.management.active" : "collab.management.unavailable") }),
              work.taskAvailable !== false && work.acceptanceState === "accepted" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.hint, children: t("collab.task.accepted") }),
              work.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.hint, children: safeFailureText(work.reason) }),
              needsReconcile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.warning, children: t("collab.dialog.unknownResult") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.collaborationItemActions, children: [
              workspaceId !== void 0 && work.taskAvailable !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  size: "sm",
                  variant: "outline",
                  onClick: () => {
                    runtime.openTask(workspaceId, work.taskId);
                  },
                  children: t("collab.dialog.openTask")
                }
              ),
              needsReconcile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  size: "sm",
                  variant: "outline",
                  disabled: state.busy !== null,
                  onClick: () => {
                    void runtime.reconcile();
                  },
                  children: state.busy === "reconcile" ? t("collab.dialog.reconciling") : t("collab.dialog.reconcile")
                }
              )
            ] })
          ] }, work.taskId);
        }) })
      ] });
    }
    function Details({
      state,
      runtime,
      focusComposer,
      t
    }) {
      const status = state.status;
      const canWork = status?.state === "ready" || status?.state === "degraded";
      const hasScopeDetails = status?.scope !== void 0 && (status.scope.boardId !== void 0 && status.scope.boardId !== "" || status.scope.accountId !== "" || status.scope.coordinatorAgentId !== "");
      const connectionAction = collaborationConnectionAction(status, state.screen);
      const boardSetup = status?.state === "unbound" || status?.state === "needs-board";
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        state.screen === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.status, children: t("collab.dialog.loading") }),
        state.error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.errorBlock, role: "alert", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("collab.dialog.error") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: collaborationFailureText(t, state.error) })
        ] }),
        canWork ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            ActiveWork,
            {
              state,
              runtime,
              focusComposer,
              t
            }
          ),
          (state.continuation.state !== "idle" && state.continuation.state !== "no-active-work" || (state.continuation.failedCount ?? 0) > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.collaborationContinuation, role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: state.continuation.state === "binding" ? t("collab.dialog.continuationBinding") : state.continuation.state === "ready" ? t("collab.dialog.continuationReady", {
              count: state.continuation.taskCount
            }) : state.continuation.state === "needs-explicit-target" ? t(noticeKeys["continuation-needs-target"]) : state.continuation.state === "unavailable" ? t(noticeKeys["continuation-unavailable"]) : t(noticeKeys["continuation-failed"]) }),
            (state.continuation.failedCount ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                size: "sm",
                variant: "outline",
                disabled: state.busy !== null,
                onClick: () => {
                  void runtime.retryContinuation();
                },
                children: t("collab.dialog.retryContinuation")
              }
            )
          ] }),
          status?.deliveryGap && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.warning, role: "status", children: t("collab.task.deliveryGap") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: loop_ui_default.collaborationSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: loop_ui_default.sectionTitle, children: t("collab.dialog.deliveryTitle") }),
            status?.deliveries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t("collab.dialog.deliveryEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: loop_ui_default.collaborationList, children: status?.deliveries.map((delivery) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: loop_ui_default.collaborationItem, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t(deliveryKeys[delivery.state]) }),
              delivery.taskId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.hint, children: delivery.taskId })
            ] }, delivery.deliveryId)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: loop_ui_default.collaborationSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: loop_ui_default.sectionTitle, children: t("collab.dialog.connectionTitle") }),
            status?.scope !== void 0 && hasScopeDetails && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", { className: loop_ui_default.metadata, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("collab.dialog.scope") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: status.scope.boardName ?? status.scope.boardId ?? "" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("collab.dialog.account") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: collaborationAccountName(
                  status.scope,
                  t("collab.dialog.accountUnavailable")
                ) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("collab.dialog.coordinator") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: status.scope.coordinatorAgentName ?? status.scope.coordinatorAgentId })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorksiteStatus, { status: status?.worksite, runtime, t })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.footerActions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: () => {
              void runtime.loadBoards();
            }, children: t("collab.dialog.bindTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                size: "sm",
                variant: "outline",
                disabled: state.busy !== null,
                onClick: () => {
                  void runtime.reconcile();
                },
                children: t("collab.dialog.retry")
              }
            ),
            state.pendingIntent && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                size: "sm",
                variant: "outline",
                disabled: state.busy !== null,
                onClick: () => {
                  void runtime.discardPreparedIntent();
                },
                children: t("collab.dialog.discard")
              }
            )
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: loop_ui_default.collaborationSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: loop_ui_default.sectionTitle, children: t(boardSetup ? "collab.dialog.boardSetupTitle" : "collab.dialog.connectionTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t(boardSetup ? "collab.dialog.boardSetupBody" : "collab.dialog.connectionDistinction") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.footerActions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                size: "sm",
                variant: "primary",
                disabled: connectionAction.disabled,
                onClick: connectionAction.target === "boards" ? () => {
                  void runtime.loadBoards();
                } : runtime.openExistingBindingForSession,
                children: t(connectionAction.label)
              }
            ),
            status?.state === "needs-auth" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                size: "sm",
                variant: "outline",
                disabled: state.busy !== null,
                onClick: () => {
                  void runtime.refreshStatus(true).catch(() => void 0);
                },
                children: t("collab.dialog.retry")
              }
            )
          ] })
        ] })
      ] });
    }
    function Boards({
      state,
      runtime,
      t
    }) {
      const presentation = boardPickerPresentation(state);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t("collab.dialog.bindBody") }),
        state.error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.errorBlock, role: "alert", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("collab.dialog.error") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: collaborationFailureText(t, state.error) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: loop_ui_default.inlineActions, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              size: "sm",
              variant: "outline",
              disabled: state.busy !== null,
              onClick: () => {
                void runtime.loadBoards();
              },
              children: t("collab.dialog.retry")
            }
          ) })
        ] }),
        presentation === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.status, children: t("collab.dialog.loading") }),
        presentation === "empty" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.errorBlock, role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("collab.dialog.noBoards") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: runtime.openLoopProject, children: t("collab.dialog.openLoop") })
        ] }) : presentation === "choices" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: loop_ui_default.collaborationChoices, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: t("collab.dialog.chooseBoard") }),
          state.boards.map((board) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: loop_ui_default.choice, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "radio",
                name: "loop-collaboration-board",
                checked: state.selectedBoardId === board.boardId,
                onChange: () => {
                  runtime.selectBoard(board.boardId);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: loop_ui_default.choiceText, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.choiceTitle, children: board.boardName }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: loop_ui_default.choiceCaption, children: [
                board.projectName,
                board.capability.available ? "" : ` \xB7 ${t("collab.error.unsupported")}`
              ] })
            ] })
          ] }, board.boardId))
        ] }) : null,
        presentation === "choices" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShareScopeChoices, { state, runtime, t }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.footerActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: runtime.openLoopProject, children: t("collab.dialog.openLoop") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              size: "sm",
              variant: "primary",
              disabled: presentation !== "choices" || state.busy !== null || state.selectedBoardId === "",
              onClick: () => {
                void runtime.bindBoard(state.selectedBoardId);
              },
              children: state.busy === "bind" ? t("collab.dialog.binding") : t("collab.dialog.bind")
            }
          )
        ] })
      ] });
    }
    function ShareReview({
      state,
      runtime,
      t
    }) {
      const preview = state.sharePreview;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: loop_ui_default.section, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: loop_ui_default.sectionTitle, children: t("collab.dialog.shareTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.warning, children: t("collab.dialog.shareFirst") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t(`collab.dialog.share${state.shareScope.scope === "task-description" ? "Task" : state.shareScope.scope === "selected-resources" ? "Selected" : "Discussion"}`) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: loop_ui_default.hint, children: [
            t("collab.dialog.shareTargets", { count: preview?.targetIds.length ?? 0 }),
            " \xB7 ",
            t("collab.dialog.shareResources", { count: preview?.resourceRefs.length ?? 0 })
          ] }),
          state.shareTargetNames.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: loop_ui_default.collaborationList, children: state.shareTargetNames.map((name2, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { className: loop_ui_default.collaborationItem, children: name2 }, `${name2}:${index}`)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.footerActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: runtime.closeOverlay, children: t("dialog.cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "primary", onClick: runtime.confirmShare, children: t("collab.dialog.shareConfirm") })
        ] })
      ] });
    }
    function ReferencePreview({
      state,
      t
    }) {
      const reference = state.reference;
      if (reference === null) return null;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: loop_ui_default.section, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: loop_ui_default.sectionTitle, children: reference.displayName }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t(reference.targetType === "agent" ? "collab.dialog.referenceTypeAgent" : "collab.dialog.referenceTypeHuman") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: loop_ui_default.hint, children: t("collab.dialog.referenceBody") })
      ] });
    }
    function CollaborationDock({
      useCollaboration,
      runtime,
      t
    }) {
      const state = useCollaboration((value) => value);
      const label = statusLabel(t, state.status, state.screen);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.collaborationDock, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            size: "sm",
            variant: "ghost",
            "aria-label": t("collab.status.details"),
            onClick: () => {
              if (state.status?.state === "needs-board") {
                void runtime.loadBoards();
              } else {
                void runtime.openDetails();
              }
            },
            children: label
          }
        ),
        state.notice !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", className: loop_ui_default.collaborationNotice, children: t(noticeKeys[state.notice]) })
      ] });
    }
    function CollaborationOverlayHost({ useSessionBinding, forSession, t }) {
      const sessionId = useSessionBinding((binding) => binding.key);
      if (sessionId === void 0) return null;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollaborationOverlay, { ...forSession(sessionId), t }, sessionId);
    }
    function CollaborationOverlay({ runtime, focusComposer, t }) {
      const state = (0, import_react.useSyncExternalStore)(runtime.store.subscribe, runtime.store.getSnapshot);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Modal,
        {
          open: state.overlay !== "closed",
          headless: true,
          title: t("collab.dialog.title"),
          className: loop_ui_default.modal,
          contentClassName: loop_ui_default.modalContent,
          onClose: () => {
            runtime.closeOverlay();
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.panel, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: loop_ui_default.header, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.workspaceHeading, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: loop_ui_default.eyebrow, children: t("collab.dialog.eyebrow") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: t("collab.dialog.title") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "ghost", onClick: () => {
                runtime.closeOverlay();
              }, children: t("collab.dialog.close") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: loop_ui_default.body, children: [
              state.overlay === "details" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                Details,
                {
                  state,
                  runtime,
                  focusComposer,
                  t
                }
              ),
              state.overlay === "boards" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Boards, { state, runtime, t }),
              state.overlay === "share" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShareReview, { state, runtime, t }),
              state.overlay === "reference" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReferencePreview, { state, t })
            ] })
          ] })
        }
      );
    }

    // client/ui/collaboration-reference.ts
    var REFERENCE_PREFIX = "loop-collab:v1:";
    var ID2 = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
    function encodeBase64(value) {
      const bytes = new TextEncoder().encode(value);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
    }
    function decodeBase64(value) {
      const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const binary = atob(padded);
      return new TextDecoder().decode(
        Uint8Array.from(binary, (character) => character.charCodeAt(0))
      );
    }
    function encodeCollaborationReference(reference) {
      return REFERENCE_PREFIX + encodeBase64(JSON.stringify(reference));
    }
    function decodeCollaborationReference(value) {
      if (!value.startsWith(REFERENCE_PREFIX)) return null;
      try {
        const parsed = JSON.parse(decodeBase64(value.slice(REFERENCE_PREFIX.length)));
        if (parsed.version !== 1 || typeof parsed.sessionId !== "string" || !ID2.test(parsed.sessionId) || typeof parsed.targetId !== "string" || !ID2.test(parsed.targetId) || parsed.targetType !== "agent" && parsed.targetType !== "human" || typeof parsed.stableRef !== "string" || parsed.stableRef === "" || parsed.stableRef.length > 512 || typeof parsed.displayName !== "string" || parsed.displayName.trim() === "" || parsed.displayName.length > 255 || parsed.directoryKey !== void 0 && (typeof parsed.directoryKey !== "string" || !ID2.test(parsed.directoryKey)) || (parsed.bindingRevision === void 0 ? !parsed.directoryKey : typeof parsed.bindingRevision !== "string" || !parsed.bindingRevision || parsed.bindingRevision.length > 200)) {
          return null;
        }
        return {
          version: 1,
          sessionId: parsed.sessionId,
          targetId: parsed.targetId,
          targetType: parsed.targetType,
          stableRef: parsed.stableRef,
          displayName: parsed.displayName,
          ...parsed.bindingRevision === void 0 ? {} : { bindingRevision: parsed.bindingRevision },
          ...parsed.directoryKey === void 0 ? {} : { directoryKey: parsed.directoryKey }
        };
      } catch {
        return null;
      }
    }
    function xmlAttribute(value) {
      return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
    function serializeCollaborationReference(reference) {
      const directory = reference.directoryKey ? ` directory="${xmlAttribute(reference.directoryKey)}"` : "";
      return `<loop-collaboration type="${reference.targetType}" target="${xmlAttribute(reference.targetId)}" ref="${xmlAttribute(reference.stableRef)}"${directory}>${xmlAttribute(reference.displayName)}</loop-collaboration>`;
    }
    async function collaborationDigest(value) {
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
      );
      return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    function collaborationRequestId(prefix) {
      const suffix = globalThis.crypto.randomUUID().replaceAll("-", "");
      return `${prefix}_${suffix}`;
    }

    // client/ui/collaboration-runtime.ts
    var INITIAL = Object.freeze({
      screen: "idle",
      status: null,
      error: null,
      boards: [],
      boardsRevision: "",
      selectedBoardId: "",
      shareScope: {
        scope: "task-description",
        resourceRefs: [],
        expandedAudience: false
      },
      sharePreview: null,
      shareTargetNames: [],
      overlay: "closed",
      reference: null,
      busy: null,
      notice: null,
      pendingIntent: false,
      continuation: { state: "idle", taskCount: 0, taskIds: [] }
    });
    var CollaborationRuntimeError = class extends Error {
      code;
      constructor(code, message) {
        super(message);
        this.name = "CollaborationRuntimeError";
        this.code = code;
      }
    };
    function resultValue(result) {
      if (!result.ok) throw new CollaborationRuntimeError(result.error.code, result.error.message);
      return result.value;
    }
    function requestMatchesText(request, tokens) {
      return tokens.length > 0 && tokens.every((token) => request.text.includes(token));
    }
    var CollaborationSessionRuntime = class {
      store;
      options;
      sessionId;
      face;
      unsubscribeSession;
      statusPromise = null;
      statusGeneration = 0;
      batchBuilder = null;
      prepared = null;
      pendingRecovery = null;
      shareConsent = null;
      handledRequestIds = /* @__PURE__ */ new Set();
      observedRequestIds;
      continuationRequests = /* @__PURE__ */ new Map();
      continuationFailures = /* @__PURE__ */ new Map();
      openBindingTimer = null;
      seenEventIds = /* @__PURE__ */ new Set();
      stream = null;
      streamBindingEpoch = "";
      disposed = false;
      constructor(sessionId, options) {
        this.sessionId = sessionId;
        this.options = options;
        this.store = createSnapshotStore(INITIAL);
        const binding = options.sessions.binding(sessionId);
        if (binding === void 0) {
          throw new CollaborationRuntimeError(
            "loop-collaboration/session-unavailable",
            "The Session is not retained by the Host."
          );
        }
        this.face = binding.session;
        this.observedRequestIds = new Set(
          this.face.getSnapshot().pendingSubmissions.map((item) => item.requestId)
        );
        this.unsubscribeSession = this.face.subscribe(this.onSessionChange);
      }
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.openBindingTimer !== null) {
          clearTimeout(this.openBindingTimer);
          this.openBindingTimer = null;
        }
        this.unsubscribeSession();
        this.stream?.abort();
        this.stream = null;
        this.streamBindingEpoch = "";
        this.continuationRequests.clear();
        this.continuationFailures.clear();
        this.rejectShareConsent(new CollaborationRuntimeError(
          "loop-collaboration/cancelled",
          "The collaborator message was closed before confirmation."
        ));
        this.store.set(INITIAL);
      }
      async warm() {
        await this.refreshStatus().catch(() => void 0);
      }
      showDirectoryError = () => {
        this.patch({ overlay: "details" });
      };
      openDetails = async () => {
        this.patch({ overlay: "details", error: null, notice: null });
        await this.refreshStatus().catch(() => void 0);
      };
      closeOverlay = () => {
        if (this.store.getSnapshot().overlay === "share") {
          this.rejectShareConsent(new CollaborationRuntimeError(
            "loop-collaboration/cancelled",
            "Share review was cancelled; the message was not sent."
          ));
        }
        this.patch({ overlay: "closed", notice: null });
      };
      async refreshStatus(fresh = false) {
        if (this.disposed) throw new CollaborationRuntimeError("loop-collaboration/cancelled", "Session closed");
        if (!fresh && this.statusPromise !== null) return this.statusPromise;
        if (this.options.remote.collaborationStatus === void 0) {
          const error = {
            code: "loop-collaboration/capability-unsupported",
            message: "This Loop Host needs an update to support native collaborators."
          };
          this.patch({ screen: "error", error });
          throw new CollaborationRuntimeError(error.code, error.message);
        }
        this.patch({ screen: "loading", error: null });
        const generation = ++this.statusGeneration;
        const task = this.options.remote.collaborationStatus({
          sessionId: this.sessionId,
          ...this.options.workspaceForSession(this.sessionId) === void 0 ? {} : { workspaceId: this.options.workspaceForSession(this.sessionId).workspaceId }
        }).then((result) => resultValue(result)).then((status) => {
          if (this.disposed) return status;
          if (generation !== this.statusGeneration) return status;
          const previousScope = this.store.getSnapshot().status?.scope;
          const previousRevision = previousScope?.bindingRevision;
          const nextRevision = status.scope?.bindingRevision;
          if (previousScope !== void 0 && (previousRevision !== nextRevision || previousScope.bindingId !== status.scope?.bindingId)) {
            this.invalidateForScopeChange();
          }
          this.patch({
            screen: "ready",
            status,
            error: null,
            ...status.scope?.boardId === void 0 ? {} : { selectedBoardId: status.scope.boardId }
          });
          this.restartStream(status);
          return status;
        }).catch((error) => {
          if (generation !== this.statusGeneration) throw error;
          const failure2 = error instanceof CollaborationRuntimeError ? { code: error.code, message: error.message } : { code: "loop-collaboration/server-unavailable", message: error instanceof Error ? error.message : "" };
          if (!this.disposed) this.patch({ screen: "error", error: failure2 });
          throw error;
        }).finally(() => {
          if (this.statusPromise === task) this.statusPromise = null;
        });
        this.statusPromise = task;
        return task;
      }
      async ensureDirectory(query, signal, kinds = ["agent", "human"]) {
        signal.throwIfAborted();
        const name2 = query.trim();
        let directoryKey;
        const groups = await Promise.all(kinds.map(async (kind) => {
          const entries = /* @__PURE__ */ new Map();
          const cursors = /* @__PURE__ */ new Set();
          let cursor;
          do {
            const page = await this.fetchDirectory(name2, signal, [kind], cursor);
            if (!page.cacheKey || directoryKey !== void 0 && page.cacheKey !== directoryKey) {
              throw new CollaborationRuntimeError("loop-collaboration/binding-stale", "The Loop directory changed during search.");
            }
            directoryKey = page.cacheKey;
            for (const entry of page.entries) {
              if (entry.targetType === kind && entry.visible) entries.set(entry.targetId, { ...entry, directoryKey });
            }
            if (!name2 && kind === "human") break;
            cursor = page.nextCursor || void 0;
            if (cursor && cursors.has(cursor)) {
              throw new CollaborationRuntimeError("loop-collaboration/server-unavailable", "The Loop directory repeated a page cursor.");
            }
            if (cursor) cursors.add(cursor);
          } while (cursor);
          return [...entries.values()];
        }));
        return groups.flat();
      }
      candidateValue(entry) {
        const status = this.store.getSnapshot().status;
        const scope = status?.scope;
        if (!scope && !entry.directoryKey) return "";
        return JSON.stringify({
          targetId: entry.targetId,
          targetType: entry.targetType,
          stableRef: entry.stableRef,
          displayName: entry.displayName,
          bindingRevision: scope?.bindingRevision || void 0,
          directoryKey: entry.directoryKey,
          visible: entry.visible,
          delegable: entry.delegable,
          notifiable: entry.notifiable,
          needsAccess: entry.needsAccess,
          capabilityAvailable: entry.capability.available,
          staleReason: entry.staleReason
        });
      }
      pickCandidate(pick) {
        let value;
        try {
          const parsed = JSON.parse(pick.candidate.value ?? "");
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return void 0;
          value = parsed;
        } catch {
          return void 0;
        }
        if (typeof value.targetId !== "string" || value.targetType !== "agent" && value.targetType !== "human" || typeof value.stableRef !== "string" || typeof value.displayName !== "string" || typeof value.directoryKey !== "string" && typeof value.bindingRevision !== "string") return void 0;
        const reference = {
          version: 1,
          sessionId: this.sessionId,
          targetId: value.targetId,
          targetType: value.targetType,
          stableRef: value.stableRef,
          displayName: value.displayName,
          ...typeof value.bindingRevision === "string" ? { bindingRevision: value.bindingRevision } : {},
          ...typeof value.directoryKey === "string" ? { directoryKey: value.directoryKey } : {}
        };
        const ref = encodeCollaborationReference(reference);
        return {
          insert: {
            source: "loop-collaboration",
            ref,
            label: value.displayName,
            appearance: value.targetType === "agent" ? "session" : "folder",
            clipboardText: `@${value.displayName}`
          }
        };
      }
      async serializeReference(ref, signal) {
        const reference = decodeCollaborationReference(ref);
        if (reference === null || reference.sessionId !== this.sessionId) {
          throw new CollaborationRuntimeError(
            "loop-collaboration/session-unavailable",
            "This collaborator reference belongs to another Session. Select it again in this Session."
          );
        }
        const token = serializeCollaborationReference(reference);
        const share = this.store.getSnapshot().shareScope;
        if (reference.directoryKey && share.scope === "task-description" && share.resourceRefs.length === 0) {
          await this.verifyDirectoryMember(reference, signal);
          return token;
        }
        if (this.prepared !== null || this.pendingRecovery !== null) {
          throw new CollaborationRuntimeError(
            "loop-collaboration/intent-already-bound",
            "Another Loop collaborator message is still being linked. Wait, retry, or discard that pending intent."
          );
        }
        const builder = this.batchBuilder ?? this.newBatchBuilder();
        if (!builder.targets.some((target) => target.targetId === reference.targetId && target.targetType === reference.targetType)) {
          builder.targets.push({
            targetId: reference.targetId,
            targetType: reference.targetType,
            stableRef: reference.stableRef,
            intendedActions: ["dispatch", "followup"]
          });
          builder.tokens.push(token);
          builder.targetNames.push(reference.displayName);
        }
        builder.routes.push(this.submissionRoute(reference, signal));
        await builder.ready;
        try {
          const routes = await Promise.all(builder.routes);
          signal.throwIfAborted();
          const scope = routes[0]?.scope;
          if (routes.some((route) => route?.scope?.bindingId !== scope?.bindingId || route?.scope?.bindingRevision !== scope?.bindingRevision)) {
            throw new CollaborationRuntimeError("loop-collaboration/binding-stale", "The selected collaborators belong to different routes.");
          }
          if (!scope) throw new CollaborationRuntimeError("loop-collaboration/not-bound", "Choose a Loop board before sharing.");
          this.prepared = await this.prepareBatch(builder, scope.bindingRevision, signal);
          this.patch({ pendingIntent: true });
          return token;
        } finally {
          if (this.batchBuilder === builder) this.batchBuilder = null;
        }
      }
      async verifyDirectoryMember(reference, signal) {
        const page = await this.fetchDirectory(reference.targetId, signal, [reference.targetType]);
        if (page.cacheKey !== reference.directoryKey || !page.entries.some((entry) => entry.visible && entry.targetId === reference.targetId && entry.targetType === reference.targetType && entry.stableRef === reference.stableRef)) {
          throw new CollaborationRuntimeError("loop-collaboration/binding-stale", "The directory or collaborator changed. Select the collaborator again.");
        }
      }
      async submissionRoute(reference, signal) {
        if (reference.directoryKey) await this.verifyDirectoryMember(reference, signal);
        const status = await this.refreshStatus();
        if (!status.scope || status.state !== "ready" && status.state !== "degraded") {
          throw new CollaborationRuntimeError("loop-collaboration/not-bound", "Choose a Loop board before sending.");
        }
        if (reference.bindingRevision !== status.scope.bindingRevision) {
          throw new CollaborationRuntimeError("loop-collaboration/binding-stale", "The Loop board changed. Remove this stale collaborator and select it again.");
        }
        return status;
      }
      async bindBoard(boardId) {
        const state = this.store.getSnapshot();
        if (state.busy !== null) return;
        const workspace = this.options.workspaceForSession(this.sessionId);
        if (workspace === void 0) {
          this.patch({ error: { code: "loop-collaboration/not-bound", message: "Open this Session from a workspace first." } });
          return;
        }
        const board = state.boards.find((item) => item.boardId === boardId);
        if (board === void 0 || state.boardsRevision === "") {
          this.patch({ error: { code: "loop-collaboration/not-bound", message: "Choose a Loop board first." } });
          return;
        }
        if (this.options.remote.collaborationBind === void 0) {
          this.patch({ error: { code: "loop-collaboration/capability-unsupported", message: "This Loop Host needs an update." } });
          return;
        }
        this.patch({ busy: "bind", selectedBoardId: boardId, error: null });
        try {
          const bindingResult = this.options.remote.status === void 0 ? null : await this.options.remote.status(workspace);
          const existing = bindingResult?.ok === true ? bindingResult.value : null;
          const coordinatorAgentId = state.status?.scope?.coordinatorAgentId || existing?.agent?.id;
          if (coordinatorAgentId === void 0 || coordinatorAgentId === "") {
            this.openExistingBinding(workspace);
            return;
          }
          const collaborationWorkspaceId = state.status?.scope?.workspaceId || existing?.loop?.workspaceId;
          if (collaborationWorkspaceId === void 0 || collaborationWorkspaceId === "") {
            this.reportFailure(new CollaborationRuntimeError(
              "loop-collaboration/not-bound",
              "The Loop workspace identity is unavailable."
            ));
            return;
          }
          const result = await this.options.remote.collaborationBind({
            sessionId: this.sessionId,
            workspaceId: collaborationWorkspaceId,
            boardId: board.boardId,
            coordinatorAgentId,
            expectedRevision: state.boardsRevision,
            shareScope: state.shareScope
          });
          if (!result.ok) throw new CollaborationRuntimeError(result.error.code, result.error.message);
          this.patch({ busy: null, overlay: "details", notice: "connected" });
          await this.refreshStatus(true);
        } catch (error) {
          this.reportFailure(error);
        } finally {
          if (this.store.getSnapshot().busy === "bind") this.patch({ busy: null });
        }
      }
      async loadBoards() {
        if (this.options.remote.collaborationBoards === void 0) {
          this.patch({ error: { code: "loop-collaboration/capability-unsupported", message: "This Loop Host needs an update." } });
          return;
        }
        this.patch({ busy: "boards", overlay: "boards", error: null, notice: null });
        try {
          const result = await this.options.remote.collaborationBoards({
            sessionId: this.sessionId,
            limit: 50
          });
          const value = resultValue(result);
          const boards = value.boards;
          this.patch({
            busy: null,
            boards,
            boardsRevision: value.revision,
            selectedBoardId: boards.some((board) => board.boardId === this.store.getSnapshot().selectedBoardId) ? this.store.getSnapshot().selectedBoardId : boards[0]?.boardId ?? ""
          });
        } catch (error) {
          this.reportFailure(error);
          if (this.store.getSnapshot().busy === "boards") this.patch({ busy: null });
        }
      }
      setShareScope(scope) {
        this.patch({
          shareScope: {
            ...this.store.getSnapshot().shareScope,
            scope
          }
        });
      }
      selectBoard(boardId) {
        this.patch({ selectedBoardId: boardId });
      }
      confirmShare = () => {
        const consent = this.shareConsent;
        if (consent === null) return;
        this.clearShareConsent(consent);
        const shareScope = {
          ...consent.shareScope,
          expandedAudience: true
        };
        this.patch({
          overlay: "closed",
          sharePreview: null,
          shareScope,
          notice: "share-confirmed",
          pendingIntent: true
        });
        consent.resolve(shareScope);
      };
      async discardPreparedIntent() {
        const prepared = this.pendingRecovery?.prepared ?? this.prepared;
        if (prepared === null || this.options.remote.cancelCollaborationIntent === void 0) return;
        this.patch({ busy: "discard-intent", error: null, notice: null });
        try {
          const intentRef = this.pendingRecovery?.exactIntentRef ?? prepared.intentRef;
          resultValue(await this.options.remote.cancelCollaborationIntent({
            sessionId: this.sessionId,
            intentRef,
            clientRequestId: collaborationRequestId("discard-intent"),
            reason: "Discarded before the accepted message was bound",
            expectedStatus: "prepared"
          }));
          this.prepared = null;
          this.pendingRecovery = null;
          this.patch({
            busy: null,
            pendingIntent: false,
            notice: "intent-discarded"
          });
        } catch (error) {
          this.reportFailure(error);
          if (this.store.getSnapshot().busy === "discard-intent") this.patch({ busy: null });
        }
      }
      openReference(ref) {
        const reference = decodeCollaborationReference(ref);
        if (reference === null || reference.sessionId !== this.sessionId) return false;
        this.patch({ overlay: "reference", reference, notice: null });
        return true;
      }
      showFailure(error) {
        this.reportFailure(error);
      }
      openExistingBindingForSession = () => {
        const workspace = this.options.workspaceForSession(this.sessionId);
        if (workspace === void 0) {
          this.patch({
            overlay: "details",
            error: {
              code: "loop-collaboration/session-unavailable",
              message: ""
            }
          });
          return;
        }
        this.openExistingBinding(workspace);
      };
      openLoopProject = () => {
        this.patch({ overlay: "closed" });
        this.options.openLoopProject();
      };
      openWorksiteSetup = () => {
        const scope = this.store.getSnapshot().status?.scope;
        if (scope === void 0 || this.options.openWorksiteSetup === void 0) {
          this.options.openLoopProject();
          return;
        }
        this.patch({ overlay: "closed" });
        this.options.openWorksiteSetup(scope);
      };
      openTask(workspaceId, taskId) {
        this.patch({ overlay: "closed" });
        if (!this.options.openTask(workspaceId, taskId)) this.options.openLoopProject();
      }
      async reconcile() {
        if (this.store.getSnapshot().busy?.startsWith("bind:") === true) return;
        if (this.pendingRecovery !== null) {
          const recovered = await this.bindPending(this.pendingRecovery.request);
          if (!recovered) return;
        }
        if (this.options.remote.collaborationReconcile === void 0) return;
        this.patch({ busy: "reconcile", error: null });
        try {
          resultValue(await this.options.remote.collaborationReconcile({ sessionId: this.sessionId }));
          await this.refreshStatus();
          this.patch({ busy: null, notice: "reconciled" });
        } catch (error) {
          this.reportFailure(error);
          if (this.store.getSnapshot().busy === "reconcile") this.patch({ busy: null });
        }
      }
      awaitShareConsent(intentRef, sharePreview, targetNames, shareScope, expiresAt, signal) {
        if (this.shareConsent !== null) {
          return Promise.reject(new CollaborationRuntimeError(
            "loop-collaboration/intent-already-bound",
            "Another collaborator share review is already waiting."
          ));
        }
        return new Promise((resolve, reject) => {
          let settled = false;
          const finish = () => {
            if (settled) return false;
            settled = true;
            return true;
          };
          const expiry = Date.parse(expiresAt);
          const timeoutMs = Number.isFinite(expiry) ? Math.max(0, Math.min(expiry - Date.now(), 5 * 6e4)) : 5 * 6e4;
          const timer = setTimeout(() => {
            this.rejectShareConsent(new CollaborationRuntimeError(
              "loop-collaboration/intent-expired",
              "Share review expired; the message was not sent."
            ));
          }, timeoutMs);
          timer.unref?.();
          const abort = () => {
            this.rejectShareConsent(new CollaborationRuntimeError(
              "loop-collaboration/cancelled",
              "The submission was cancelled during share review."
            ));
          };
          const cleanup = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
          };
          this.shareConsent = {
            intentRef,
            shareScope,
            timer,
            cleanup,
            resolve: (scope) => {
              if (!finish()) return;
              cleanup();
              resolve(scope);
            },
            reject: (error) => {
              if (!finish()) return;
              cleanup();
              reject(error);
            }
          };
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) {
            abort();
            return;
          }
          this.patch({
            overlay: "share",
            sharePreview,
            shareTargetNames: [...targetNames],
            shareScope: {
              ...shareScope,
              expandedAudience: false
            },
            pendingIntent: false
          });
        });
      }
      clearShareConsent(consent) {
        consent.cleanup();
        if (this.shareConsent === consent) this.shareConsent = null;
      }
      rejectShareConsent(error) {
        const consent = this.shareConsent;
        if (consent === null) return;
        this.clearShareConsent(consent);
        consent.reject(error);
        if (this.options.remote.cancelCollaborationIntent !== void 0) {
          void this.options.remote.cancelCollaborationIntent({
            sessionId: this.sessionId,
            intentRef: consent.intentRef,
            clientRequestId: collaborationRequestId("discard-preview"),
            reason: "Share preview was not confirmed",
            expectedStatus: "prepared"
          }).then(resultValue).catch((error2) => {
            this.reportFailure(error2);
          });
        }
        this.patch({
          overlay: this.store.getSnapshot().overlay === "share" ? "closed" : this.store.getSnapshot().overlay,
          sharePreview: null,
          shareTargetNames: [],
          pendingIntent: false
        });
      }
      newBatchBuilder() {
        let release;
        const ready = new Promise((resolve) => {
          release = resolve;
        });
        queueMicrotask(release);
        const builder = { routes: [], targets: [], tokens: [], targetNames: [], ready, prepared: null };
        this.batchBuilder = builder;
        return builder;
      }
      async prepareBatch(builder, bindingRevision, signal) {
        if (builder.prepared !== null) return builder.prepared;
        if (this.options.remote.prepareCollaborationIntent === void 0) {
          throw new CollaborationRuntimeError(
            "loop-collaboration/capability-unsupported",
            "This Loop Host cannot prepare collaborator messages."
          );
        }
        builder.prepared = (async () => {
          const payloadText = builder.tokens.join("\n");
          const payloadDigest = await collaborationDigest(payloadText);
          signal.throwIfAborted();
          let shareScope = this.store.getSnapshot().shareScope;
          const personalDescription = (!this.store.getSnapshot().status?.scope?.projectId || builder.targets.every((target) => target.targetType === "human")) && shareScope.scope === "task-description" && shareScope.resourceRefs.length === 0;
          if (personalDescription) shareScope = { ...shareScope, expandedAudience: true };
          const prepare = () => this.options.remote.prepareCollaborationIntent({
            sessionId: this.sessionId,
            bindingRevision,
            references: builder.targets,
            serializedText: payloadText,
            payloadDigest,
            shareScope,
            activateOnClaim: shareScope.expandedAudience,
            expiresAt: new Date(Date.now() + 5 * 6e4).toISOString()
          }, signal);
          let value = resultValue(await prepare());
          if (value.state !== "prepared") {
            throw new CollaborationRuntimeError(
              "loop-collaboration/intent-not-accepted",
              `Loop did not prepare this message (${value.state}).`
            );
          }
          if (!shareScope.expandedAudience) {
            shareScope = await this.awaitShareConsent(
              value.intentRef,
              value.sharePreview,
              builder.targetNames,
              shareScope,
              value.expiresAt,
              signal
            );
            signal.throwIfAborted();
            if (value.activationOwner !== void 0) {
              resultValue(await this.options.remote.cancelCollaborationIntent({
                sessionId: this.sessionId,
                intentRef: value.intentRef,
                clientRequestId: collaborationRequestId("confirm-share"),
                reason: "Replace preview with confirmed share scope",
                expectedStatus: "prepared"
              }, signal));
              value = resultValue(await prepare());
            }
          }
          return {
            hostManaged: value.activationOwner === "host",
            intentRef: value.intentRef,
            tokens: [...builder.tokens],
            targets: [...builder.targets],
            shareScope,
            targetNames: [...builder.targetNames],
            bindingRevision,
            existingRequestIds: new Set(
              this.face.getSnapshot().pendingSubmissions.map((item) => item.requestId)
            )
          };
        })();
        return builder.prepared;
      }
      async bindPending(request) {
        const prepared = this.prepared ?? (this.pendingRecovery?.request.requestId === request.requestId ? this.pendingRecovery.prepared : null);
        if (prepared === null || this.options.remote.bindCollaborationIntent === void 0 || this.options.remote.prepareCollaborationIntent === void 0 || this.options.remote.cancelCollaborationIntent === void 0) {
          if (prepared !== null) {
            this.reportFailure(new CollaborationRuntimeError(
              "loop-collaboration/capability-unsupported",
              "This Loop Host cannot finish linking the accepted message."
            ));
          }
          return false;
        }
        this.handledRequestIds.add(request.requestId);
        this.prepared = null;
        const recovery = this.pendingRecovery?.request.requestId === request.requestId ? this.pendingRecovery : this.pendingRecovery = {
          prepared,
          request,
          placeholderCancelRequestId: collaborationRequestId("replace-intent"),
          placeholderCancelled: false
        };
        const payloadDigest = await collaborationDigest(request.text);
        this.patch({ busy: `bind:${request.requestId}`, error: null, notice: null });
        try {
          if (!recovery.placeholderCancelled) {
            const cancelled = await this.options.remote.cancelCollaborationIntent({
              sessionId: this.sessionId,
              intentRef: prepared.intentRef,
              clientRequestId: recovery.placeholderCancelRequestId,
              reason: "Replace the reference-only intent with the accepted message identity",
              expectedStatus: "prepared"
            });
            resultValue(cancelled);
            recovery.placeholderCancelled = true;
          }
          if (recovery.exactIntentRef === void 0 || recovery.exactPayloadDigest === void 0) {
            const exact = await this.options.remote.prepareCollaborationIntent({
              sessionId: this.sessionId,
              bindingRevision: prepared.bindingRevision,
              references: prepared.targets,
              serializedText: request.text,
              payloadDigest,
              shareScope: prepared.shareScope,
              expiresAt: new Date(Date.now() + 5 * 6e4).toISOString()
            });
            const exactIntent = resultValue(exact);
            if (exactIntent.state !== "prepared") {
              throw new CollaborationRuntimeError(
                "loop-collaboration/intent-not-accepted",
                `Loop did not prepare the accepted message (${exactIntent.state}).`
              );
            }
            if (!prepared.shareScope.expandedAudience) {
              throw new CollaborationRuntimeError(
                "loop-collaboration/intent-not-accepted",
                "The accepted message did not include confirmed share scope."
              );
            }
            recovery.exactIntentRef = exactIntent.intentRef;
            recovery.exactPayloadDigest = exactIntent.payloadDigest;
          }
          const result = await this.options.remote.bindCollaborationIntent({
            intentRef: recovery.exactIntentRef,
            sessionId: this.sessionId,
            requestId: request.requestId,
            payloadDigest: recovery.exactPayloadDigest,
            acceptedSerializedText: request.text,
            bindingRevision: prepared.bindingRevision
          });
          const value = resultValue(result);
          if (value.state !== "bound" && value.state !== "accepted" && value.state !== "activating" && value.state !== "activated") {
            throw new CollaborationRuntimeError(
              "loop-collaboration/intent-not-accepted",
              `The accepted message could not be linked to Loop (${value.state}).`
            );
          }
          this.patch({
            busy: null,
            notice: "intent-bound",
            pendingIntent: false
          });
          this.pendingRecovery = null;
          await this.refreshStatus().catch(() => void 0);
          return true;
        } catch (error) {
          this.reportFailure(error);
          if (this.store.getSnapshot().busy === `bind:${request.requestId}`) this.patch({ busy: null });
          return false;
        }
      }
      onSessionChange = () => {
        const pending = this.face.getSnapshot().pendingSubmissions;
        for (const request of pending) {
          if (this.observedRequestIds.has(request.requestId)) continue;
          this.observedRequestIds.add(request.requestId);
          const prepared = this.prepared;
          if (prepared !== null && !prepared.existingRequestIds.has(request.requestId) && requestMatchesText(request, prepared.tokens)) {
            if (!prepared.hostManaged) void this.bindPending(request);
            continue;
          }
          if (request.text.includes("<loop-collaboration")) {
            this.patch({
              continuation: {
                state: "needs-explicit-target",
                requestId: request.requestId,
                taskCount: 0,
                taskIds: []
              },
              notice: "continuation-needs-target"
            });
            continue;
          }
        }
      };
      async bindContinuation(request, continuationRef = collaborationRequestId("continue")) {
        const existing = this.continuationRequests.get(request.requestId);
        if (existing !== void 0) return existing;
        const task = this.bindContinuationRequest(request, continuationRef);
        this.continuationRequests.set(request.requestId, task);
        try {
          return await task;
        } finally {
          if (this.continuationRequests.get(request.requestId) === task) {
            this.continuationRequests.delete(request.requestId);
          }
        }
      }
      async bindContinuationRequest(request, continuationRef) {
        const previous = this.store.getSnapshot().status;
        const previouslyActive = previous !== void 0 && previous !== null && (previous.active.length > 0 || previous.deliveries.some((delivery) => delivery.eventKind === "collaboration.task_message"));
        const status = await this.refreshStatus().catch(() => null);
        if (status === null) {
          if (previouslyActive) {
            this.continuationFailures.set(request.requestId, { request, continuationRef });
            this.patch({
              continuation: {
                state: "error",
                requestId: request.requestId,
                taskCount: previous?.active.length ?? 0,
                taskIds: previous?.active.map((task) => task.taskId) ?? [],
                failedCount: this.continuationFailures.size
              },
              notice: "continuation-failed"
            });
          }
          return false;
        }
        const activeCandidate = (status.state === "ready" || status.state === "degraded") && (status.active.length > 0 || status.deliveries.some((delivery) => delivery.eventKind === "collaboration.task_message" && delivery.state !== "canceled" && delivery.state !== "revoked" && delivery.state !== "binding-conflict" && delivery.state !== "blocked"));
        if (!activeCandidate) {
          this.patch({
            continuation: {
              state: "no-active-work",
              taskCount: 0,
              taskIds: [],
              failedCount: this.continuationFailures.size
            }
          });
          return true;
        }
        if (this.options.remote.bindCollaborationContinuation === void 0) {
          this.patch({
            continuation: {
              state: "unavailable",
              requestId: request.requestId,
              taskCount: status.active.length,
              taskIds: []
            },
            notice: "continuation-unavailable"
          });
          return false;
        }
        const bindingRevision = status.scope?.bindingRevision;
        if (bindingRevision === void 0 || bindingRevision === "") {
          this.patch({
            continuation: {
              state: "stale",
              requestId: request.requestId,
              taskCount: status.active.length,
              taskIds: []
            },
            notice: "continuation-failed"
          });
          return false;
        }
        this.patch({
          continuation: {
            state: "binding",
            requestId: request.requestId,
            taskCount: status.active.length,
            taskIds: []
          },
          notice: null
        });
        try {
          const payloadDigest = await collaborationDigest(request.text);
          const result = await this.options.remote.bindCollaborationContinuation({
            sessionId: this.sessionId,
            requestId: request.requestId,
            continuationRef,
            bindingRevision,
            payloadDigest,
            acceptedSerializedText: request.text
          });
          const value = resultValue(result);
          const tasks = value.tasks ?? [];
          switch (value.state) {
            case "ready":
              this.continuationFailures.delete(request.requestId);
              this.patch({
                continuation: {
                  state: "ready",
                  requestId: request.requestId,
                  taskCount: tasks.length,
                  taskIds: tasks.map((task) => task.taskId),
                  ...value.localIntentId === void 0 ? {} : { intentId: value.localIntentId },
                  failedCount: this.continuationFailures.size,
                  ...value.reason === void 0 ? {} : { reason: value.reason }
                },
                notice: "continuation-linked"
              });
              return true;
            case "no-active-work":
              this.continuationFailures.delete(request.requestId);
              this.patch({
                continuation: {
                  state: "no-active-work",
                  taskCount: 0,
                  taskIds: [],
                  failedCount: this.continuationFailures.size
                }
              });
              return true;
            case "needs-explicit-target":
              this.continuationFailures.delete(request.requestId);
              this.patch({
                continuation: {
                  state: "needs-explicit-target",
                  requestId: request.requestId,
                  taskCount: tasks.length,
                  taskIds: tasks.map((task) => task.taskId),
                  ...value.localIntentId === void 0 ? {} : { intentId: value.localIntentId },
                  failedCount: this.continuationFailures.size,
                  ...value.reason === void 0 ? {} : { reason: value.reason }
                },
                notice: "continuation-needs-target"
              });
              return true;
            case "stale":
              throw new CollaborationRuntimeError(
                "loop-collaboration/binding-stale",
                value.reason ?? "The active Loop work no longer matches this Session generation or binding"
              );
          }
        } catch (error) {
          this.continuationFailures.set(request.requestId, { request, continuationRef });
          this.patch({
            continuation: {
              state: "error",
              requestId: request.requestId,
              taskCount: status.active.length,
              taskIds: status.active.map((task) => task.taskId),
              ...error instanceof Error ? { reason: error.message } : {},
              failedCount: this.continuationFailures.size
            },
            notice: "continuation-failed"
          });
          return false;
        }
      }
      async retryContinuation() {
        const failures = [...this.continuationFailures.values()];
        for (const failure2 of failures) {
          await this.bindContinuation(failure2.request, failure2.continuationRef);
        }
      }
      async fetchDirectory(query, signal, kinds, cursor) {
        if (this.options.remote.collaborationDirectory === void 0) {
          throw new CollaborationRuntimeError(
            "loop-collaboration/capability-unsupported",
            "This Loop Host cannot search collaborators."
          );
        }
        const result = await this.options.remote.collaborationDirectory({
          sessionId: this.sessionId,
          query: query.slice(0, 200),
          limit: 50,
          ...cursor === void 0 ? {} : { cursor },
          ...kinds === void 0 ? {} : { kinds }
        }, signal);
        signal.throwIfAborted();
        return resultValue(result);
      }
      restartStream(status) {
        const scope = status.scope;
        if (scope === void 0 || this.options.remote.collaborationEvents === void 0) return;
        const bindingKey = JSON.stringify([scope.bindingId, scope.bindingEpoch]);
        if (this.stream !== null && this.streamBindingEpoch === bindingKey) return;
        this.stream?.abort();
        const controller = new AbortController();
        this.stream = controller;
        this.streamBindingEpoch = bindingKey;
        void (async () => {
          try {
            for await (const frame of this.options.remote.collaborationEvents(
              { sessionId: this.sessionId },
              controller.signal
            )) {
              if (controller.signal.aborted) break;
              this.applyFrame(frame);
            }
          } catch (error) {
            if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") return;
            this.patch({
              screen: "error",
              error: {
                code: "loop-collaboration/server-unavailable",
                message: error instanceof Error ? error.message : ""
              }
            });
          } finally {
            if (this.stream === controller) {
              this.stream = null;
              this.streamBindingEpoch = "";
            }
          }
        })();
      }
      applyFrame(frame) {
        if (frame.type === "ready") {
          this.patch({ status: frame.status ?? this.store.getSnapshot().status });
          return;
        }
        if (frame.type === "error") {
          this.patch({ error: frame.error });
          return;
        }
        if (this.seenEventIds.has(frame.event.eventId)) return;
        this.seenEventIds.add(frame.event.eventId);
        if (this.seenEventIds.size > 256) {
          const oldest = this.seenEventIds.values().next().value;
          if (oldest !== void 0) this.seenEventIds.delete(oldest);
        }
        if (frame.event.kind === "intent.changed" && frame.event.intent !== void 0) {
          const intent = frame.event.intent;
          if (this.prepared && this.prepared.intentRef !== intent.intentRef && this.prepared.intentRef !== intent.sourceIntentRef) return;
          if (intent.state === "failed" || intent.state === "activated") {
            this.prepared = null;
            this.pendingRecovery = null;
            this.patch({
              pendingIntent: false,
              busy: null,
              ...intent.state === "failed" ? { error: {
                code: "loop-collaboration/intent-not-accepted",
                message: intent.reason ?? "Loop submission failed"
              } } : { notice: "intent-bound" }
            });
          }
          return;
        }
        if (frame.event.kind === "binding.changed") {
          this.invalidateForScopeChange();
          void this.refreshStatus().catch(() => void 0);
          return;
        }
        if (frame.event.kind === "directory.changed") return;
        const current = this.store.getSnapshot().status;
        if (current === null) return;
        if (frame.event.worksite !== void 0) {
          this.patch({ status: { ...current, worksite: frame.event.worksite } });
          return;
        }
        if (frame.event.active !== void 0) {
          const active = current.active.filter((item) => item.taskId !== frame.event.active.taskId);
          this.patch({ status: { ...current, active: [frame.event.active, ...active] } });
        } else if (frame.event.delivery !== void 0) {
          const deliveries = current.deliveries.filter((item) => item.deliveryId !== frame.event.delivery.deliveryId);
          const deliveryState = frame.event.delivery.state;
          const statusState = current.state === "ready" && ["needs-auth", "revoked", "binding-conflict", "blocked", "reconcile"].includes(deliveryState) ? "degraded" : current.state;
          this.patch({
            status: {
              ...current,
              state: statusState,
              deliveries: [frame.event.delivery, ...deliveries].slice(0, 100)
            }
          });
        } else {
          void this.refreshStatus().catch(() => void 0);
        }
      }
      invalidateForScopeChange() {
        this.rejectShareConsent(new CollaborationRuntimeError(
          "loop-collaboration/binding-stale",
          "The Loop board changed during share review."
        ));
        this.prepared = null;
        this.batchBuilder = null;
        this.pendingRecovery = null;
        this.handledRequestIds.clear();
        this.continuationRequests.clear();
        this.continuationFailures.clear();
        this.stream?.abort();
        this.stream = null;
        this.streamBindingEpoch = "";
        this.patch({
          boards: [],
          boardsRevision: "",
          sharePreview: null,
          shareTargetNames: [],
          pendingIntent: false,
          continuation: { state: "idle", taskCount: 0, taskIds: [] },
          shareScope: {
            ...this.store.getSnapshot().shareScope,
            resourceRefs: [],
            expandedAudience: false
          }
        });
      }
      openExistingBinding(workspace) {
        this.patch({ busy: null, overlay: "closed" });
        if (this.openBindingTimer !== null) clearTimeout(this.openBindingTimer);
        this.openBindingTimer = setTimeout(() => {
          this.openBindingTimer = null;
          if (!this.disposed) this.options.openBinding(workspace, this.sessionId);
        }, 0);
      }
      reportFailure(error) {
        const failure2 = error instanceof CollaborationRuntimeError ? { code: error.code, message: error.message } : {
          code: "loop-collaboration/internal",
          message: error instanceof Error ? error.message : "Loop collaboration failed."
        };
        this.patch({ screen: "error", error: failure2 });
      }
      patch(next) {
        if (this.disposed) return;
        this.store.set({ ...this.store.getSnapshot(), ...next });
      }
    };
    var CollaborationRuntime = class {
      options;
      sessions = /* @__PURE__ */ new Map();
      constructor(options) {
        this.options = options;
      }
      forSession(sessionId) {
        const existing = this.sessions.get(sessionId);
        if (existing !== void 0) return existing;
        const created = new CollaborationSessionRuntime(sessionId, this.options);
        this.sessions.set(sessionId, created);
        if (this.sessions.size > 64) {
          const oldest = this.sessions.keys().next().value;
          if (oldest !== void 0 && oldest !== sessionId) {
            this.sessions.get(oldest)?.dispose();
            this.sessions.delete(oldest);
          }
        }
        return created;
      }
      dispose() {
        for (const runtime of this.sessions.values()) runtime.dispose();
        this.sessions.clear();
      }
      registerSource(inputTriggers, sectionLabel, failureLabel, labels) {
        const owner = this;
        const codec2 = {
          clipboardText: (ref) => {
            const reference = decodeCollaborationReference(ref);
            return reference === null ? "" : `@${reference.displayName}`;
          },
          serialize: (ref, signal) => {
            const reference = decodeCollaborationReference(ref);
            if (reference === null) return Promise.reject(new CollaborationRuntimeError(
              "loop-collaboration/intent-expired",
              "This collaborator reference is invalid. Select it again."
            ));
            const runtime = owner.forSession(reference.sessionId);
            return runtime.serializeReference(ref, signal).catch((error) => {
              if (!(error instanceof CollaborationRuntimeError && error.code === "loop-collaboration/cancelled")) {
                runtime.showFailure(error);
              }
              throw new Error(failureLabel(
                error instanceof CollaborationRuntimeError ? { code: error.code, message: error.message } : { code: "loop-collaboration/internal", message: "" }
              ));
            });
          }
        };
        const source = {
          trigger: "@",
          name: "loop-collaboration",
          order: 30,
          codec: codec2,
          async candidates(session, req) {
            const runtime = owner.forSession(session.sessionId);
            let entries;
            try {
              entries = await runtime.ensureDirectory(req.query, req.signal);
            } catch (error) {
              req.signal.throwIfAborted();
              runtime.showFailure(error);
              const failure2 = runtime.store.getSnapshot().error;
              return [{
                name: failureLabel(failure2 ?? { code: "loop-collaboration/internal", message: "" }),
                section: "Loop",
                value: "directory-error"
              }];
            }
            return entries.map((entry) => {
              const actions = [];
              if (entry.delegable || entry.capability.assignable) actions.push(labels.delegate);
              if (entry.notifiable) actions.push(labels.notify);
              const description = entry.needsAccess ? labels.needsAccess : actions.length === 0 ? entry.staleReason ?? labels.unavailable : [entry.description, actions.join(" / ")].filter(Boolean).join(" \xB7 ");
              return {
                name: entry.displayName,
                label: entry.displayName,
                description,
                section: sectionLabel(entry.targetType),
                hint: [entry.workspaceName, entry.projectName].filter(Boolean).join(" / ") || void 0,
                value: runtime.candidateValue(entry)
              };
            });
          },
          warm: (session) => {
            void owner.forSession(session.sessionId).warm();
          },
          onPick: (pick) => {
            const runtime = owner.forSession(pick.session.sessionId);
            if (pick.candidate.value === "directory-error") {
              runtime.showDirectoryError();
              return "handled";
            }
            return runtime.pickCandidate(pick);
          },
          openReference: (session, reference) => owner.forSession(session.sessionId).openReference(reference.ref)
        };
        return inputTriggers.registerSource(source);
      }
    };

    // client/ui/external-link.ts
    function validatedExternalUrl(url) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return null;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "") return null;
      return parsed.href;
    }
    function openExternal(url, host) {
      const target = validatedExternalUrl(url);
      if (target === null) return false;
      const opened = host.open(target, "_blank");
      if (opened !== null) opened.opener = null;
      return host.protocol === "dsh-app:" || opened !== null;
    }
    function externalUrlWithLocale(url, locale) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return null;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "") return null;
      if (parsed.pathname.replace(/\/+$/u, "").endsWith("/external-host/page-login")) {
        const fragment = new URLSearchParams(parsed.hash.startsWith("#") ? parsed.hash.slice(1) : "");
        fragment.set("locale", locale);
        parsed.hash = fragment.toString();
      } else {
        parsed.searchParams.set("locale", locale);
      }
      return parsed.href;
    }

    // client/ui/loop-skill-errors.ts
    var LoopSkillRuntimeError = class extends Error {
      code;
      constructor(code, message) {
        super(message);
        this.name = "LoopSkillRuntimeError";
        this.code = code;
      }
    };
    function loopSkillError(code, message) {
      return new LoopSkillRuntimeError(code, message);
    }
    function asLoopSkillRuntimeError(error, fallbackCode) {
      if (error instanceof LoopSkillRuntimeError) return error;
      const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : fallbackCode;
      return new LoopSkillRuntimeError(
        code,
        error instanceof Error ? error.message : "Loop Skill request failed."
      );
    }
    function withLocalizedLoopSkillMessage(error, formatFailure) {
      const message = formatFailure({ code: error.code, message: error.message });
      return message === error.message ? error : new LoopSkillRuntimeError(error.code, message);
    }

    // client/ui/loop-skill-reference.ts
    var MAX_REFERENCE_BYTES = 16 << 10;
    var MAX_ENCODED_REFERENCE_CHARS = Math.ceil(MAX_REFERENCE_BYTES / 3) * 4;
    var MAX_PATH_RUNES = 1024;
    var MAX_PATH_SEGMENTS = 64;
    function loopSkillDisplayName(entry) {
      return loopCatalogDisplayName(entry.name);
    }
    function loopSkillCandidateName(entry) {
      const slug = entry.name.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 42) || "skill";
      const hash = stableHash([
        entry.skillId,
        entry.path,
        entry.versionId ?? "",
        entry.commitSha ?? "",
        entry.sourceRevision
      ].join("\0"));
      return `loop-skill-${slug}-${hash}`;
    }
    function referenceForLoopSkill(sessionId, entry) {
      const handle = exactHandle(entry.versionId, entry.commitSha);
      if (handle === null) {
        throw loopSkillError(
          "loop-skill/invalid-version-handle",
          "The Loop Skill catalog returned an invalid exact content handle."
        );
      }
      return {
        version: 1,
        sessionId,
        skillId: entry.skillId,
        path: normalizePath(entry.path),
        ...handle,
        sourceRevision: entry.sourceRevision,
        name: loopSkillCandidateName(entry),
        displayName: loopSkillDisplayName(entry),
        ...entry.librarySlug === void 0 || entry.librarySlug === "" ? {} : { librarySlug: entry.librarySlug },
        libraryName: entry.libraryName
      };
    }
    function encodeLoopSkillReference(reference) {
      const normalized = normalizeReference(reference);
      if (normalized instanceof Error) throw normalized;
      const payload = JSON.stringify(normalized);
      if (new TextEncoder().encode(payload).byteLength > MAX_REFERENCE_BYTES) {
        throw loopSkillError("loop-skill/reference-too-large", "Loop Skill reference is oversized");
      }
      const bytes = new TextEncoder().encode(payload);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `<loop-skill-ref>${btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "")}</loop-skill-ref>`;
    }
    function decodeLoopSkillReference(value) {
      const decoded = decodeLoopSkillReferenceResult(value);
      return decoded instanceof Error ? null : decoded;
    }
    function decodeLoopSkillReferenceResult(value) {
      const match = /^<loop-skill-ref>([A-Za-z0-9_-]+)<\/loop-skill-ref>$/u.exec(value);
      if (match === null) {
        return loopSkillError("loop-skill/invalid-reference", "Loop Skill reference is invalid");
      }
      if (match[1].length > MAX_ENCODED_REFERENCE_CHARS) {
        return loopSkillError("loop-skill/reference-too-large", "Loop Skill reference is oversized");
      }
      try {
        const base64 = match[1].replace(/-/gu, "+").replace(/_/gu, "/");
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return loopSkillError("loop-skill/invalid-reference", "Loop Skill reference is invalid");
        }
        return normalizeReference(parsed);
      } catch {
        return loopSkillError("loop-skill/invalid-reference", "Loop Skill reference is invalid");
      }
    }
    function loopSkillCandidate(sessionId, entry, duplicateName) {
      const reference = referenceForLoopSkill(sessionId, entry);
      return {
        name: reference.displayName,
        label: reference.displayName,
        description: [
          entry.description,
          entry.libraryName !== entry.name ? entry.libraryName : void 0
        ].filter(Boolean).join(" \xB7 ") || entry.libraryDescription || entry.libraryName,
        hint: duplicateName ? `${entry.libraryName} \xB7 ${entry.path}` : void 0,
        value: JSON.stringify(reference)
      };
    }
    function loopSkillCodec(sessionId, formatFailure) {
      const localized = (error) => withLocalizedLoopSkillMessage(error, formatFailure);
      return {
        clipboardText: (value) => {
          const reference = decodeLoopSkillReference(value);
          return reference === null || reference.sessionId !== sessionId ? "" : `/${reference.name}`;
        },
        serialize: async (value, signal) => {
          signal.throwIfAborted();
          const decoded = decodeLoopSkillReferenceResult(value);
          if (decoded instanceof Error) {
            throw localized(decoded);
          }
          if (decoded.sessionId !== sessionId) {
            const error = loopSkillError(
              "loop-skill/session-mismatch",
              "This Loop Skill reference belongs to another Session."
            );
            throw localized(error);
          }
          try {
            return encodeLoopSkillReference(decoded);
          } catch (error) {
            throw localized(asLoopSkillRuntimeError(error, "loop-skill/invalid-reference"));
          }
        }
      };
    }
    function pickedLoopSkill(pick, sessionId) {
      if (pick.action !== "pick" || typeof pick.candidate.value !== "string") return void 0;
      let reference;
      try {
        const parsed = JSON.parse(pick.candidate.value);
        const normalized = normalizeReference(parsed);
        if (normalized instanceof Error || normalized.sessionId !== sessionId) return void 0;
        reference = normalized;
      } catch {
        return void 0;
      }
      const ref = encodeLoopSkillReference(reference);
      return {
        insert: {
          source: "loop-skills",
          ref,
          label: reference.displayName,
          appearance: "skill",
          clipboardText: `/${reference.name}`
        }
      };
    }
    function normalizeReference(value) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return loopSkillError("loop-skill/invalid-reference", "Loop Skill reference is invalid");
      }
      const raw = value;
      if (raw.version !== 1 || typeof raw.sessionId !== "string" || raw.sessionId === "" || typeof raw.skillId !== "string" || raw.skillId === "" || typeof raw.sourceRevision !== "string" || raw.sourceRevision === "" || typeof raw.name !== "string" || raw.name === "" || typeof raw.displayName !== "string" || raw.displayName === "" || typeof raw.libraryName !== "string" || raw.libraryName === "") {
        return loopSkillError("loop-skill/invalid-reference", "Loop Skill reference is invalid");
      }
      const handle = exactHandle(
        typeof raw.versionId === "string" ? raw.versionId : void 0,
        typeof raw.commitSha === "string" ? raw.commitSha : void 0
      );
      if (handle === null) {
        return loopSkillError(
          "loop-skill/invalid-version-handle",
          "Loop Skill reference has an invalid exact content handle"
        );
      }
      let normalizedPath;
      try {
        normalizedPath = normalizePath(typeof raw.path === "string" ? raw.path : "");
      } catch (error) {
        return error instanceof Error ? error : loopSkillError("loop-skill/unsupported-path", "Loop Skill path is unsupported");
      }
      return {
        version: 1,
        sessionId: raw.sessionId,
        skillId: raw.skillId,
        path: normalizedPath,
        ...handle,
        sourceRevision: raw.sourceRevision,
        name: raw.name,
        displayName: raw.displayName,
        libraryName: raw.libraryName,
        ...typeof raw.librarySlug === "string" && raw.librarySlug !== "" ? { librarySlug: raw.librarySlug } : {}
      };
    }
    function exactHandle(versionIdValue, commitSHAValue) {
      const versionId = versionIdValue?.trim() ?? "";
      const commitSha = commitSHAValue?.trim() ?? "";
      if (commitSha !== "") {
        if (versionId !== "" && versionId !== `git:${commitSha}`) return null;
        return { commitSha };
      }
      if (versionId.startsWith("git:")) {
        const legacyCommit = versionId.slice("git:".length);
        return legacyCommit === "" ? null : { commitSha: legacyCommit };
      }
      return versionId === "" ? null : { versionId };
    }
    function normalizePath(raw) {
      const value = raw.trim();
      if (value === "" || Array.from(value).length > MAX_PATH_RUNES || value.includes("\0") || value.includes("\\")) {
        throw loopSkillError("loop-skill/unsupported-path", "Loop Skill path is unsupported");
      }
      const parts = value.split("/");
      if (parts.length > MAX_PATH_SEGMENTS) {
        throw loopSkillError("loop-skill/unsupported-path", "Loop Skill path is unsupported");
      }
      const cleaned = parts.map((part) => part.trim());
      if (cleaned.some((part) => part === "" || part === "." || part === "..")) {
        throw loopSkillError("loop-skill/unsupported-path", "Loop Skill path is unsupported");
      }
      return cleaned.join("/");
    }
    function stableHash(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    }

    // client/ui/loop-reference-display.ts
    var loopReferenceDisplayRule = {
      id: "loop.reference-display",
      order: 20,
      match(text2, from) {
        const references = /<loop-knowledge-ref>[A-Za-z0-9_-]{1,8192}<\/loop-knowledge-ref>|<loop-skill-ref>[A-Za-z0-9_-]{1,21845}<\/loop-skill-ref>|<loop-collaboration type="(?:agent|human)" target="[^"<>]{1,1200}" ref="[^"<>]{1,3072}"(?: directory="[A-Za-z0-9_.:-]{1,200}")?>([^<]{1,1530})<\/loop-collaboration>/gu;
        references.lastIndex = from;
        for (let match = references.exec(text2); match !== null; match = references.exec(text2)) {
          let knowledgeName;
          if (match[0].startsWith("<loop-knowledge-ref>")) {
            try {
              knowledgeName = `Loop \xB7 ${decodeKnowledgeReference(match[0]).name}`;
            } catch {
              continue;
            }
          }
          const display = knowledgeName ?? (match[1] === void 0 ? decodeLoopSkillReference(match[0])?.displayName : "@" + match[1].replace(/&(amp|quot|lt|gt);/gu, (entity) => ({ "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">" })[entity]));
          if (display === void 0) continue;
          return {
            id: "text",
            start: match.index,
            end: match.index + match[0].length,
            data: { text: match[0], display }
          };
        }
        return void 0;
      }
    };

    // client/ui/loop-resource-links.ts
    function registerLoopResourceLinks(document2, open) {
      const onClick = (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
        if (anchor === void 0 || anchor.hasAttribute("download") || anchor.isContentEditable || !["", "_self", "_blank"].includes(anchor.target.toLowerCase())) return;
        const href = anchor.getAttribute("href");
        if (href === null || !open(href)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      document2.addEventListener("click", onClick, true);
      return () => {
        document2.removeEventListener("click", onClick, true);
      };
    }

    // client/ui/global-workspace-bridge.ts
    var GLOBAL_WORKSPACE_BRIDGE_CHANNEL = "loop.global-page.v2";
    var WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
    var REVISION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
    function record(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function sanitizedLoopPagePath(value) {
      if (typeof value !== "string") return null;
      const path = value.trim();
      if (path.length === 0 || path.length > 2048 || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || Array.from(path).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })) {
        return null;
      }
      return path;
    }
    function normalizedLoopLocale(value) {
      if (typeof value !== "string") return null;
      const locale = value.trim().toLowerCase();
      if (locale === "en" || locale.startsWith("en-")) return "en";
      if (locale === "ja" || locale.startsWith("ja-")) return "ja";
      if (locale.startsWith("zh")) {
        return locale.startsWith("zh-tw") || locale.startsWith("zh-hk") || locale.startsWith("zh-mo") || locale.startsWith("zh-hant") ? "zh-TW" : "zh-CN";
      }
      return null;
    }
    function globalWorkspaceBridgeInit(nonce, revision, path, locale) {
      return {
        channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
        type: "init",
        nonce,
        revision,
        path,
        locale
      };
    }
    function globalWorkspaceBridgeNavigate(nonce, revision, path) {
      return {
        channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
        type: "navigate",
        nonce,
        revision,
        path
      };
    }
    function globalWorkspaceBridgeLocale(nonce, revision, locale) {
      return {
        channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
        type: "locale",
        nonce,
        revision,
        locale
      };
    }
    function isGlobalWorkspaceBridgeReady(event, expected) {
      if (event.origin !== expected.origin || expected.source === null || event.source !== expected.source) {
        return false;
      }
      const value = record(event.data);
      return value?.channel === GLOBAL_WORKSPACE_BRIDGE_CHANNEL && value.type === "ready";
    }
    function newGlobalWorkspaceBridgeNonce() {
      const random = globalThis.crypto;
      if (typeof random.randomUUID === "function") return random.randomUUID().replaceAll("-", "");
      const bytes = new Uint8Array(16);
      random.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    }
    function readGlobalWorkspaceBridgeSelection(event, expected) {
      if (event.origin !== expected.origin || expected.source === null || event.source !== expected.source) {
        return null;
      }
      const value = record(event.data);
      if (value === null || value.channel !== GLOBAL_WORKSPACE_BRIDGE_CHANNEL || value.type !== "workspace" || value.nonce !== expected.nonce || value.revision !== expected.revision || typeof value.workspaceId !== "string" || !WORKSPACE_ID.test(value.workspaceId) || typeof value.workspaceName !== "string") {
        return null;
      }
      const workspaceName = value.workspaceName.trim();
      if (workspaceName === "" || workspaceName.length > 255) return null;
      const principalId = value.principalId;
      const authEpoch = value.authEpoch;
      if (principalId === void 0 !== (authEpoch === void 0) || principalId !== void 0 && (typeof principalId !== "string" || !WORKSPACE_ID.test(principalId)) || authEpoch !== void 0 && (typeof authEpoch !== "string" || !REVISION.test(authEpoch))) {
        return null;
      }
      const workspace = {
        workspaceId: value.workspaceId,
        workspaceName
      };
      if (principalId === void 0) return workspace;
      if (authEpoch === void 0) return null;
      return { ...workspace, principalId, authEpoch };
    }
    function readGlobalWorkspaceBridgeWorkspaceCleared(event, expected) {
      if (event.origin !== expected.origin || expected.source === null || event.source !== expected.source) {
        return false;
      }
      const value = record(event.data);
      return value !== null && value.channel === GLOBAL_WORKSPACE_BRIDGE_CHANNEL && value.type === "workspace-cleared" && value.nonce === expected.nonce && value.revision === expected.revision;
    }
    function readGlobalWorkspaceBridgeRoute(event, expected) {
      if (event.origin !== expected.origin || expected.source === null || event.source !== expected.source) {
        return null;
      }
      const value = record(event.data);
      if (value === null || value.channel !== GLOBAL_WORKSPACE_BRIDGE_CHANNEL || value.type !== "route" || value.nonce !== expected.nonce || value.revision !== expected.revision) {
        return null;
      }
      return sanitizedLoopPagePath(value.path);
    }

    // client/ui/loop-navigation.ts
    var LOOP_SETTINGS_ID = "account";
    var LOOP_DEFAULT_PATH = "/tasks/views/related-to-me";
    var LOOP_PROJECTS_PANEL_ID = "loop-projects";
    var LOOP_MODULES = Object.freeze([
      { id: "loop-inbox", path: "/inbox", label: "module.inbox", placement: "more" },
      { id: "loop-contacts", path: "/contacts", label: "module.contacts", placement: "more" },
      { id: "loop-tasks", path: LOOP_DEFAULT_PATH, label: "module.tasks", placement: "sidebar" },
      { id: LOOP_PROJECTS_PANEL_ID, path: "/projects", label: "module.projects", placement: "more" },
      { id: "loop-workflows", path: "/workflows/schedules", label: "module.workflows", placement: "more" },
      { id: "loop-knowledge", path: "/kb", label: "module.knowledge", placement: "more" },
      { id: "loop-drive", path: "/drives", label: "module.drive", placement: "more" },
      { id: "loop-dataspaces", path: "/dataspaces", label: "module.dataspaces", placement: "more" },
      { id: "loop-capabilities", path: "/exports/roles", label: "module.capabilities", placement: "more" },
      { id: "loop-connectors", path: "/connectors", label: "module.connectors", placement: "more" }
    ]);
    var byId = new Map(LOOP_MODULES.map((module2) => [module2.id, module2]));
    function loopModuleForPanel(panelId) {
      return panelId === null ? null : byId.get(panelId) ?? null;
    }
    function hasSegment(path, prefix) {
      return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`);
    }
    function loopPanelForPath(rawPath) {
      const path = (rawPath.split(/[?#]/u, 1)[0] ?? rawPath).replace(/^\/w\/[^/]+(?=\/|$)/u, "");
      if (hasSegment(path, "/workflows") || hasSegment(path, "/automations") || hasSegment(path, "/settings/automations") || path.startsWith("/inbox/workflow-runs/")) {
        return "loop-workflows";
      }
      if (hasSegment(path, "/contacts") || hasSegment(path, "/machines")) {
        return "loop-contacts";
      }
      if (hasSegment(path, "/projects") || hasSegment(path, "/start-work")) {
        return LOOP_PROJECTS_PANEL_ID;
      }
      if (path.startsWith("/inbox/tasks/") || /^\/channels\/[^/]+\/tasks(?:\/|$)/u.test(path)) {
        return "loop-tasks";
      }
      if (hasSegment(path, "/inbox")) return "loop-inbox";
      if (hasSegment(path, "/connectors")) return "loop-connectors";
      if (hasSegment(path, "/tasks")) {
        return "loop-tasks";
      }
      if (hasSegment(path, "/kb")) return "loop-knowledge";
      if (hasSegment(path, "/drives") || hasSegment(path, "/files")) {
        return "loop-drive";
      }
      if (hasSegment(path, "/dataspaces") || hasSegment(path, "/dashboards")) {
        return "loop-dataspaces";
      }
      if (hasSegment(path, "/capabilities") || hasSegment(path, "/exports/skills") || hasSegment(path, "/exports/roles") || hasSegment(path, "/settings/agent-skills") || hasSegment(path, "/settings/agent-roles")) {
        return "loop-capabilities";
      }
      return null;
    }
    function loopResourceLink(href, serverUrl) {
      if (serverUrl === null || !/^https?:\/\//iu.test(href) || /[\\\u0000-\u0020\u007f]/u.test(href)) return null;
      let url;
      let server;
      try {
        url = new URL(href);
        server = new URL(serverUrl);
      } catch {
        return null;
      }
      if (!["https:", "http:"].includes(server.protocol) || url.origin !== server.origin || url.username !== "" || url.password !== "" || server.username !== "" || server.password !== "" || server.search !== "" || server.hash !== "") return null;
      const basePath = server.pathname.replace(/\/+$/u, "");
      if (basePath !== "" && !url.pathname.startsWith(`${basePath}/`)) return null;
      const path = sanitizedLoopPagePath(`${url.pathname.slice(basePath.length)}${url.search}${url.hash}`);
      if (path === null) return null;
      const panelId = loopPanelForPath(path);
      return panelId === null ? null : { panelId, path };
    }

    // client/ui/shared-data-runtime.ts
    var SHARED_DATA_SCHEMA_VERSION = 1;
    var SHARED_DATA_CHANNEL = "loop.global-page.v2";
    var INITIAL_SHARED_DATA_STATE = Object.freeze({
      phase: "idle",
      identity: null,
      subscriptionId: "",
      sequence: 0,
      data: null,
      reason: null
    });
    var ID3 = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
    var EPOCH = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/u;
    var SUBSCRIPTION = /^[A-Za-z0-9_-]{1,128}$/u;
    function record2(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function nonnegativeInteger(value) {
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    }
    function nullableTimestamp(value) {
      if (value === null) return null;
      return nonnegativeInteger(value) ? value : void 0;
    }
    function readIdentity(value) {
      if (typeof value.workspaceId !== "string" || !ID3.test(value.workspaceId) || typeof value.principalId !== "string" || !ID3.test(value.principalId) || typeof value.authEpoch !== "string" || !EPOCH.test(value.authEpoch)) {
        return null;
      }
      return {
        workspaceId: value.workspaceId,
        principalId: value.principalId,
        authEpoch: value.authEpoch
      };
    }
    function readUnread(value) {
      const input = record2(value);
      if (input?.status === "not-ready") return { status: "not-ready" };
      if (input?.status !== "ready" || !nonnegativeInteger(input.total) || input.conversationCount !== null && !nonnegativeInteger(input.conversationCount)) {
        return null;
      }
      return {
        status: "ready",
        total: input.total,
        conversationCount: input.conversationCount
      };
    }
    function mergeUnread(current, incoming) {
      if (incoming.status === "ready") return incoming;
      return current?.status === "ready" ? current : incoming;
    }
    function readConnection(value) {
      const input = record2(value);
      if (input === null) return null;
      const connectedAt = nullableTimestamp(input.connectedAt);
      const retryAt = nullableTimestamp(input.retryAt);
      if (input.phase !== "connecting" && input.phase !== "connected" && input.phase !== "reconnecting" && input.phase !== "disconnected" || !nonnegativeInteger(input.attempt) || !nonnegativeInteger(input.since) || connectedAt === void 0 || retryAt === void 0) {
        return null;
      }
      return {
        phase: input.phase,
        attempt: input.attempt,
        since: input.since,
        connectedAt,
        retryAt
      };
    }
    function readData(value) {
      const input = record2(value);
      if (input === null) return null;
      const unread = readUnread(input.unread);
      const connection = readConnection(input.connection);
      return unread === null || connection === null ? null : { unread, connection };
    }
    function sameIdentity2(left, right) {
      return left !== null && left.workspaceId === right.workspaceId && left.principalId === right.principalId && left.authEpoch === right.authEpoch;
    }
    function readSharedDataMessage(event, expected) {
      const value = record2(event.data);
      if (value === null || value.channel !== SHARED_DATA_CHANNEL || value.nonce !== expected.nonce || value.revision !== expected.revision || value.schemaVersion !== SHARED_DATA_SCHEMA_VERSION || typeof value.subscriptionId !== "string" || !SUBSCRIPTION.test(value.subscriptionId) || value.subscriptionId !== expected.subscriptionId) {
        return null;
      }
      const identity = readIdentity(value);
      if (identity === null || !sameIdentity2(identity, expected.identity)) {
        return null;
      }
      if (value.type === "data-snapshot") {
        const data = readData(value.data);
        if (data === null || !nonnegativeInteger(value.sequence)) return null;
        return {
          type: "snapshot",
          identity,
          subscriptionId: value.subscriptionId,
          sequence: value.sequence,
          data
        };
      }
      if (value.type === "data-delta") {
        const changes = record2(value.changes);
        if (changes === null || !nonnegativeInteger(value.baseSequence) || !nonnegativeInteger(value.sequence)) {
          return null;
        }
        const unread = changes.unread === void 0 ? void 0 : readUnread(changes.unread);
        const connection = changes.connection === void 0 ? void 0 : readConnection(changes.connection);
        if (changes.unread !== void 0 && unread === null || changes.connection !== void 0 && connection === null || unread === void 0 && connection === void 0) {
          return null;
        }
        return {
          type: "delta",
          identity,
          subscriptionId: value.subscriptionId,
          baseSequence: value.baseSequence,
          sequence: value.sequence,
          changes: {
            ...unread == null ? {} : { unread },
            ...connection == null ? {} : { connection }
          }
        };
      }
      if (value.type === "data-unavailable") {
        if (typeof value.reason !== "string" || value.reason.length === 0 || value.reason.length > 80) {
          return null;
        }
        return {
          type: "unavailable",
          identity,
          subscriptionId: value.subscriptionId,
          reason: value.reason
        };
      }
      return null;
    }
    var LoopSharedDataRuntime = class {
      store;
      mutableStore;
      constructor() {
        this.mutableStore = createSnapshotStore(INITIAL_SHARED_DATA_STATE);
        this.store = this.mutableStore;
      }
      query() {
        return this.mutableStore.getSnapshot();
      }
      subscribe(listener) {
        return this.mutableStore.subscribe(listener);
      }
      selectIdentity(identity) {
        const current = this.mutableStore.getSnapshot();
        if (identity === null) {
          if (current.identity === null && current.phase === "idle") return false;
          this.mutableStore.set(INITIAL_SHARED_DATA_STATE);
          return true;
        }
        if (current.identity?.workspaceId === identity?.workspaceId && current.identity?.principalId === identity?.principalId && current.identity?.authEpoch === identity?.authEpoch) {
          return false;
        }
        this.mutableStore.set({
          ...INITIAL_SHARED_DATA_STATE,
          phase: identity === null ? "idle" : "waiting",
          identity
        });
        return true;
      }
      beginSubscription(identity, subscriptionId) {
        if (!SUBSCRIPTION.test(subscriptionId)) return;
        const current = this.mutableStore.getSnapshot();
        if (!sameIdentity2(current.identity, identity)) return;
        const replacingSubscription = current.subscriptionId !== "";
        this.mutableStore.set({
          phase: replacingSubscription ? "resyncing" : "waiting",
          identity,
          subscriptionId,
          sequence: 0,
          data: current.data,
          reason: current.reason
        });
      }
      accept(message) {
        const current = this.mutableStore.getSnapshot();
        if (!sameIdentity2(current.identity, message.identity) || current.subscriptionId !== message.subscriptionId) {
          return "ignored";
        }
        if (message.type === "unavailable") {
          this.mutableStore.set({
            ...current,
            phase: "unavailable",
            data: null,
            sequence: 0,
            reason: message.reason
          });
          return "accepted";
        }
        if (message.type === "snapshot") {
          const replacingSubscription = current.sequence === 0;
          if (!replacingSubscription && current.data !== null && message.sequence <= current.sequence) {
            return "ignored";
          }
          this.mutableStore.set({
            phase: "ready",
            identity: current.identity,
            subscriptionId: current.subscriptionId,
            sequence: message.sequence,
            data: {
              ...message.data,
              unread: mergeUnread(
                current.data?.unread ?? null,
                message.data.unread
              )
            },
            reason: null
          });
          return "accepted";
        }
        if (message.sequence <= current.sequence) return "ignored";
        if (current.data === null || message.baseSequence !== current.sequence) {
          this.mutableStore.set({
            ...current,
            phase: "resyncing"
          });
          return "resync";
        }
        if (message.sequence !== current.sequence + 1) {
          this.mutableStore.set({
            ...current,
            phase: "resyncing"
          });
          return "resync";
        }
        this.mutableStore.set({
          phase: "ready",
          identity: current.identity,
          subscriptionId: current.subscriptionId,
          sequence: message.sequence,
          data: {
            unread: mergeUnread(current.data.unread, message.changes.unread ?? current.data.unread),
            connection: message.changes.connection ?? current.data.connection
          },
          reason: null
        });
        return "accepted";
      }
      disconnect(reason) {
        const current = this.mutableStore.getSnapshot();
        if (current.identity === null) {
          this.mutableStore.set({
            ...INITIAL_SHARED_DATA_STATE,
            phase: "unavailable",
            reason
          });
          return;
        }
        this.mutableStore.set({
          ...current,
          phase: "unavailable",
          data: null,
          sequence: 0,
          reason
        });
      }
      reset() {
        this.mutableStore.set(INITIAL_SHARED_DATA_STATE);
      }
    };

    // client/ui/global-page-controller.ts
    var INITIAL_GLOBAL_PAGE_STATE = Object.freeze({
      screen: "idle",
      page: null,
      frameKey: 0,
      error: null,
      serverUrl: null,
      serverRevision: "",
      serverDraft: "",
      serverBusy: false,
      serverError: null,
      loopWorkspaceId: null,
      workspaceError: null,
      activePath: LOOP_DEFAULT_PATH
    });
    function startLoopGlobalPageRuntime(controller) {
      void controller.open();
      let stopped = false;
      let timer;
      const poll = async () => {
        await controller.refreshConnection();
        if (!stopped) timer = setTimeout(() => {
          void poll();
        }, 15e3);
      };
      timer = setTimeout(() => {
        void poll();
      }, 15e3);
      const onFocus = () => {
        void controller.refreshConnection();
      };
      if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
      return () => {
        stopped = true;
        clearTimeout(timer);
        if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
        controller.dispose();
      };
    }
    function failureOf(result) {
      return {
        code: result.error.code,
        message: result.error.message
      };
    }
    function transportFailure() {
      return { code: "loop/transport", message: "" };
    }
    function capabilityFailure() {
      return { code: "loop/host-update-required", message: "" };
    }
    function projectPath(target) {
      const projectId = target.projectId.trim();
      const workspaceId = target.loopWorkspaceId.trim();
      const validId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
      if (!validId.test(projectId) || !validId.test(workspaceId)) return null;
      return `/w/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`;
    }
    function normalizedLoopServerUrl(value) {
      let url;
      try {
        url = new URL(value.trim());
      } catch {
        return null;
      }
      const loopbackHttp = url.protocol === "http:" && (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost"));
      if (url.protocol !== "https:" && !loopbackHttp || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
        return null;
      }
      return url.href;
    }
    function validServerRevision(value) {
      return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(value);
    }
    var LoopGlobalPageController = class {
      store;
      actions;
      sharedData;
      remote;
      generation = 0;
      request = null;
      pendingOpen = null;
      workspaceGeneration = 0;
      workspaceRequest = null;
      workspacePendingId = null;
      bridgeFrame = null;
      bridgeOrigin = "";
      bridgeNonce = "";
      bridgeServerRevision = "";
      locale = "en";
      workspaceBridgeSuspended = false;
      modulePaths = /* @__PURE__ */ new Map();
      pendingProjectsNavigation = false;
      sharedDataGeneration = 0;
      sharedDataSubscriptionId = "";
      sharedDataTimeout = null;
      lastPageRecovery = 0;
      onRoute;
      constructor(remote, options = {}) {
        this.remote = remote;
        this.onRoute = options.onRoute;
        this.store = createSnapshotStore(INITIAL_GLOBAL_PAGE_STATE);
        this.sharedData = new LoopSharedDataRuntime();
        this.actions = {
          open: () => {
            void this.open();
          },
          reconnect: () => {
            void this.reconnect();
          },
          openProject: (target) => {
            void this.openProject(target);
          },
          openWorksite: (target) => {
            void this.openWorksite(target);
          },
          changeServerUrl: (value) => {
            this.changeServerUrl(value);
          },
          saveServer: () => {
            void this.saveServer();
          },
          openModule: (panelId) => {
            void this.openModule(panelId);
          }
        };
      }
      /** Load on first panel activation and retain the page across panel switches. */
      async open() {
        const screen = this.store.getSnapshot().screen;
        if (screen === "loading") return this.pendingOpen ?? Promise.resolve();
        if (screen === "ready" || screen === "setup") return;
        if (this.remote.globalServerStatus === void 0) {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "error",
            error: capabilityFailure()
          });
          return;
        }
        await this.startOpen();
      }
      /** Clear the iframe and its projections before any sign-out request. */
      suspend() {
        this.nextGeneration();
        this.resetWorkspaceState();
        this.store.set({
          ...this.store.getSnapshot(),
          screen: "ready",
          page: null,
          connection: { state: "signing_out" },
          error: null
        });
      }
      /** Reconcile authority without reloading a healthy iframe or its content. */
      async refreshConnection() {
        const before = this.store.getSnapshot();
        if (before.serverBusy || before.screen === "loading" || this.remote.globalServerStatus === void 0) return;
        const generation = this.generation;
        const result = await this.call((signal) => this.remote.globalServerStatus({}, signal), new AbortController().signal);
        if (generation !== this.generation || !result.ok) return;
        const status = result.value;
        if (status.serverRevision !== before.serverRevision) {
          await this.reconnect();
          return;
        }
        if (status.connection === void 0) return;
        if (status.connection.deviceOnly || status.connection.state === "signed_out" || status.connection.state === "needs_auth" || status.connection.state === "signing_out") {
          this.nextGeneration();
          this.resetWorkspaceState();
          this.store.set({ ...this.store.getSnapshot(), screen: "ready", page: null, connection: status.connection, error: null });
        } else {
          this.store.set({ ...this.store.getSnapshot(), connection: status.connection, loopWorkspaceId: status.connection.workspaceId ?? before.loopWorkspaceId });
          if (status.connection.state === "signed_in" && before.page === null) await this.loadPage(status.serverUrl, status.serverRevision);
        }
      }
      /** Retry the failed server read/page request. */
      async reconnect() {
        if (this.remote.globalServerStatus !== void 0) {
          await this.startOpen();
        } else {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "error",
            error: capabilityFailure()
          });
        }
      }
      /**
       * Route the shared page to one confirmed binding only when it belongs to the
       * configured server. The project ID is authorization input, not a page URL.
       */
      async openProject(target) {
        const path = projectPath(target);
        if (path === null) return false;
        await this.open();
        const state = this.store.getSnapshot();
        const configuredServer = normalizedLoopServerUrl(state.serverUrl ?? "");
        const targetServer = normalizedLoopServerUrl(target.serviceBaseUrl);
        if (state.screen !== "ready" || configuredServer === null || targetServer === null || configuredServer.replace(/\/+$/u, "") !== targetServer.replace(/\/+$/u, "")) {
          return false;
        }
        this.store.set({
          ...state,
          activePath: path
        });
        this.pendingProjectsNavigation = false;
        this.navigatePath(path);
        return true;
      }
      /** Open the exact workspace Start Work route in the persistent Loop page. */
      async openWorksite(target) {
        const workspaceId = target.loopWorkspaceId.trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(workspaceId)) return false;
        const path = `/w/${encodeURIComponent(workspaceId)}/start-work`;
        await this.open();
        const state = this.store.getSnapshot();
        const configuredServer = normalizedLoopServerUrl(state.serverUrl ?? "");
        const targetServer = normalizedLoopServerUrl(target.serviceBaseUrl);
        if (state.screen !== "ready" || configuredServer === null || targetServer === null || configuredServer.replace(/\/+$/u, "") !== targetServer.replace(/\/+$/u, "")) {
          return false;
        }
        this.store.set({
          ...state,
          activePath: path
        });
        this.pendingProjectsNavigation = false;
        this.navigatePath(path);
        return true;
      }
      /** Select one native module and synchronize the persistent Loop iframe. */
      async openModule(panelId) {
        const module2 = loopModuleForPanel(panelId);
        if (module2 === null) return;
        if (this.store.getSnapshot().screen !== "ready") await this.open();
        const rememberedPath = this.modulePaths.get(panelId);
        let targetPath = rememberedPath !== void 0 && loopPanelForPath(rememberedPath) === panelId ? rememberedPath : module2.path;
        this.pendingProjectsNavigation = false;
        if (targetPath === "/projects") {
          const workspaceId = this.store.getSnapshot().loopWorkspaceId;
          this.pendingProjectsNavigation = workspaceId === null;
          if (workspaceId === null) return;
          targetPath = `/w/${encodeURIComponent(workspaceId)}/projects`;
        }
        if (this.store.getSnapshot().activePath !== targetPath) {
          this.navigatePath(targetPath);
        }
      }
      /** Claim a public resource link only when the current connection can display it. */
      openResourceLink(href) {
        const state = this.store.getSnapshot();
        if (state.screen !== "ready" || state.page === null || state.serverBusy || this.workspaceBridgeSuspended || !validServerRevision(state.serverRevision) || state.connection !== void 0 && state.connection.state !== "signed_in") return null;
        const target = loopResourceLink(href, state.serverUrl);
        if (target === null) return null;
        this.pendingProjectsNavigation = false;
        this.navigatePath(target.path);
        return target.panelId;
      }
      /** Open one exact Loop task route without losing the persistent iframe. */
      openTask(workspaceId, taskId) {
        const validId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
        if (!validId.test(workspaceId) || !validId.test(taskId) || this.store.getSnapshot().screen !== "ready") {
          return false;
        }
        this.navigatePath(
          `/w/${encodeURIComponent(workspaceId)}/tasks/by-id/${encodeURIComponent(taskId)}`
        );
        return true;
      }
      changeServerUrl(value) {
        this.store.set({
          ...this.store.getSnapshot(),
          serverDraft: value,
          serverError: null
        });
      }
      /**
       * Bind one native Loop page instance to the current service origin with a
       * fresh nonce. Only messages from that frame and origin are accepted.
       */
      attachWorkspacePage(frame, pageUrl) {
        this.detachWorkspacePage();
        this.sharedData.selectIdentity(null);
        let origin;
        try {
          origin = new URL(pageUrl).origin;
        } catch {
          return;
        }
        const nonce = newGlobalWorkspaceBridgeNonce();
        this.bridgeFrame = frame;
        this.bridgeOrigin = origin;
        this.bridgeNonce = nonce;
        this.bridgeServerRevision = this.store.getSnapshot().serverRevision;
        window.addEventListener("message", this.onWorkspaceMessage);
        if (!this.workspaceBridgeSuspended) {
          this.postBridgeInit();
        }
      }
      /** Update the embedded Loop page without changing its route or browser preference. */
      setLocale(locale) {
        if (this.locale === locale) return;
        this.locale = locale;
        if (this.bridgeFrame === null || this.bridgeOrigin === "" || !validServerRevision(this.bridgeServerRevision)) {
          return;
        }
        this.bridgeFrame.postMessage(
          globalWorkspaceBridgeLocale(
            this.bridgeNonce,
            this.bridgeServerRevision,
            locale
          ),
          this.bridgeOrigin
        );
      }
      /** Route the persistent iframe without reloading or losing in-app state. */
      navigatePath(rawPath) {
        const path = sanitizedLoopPagePath(rawPath);
        if (path === null) return;
        this.rememberModulePath(path);
        this.store.set({
          ...this.store.getSnapshot(),
          activePath: path
        });
        if (this.bridgeFrame === null || this.bridgeOrigin === "" || !validServerRevision(this.bridgeServerRevision)) {
          return;
        }
        this.bridgeFrame.postMessage(
          globalWorkspaceBridgeNavigate(
            this.bridgeNonce,
            this.bridgeServerRevision,
            path
          ),
          this.bridgeOrigin
        );
      }
      postBridgeInit() {
        if (this.bridgeFrame === null || this.bridgeOrigin === "") return;
        const state = this.store.getSnapshot();
        if (!validServerRevision(this.bridgeServerRevision)) {
          this.store.set({
            ...state,
            workspaceError: capabilityFailure()
          });
          return;
        }
        this.bridgeFrame.postMessage(
          globalWorkspaceBridgeInit(
            this.bridgeNonce,
            this.bridgeServerRevision,
            state.activePath,
            this.locale
          ),
          this.bridgeOrigin
        );
      }
      /** Persist through Host and replace the iframe only after a safe commit. */
      async saveServer() {
        const state = this.store.getSnapshot();
        if (state.serverBusy) return;
        if (state.serverUrl !== null && !validServerRevision(state.serverRevision) || this.remote.globalServerStatus === void 0) {
          this.store.set({ ...state, serverError: capabilityFailure() });
          return;
        }
        if (this.remote.configureGlobalServer === void 0) {
          this.store.set({ ...state, serverError: capabilityFailure() });
          return;
        }
        const serverUrl = normalizedLoopServerUrl(state.serverDraft);
        if (serverUrl === null) {
          this.store.set({
            ...state,
            serverError: { code: "loop/server-url-invalid", message: "" }
          });
          return;
        }
        this.suspendWorkspaceBridge();
        const generation = this.nextGeneration();
        const request = this.beginRequest();
        this.store.set({
          ...state,
          serverBusy: true,
          serverError: null
        });
        const result = await this.call((signal) => this.remote.configureGlobalServer({
          serverUrl
        }, signal), request.signal);
        if (!this.current(generation, request)) return;
        if (!result.ok) {
          this.store.set({
            ...this.store.getSnapshot(),
            serverBusy: false,
            serverError: failureOf(result)
          });
          this.resumeWorkspaceBridge();
          return;
        }
        const configured = result.value;
        if (!validServerRevision(configured.serverRevision)) {
          this.store.set({
            ...this.store.getSnapshot(),
            serverBusy: false,
            serverError: capabilityFailure()
          });
          this.resumeWorkspaceBridge();
          return;
        }
        this.resetWorkspaceState();
        this.modulePaths.clear();
        this.store.set({
          screen: "ready",
          page: state.connection === void 0 ? configured.page : null,
          ...state.connection === void 0 ? {} : { connection: { state: "signed_out" } },
          frameKey: generation,
          error: null,
          serverUrl: configured.serverUrl,
          serverRevision: configured.serverRevision,
          serverDraft: configured.serverUrl,
          serverBusy: false,
          serverError: null,
          loopWorkspaceId: null,
          workspaceError: null,
          activePath: state.activePath
        });
        if (state.connection === void 0) void this.refreshWorkspaceStatus();
        else await this.reconnect();
      }
      /** Abort in-flight resolution and return the panel to its initial state. */
      dispose() {
        this.generation += 1;
        this.request?.abort();
        this.request = null;
        this.pendingOpen = null;
        this.detachWorkspacePage();
        this.workspaceGeneration += 1;
        this.workspaceRequest?.abort();
        this.workspaceRequest = null;
        this.workspacePendingId = null;
        this.workspaceBridgeSuspended = false;
        this.modulePaths.clear();
        this.pendingProjectsNavigation = false;
        this.store.set(INITIAL_GLOBAL_PAGE_STATE);
        this.sharedData.reset();
      }
      async startOpen() {
        const task = this.discoverServer();
        this.pendingOpen = task;
        try {
          await task;
        } finally {
          if (this.pendingOpen === task) this.pendingOpen = null;
        }
      }
      async discoverServer() {
        const activePath = this.store.getSnapshot().activePath;
        const generation = this.nextGeneration();
        const request = this.beginRequest();
        this.store.set({
          ...INITIAL_GLOBAL_PAGE_STATE,
          screen: "loading",
          activePath
        });
        const result = await this.call((signal) => this.remote.globalServerStatus(
          {},
          signal
        ), request.signal);
        if (!this.current(generation, request)) return;
        if (!result.ok) {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "error",
            error: failureOf(result)
          });
          return;
        }
        const status = result.value;
        if (status.serverUrl !== null && !validServerRevision(status.serverRevision)) {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "error",
            serverUrl: status.serverUrl,
            serverRevision: "",
            serverDraft: status.serverUrl,
            error: capabilityFailure()
          });
          return;
        }
        if (status.serverUrl === null) {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "setup",
            serverUrl: null,
            serverRevision: "",
            serverDraft: ""
          });
          return;
        }
        this.store.set({
          ...this.store.getSnapshot(),
          serverUrl: status.serverUrl,
          serverRevision: status.serverRevision,
          serverDraft: status.serverUrl,
          loopWorkspaceId: status.connection?.workspaceId ?? null,
          ...status.connection === void 0 ? {} : { connection: status.connection }
        });
        if (status.connection !== void 0 && (status.connection.deviceOnly || status.connection.state !== "signed_in")) {
          this.resetWorkspaceState();
          this.store.set({ ...this.store.getSnapshot(), screen: "ready", page: null });
          return;
        }
        await this.loadPage(status.serverUrl, status.serverRevision);
      }
      async loadPage(serverUrl, serverRevision) {
        const connection = this.store.getSnapshot().connection;
        const activePath = this.store.getSnapshot().activePath;
        const generation = this.nextGeneration();
        const request = this.beginRequest();
        this.store.set({
          ...INITIAL_GLOBAL_PAGE_STATE,
          screen: "loading",
          ...connection === void 0 ? {} : { connection },
          loopWorkspaceId: connection?.workspaceId ?? null,
          serverUrl,
          serverRevision,
          serverDraft: serverUrl ?? "",
          activePath
        });
        if (this.remote.globalPage === void 0) {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "error",
            error: capabilityFailure()
          });
          return;
        }
        const result = await this.call((signal) => this.remote.globalPage(
          {},
          signal
        ), request.signal);
        if (!this.current(generation, request)) return;
        if (!result.ok) {
          this.store.set({
            ...this.store.getSnapshot(),
            screen: "error",
            error: failureOf(result)
          });
          return;
        }
        this.store.set({
          ...this.store.getSnapshot(),
          screen: "ready",
          page: result.value,
          frameKey: generation,
          error: null
        });
        await this.refreshWorkspaceStatus();
      }
      onWorkspaceMessage = (event) => {
        if (this.workspaceBridgeSuspended) return;
        if (isGlobalWorkspaceBridgeReady(event, {
          origin: this.bridgeOrigin,
          source: this.bridgeFrame
        })) {
          this.postBridgeInit();
          return;
        }
        if (readGlobalWorkspaceBridgeWorkspaceCleared(event, {
          origin: this.bridgeOrigin,
          source: this.bridgeFrame,
          nonce: this.bridgeNonce,
          revision: this.bridgeServerRevision
        })) {
          this.cancelSharedDataSubscription("workspace-cleared");
          this.sharedData.selectIdentity(null);
          this.sharedData.disconnect("transport");
          if (this.store.getSnapshot().connection?.state === "signed_in" && Date.now() - this.lastPageRecovery > 15e3) {
            this.lastPageRecovery = Date.now();
            void this.reconnect();
            return;
          }
          void this.refreshConnection();
          this.nextWorkspaceGeneration();
          this.workspacePendingId = null;
          this.store.set({
            ...this.store.getSnapshot(),
            loopWorkspaceId: null
          });
          return;
        }
        const path = readGlobalWorkspaceBridgeRoute(event, {
          origin: this.bridgeOrigin,
          source: this.bridgeFrame,
          nonce: this.bridgeNonce,
          revision: this.bridgeServerRevision
        });
        if (path !== null) {
          this.rememberModulePath(path);
          this.store.set({
            ...this.store.getSnapshot(),
            activePath: path
          });
          const panelId = loopPanelForPath(path);
          if (panelId !== null) this.onRoute?.(panelId, path);
        }
        const selection = readGlobalWorkspaceBridgeSelection(event, {
          origin: this.bridgeOrigin,
          source: this.bridgeFrame,
          nonce: this.bridgeNonce,
          revision: this.bridgeServerRevision
        });
        if (selection !== null) {
          const connection = this.store.getSnapshot().connection;
          if (connection !== void 0 && (connection.state !== "signed_in" || selection.principalId !== connection.accountPrincipal || selection.workspaceId !== connection.workspaceId)) return;
          this.selectSharedData(selection);
          void this.configureWorkspace(selection);
        }
        const sharedMessage = this.readSharedDataMessage(event);
        if (sharedMessage !== null) {
          const accepted = this.sharedData.accept(sharedMessage);
          if (accepted !== "ignored") this.clearSharedDataTimeout();
          if (accepted === "resync") this.subscribeSharedData();
        }
      };
      selectSharedData(selection) {
        const identity = selection.principalId === void 0 || selection.authEpoch === void 0 ? null : {
          workspaceId: selection.workspaceId,
          principalId: selection.principalId,
          authEpoch: selection.authEpoch
        };
        if (identity === null) {
          this.cancelSharedDataSubscription("identity-unavailable");
          this.sharedData.selectIdentity(null);
          return;
        }
        if (!this.sharedData.selectIdentity(identity) && this.sharedDataSubscriptionId !== "") {
          return;
        }
        this.subscribeSharedData();
      }
      readSharedDataMessage(event) {
        const identity = this.sharedData.query().identity;
        if (identity === null || this.sharedDataSubscriptionId === "" || event.origin !== this.bridgeOrigin || event.source !== this.bridgeFrame) {
          return null;
        }
        return readSharedDataMessage(event, {
          nonce: this.bridgeNonce,
          revision: this.bridgeServerRevision,
          subscriptionId: this.sharedDataSubscriptionId,
          identity
        });
      }
      subscribeSharedData() {
        const identity = this.sharedData.query().identity;
        if (identity === null || this.bridgeFrame === null || this.bridgeOrigin === "" || !validServerRevision(this.bridgeServerRevision)) {
          return;
        }
        const previousSubscriptionId = this.sharedDataSubscriptionId;
        this.clearSharedDataTimeout();
        this.sharedDataGeneration += 1;
        const subscriptionId = `shared_${this.sharedDataGeneration}`;
        this.sharedDataSubscriptionId = subscriptionId;
        this.sharedData.beginSubscription(identity, subscriptionId);
        if (previousSubscriptionId !== "") {
          this.bridgeFrame.postMessage({
            channel: "loop.global-page.v2",
            type: "data-unsubscribe",
            nonce: this.bridgeNonce,
            revision: this.bridgeServerRevision,
            subscriptionId: previousSubscriptionId
          }, this.bridgeOrigin);
        }
        this.bridgeFrame.postMessage({
          channel: "loop.global-page.v2",
          type: "data-subscribe",
          nonce: this.bridgeNonce,
          revision: this.bridgeServerRevision,
          subscriptionId,
          workspaceId: identity.workspaceId,
          principalId: identity.principalId,
          authEpoch: identity.authEpoch
        }, this.bridgeOrigin);
        this.sharedDataTimeout = setTimeout(() => {
          this.sharedDataTimeout = null;
          this.cancelSharedDataSubscription("timeout");
        }, 5e3);
      }
      cancelSharedDataSubscription(reason) {
        this.clearSharedDataTimeout();
        const subscriptionId = this.sharedDataSubscriptionId;
        this.sharedDataSubscriptionId = "";
        if (subscriptionId !== "" && this.bridgeFrame !== null && this.bridgeOrigin !== "") {
          this.bridgeFrame.postMessage({
            channel: "loop.global-page.v2",
            type: "data-unsubscribe",
            nonce: this.bridgeNonce,
            revision: this.bridgeServerRevision,
            subscriptionId
          }, this.bridgeOrigin);
        }
        this.sharedData.disconnect(reason);
      }
      clearSharedDataTimeout() {
        if (this.sharedDataTimeout === null) return;
        clearTimeout(this.sharedDataTimeout);
        this.sharedDataTimeout = null;
      }
      async configureWorkspace(selection) {
        const state = this.store.getSnapshot();
        if (state.screen !== "ready" || state.loopWorkspaceId === selection.workspaceId) return;
        if (this.remote.configureGlobalServerWorkspace === void 0) {
          this.store.set({ ...state, workspaceError: capabilityFailure() });
          return;
        }
        const expectedServerRevision = this.bridgeServerRevision;
        if (!validServerRevision(expectedServerRevision)) {
          this.store.set({ ...state, workspaceError: capabilityFailure() });
          return;
        }
        if (this.workspacePendingId === selection.workspaceId) return;
        const generation = this.nextWorkspaceGeneration();
        const request = this.beginWorkspaceRequest();
        this.workspacePendingId = selection.workspaceId;
        this.store.set({ ...this.store.getSnapshot(), workspaceError: null });
        const result = await this.call((signal) => this.remote.configureGlobalServerWorkspace({
          workspaceId: selection.workspaceId,
          expectedServerRevision
        }, signal), request.signal);
        if (!this.currentWorkspace(generation, request)) return;
        this.workspacePendingId = null;
        if (!result.ok) {
          this.store.set({
            ...this.store.getSnapshot(),
            workspaceError: failureOf(result)
          });
          return;
        }
        this.modulePaths.clear();
        this.store.set({
          ...this.store.getSnapshot(),
          loopWorkspaceId: result.value.loopWorkspaceId,
          workspaceError: null
        });
        if (this.pendingProjectsNavigation && result.value.loopWorkspaceId !== null) {
          this.pendingProjectsNavigation = false;
          this.navigatePath(`/w/${encodeURIComponent(result.value.loopWorkspaceId)}/projects`);
        }
      }
      async refreshWorkspaceStatus() {
        if (this.remote.globalServerWorkspaceStatus === void 0) return;
        if (!validServerRevision(this.store.getSnapshot().serverRevision)) return;
        const generation = this.nextWorkspaceGeneration();
        const request = this.beginWorkspaceRequest();
        const result = await this.call((signal) => this.remote.globalServerWorkspaceStatus(
          {},
          signal
        ), request.signal);
        if (!this.currentWorkspace(generation, request)) return;
        if (!result.ok) {
          this.store.set({
            ...this.store.getSnapshot(),
            workspaceError: failureOf(result)
          });
          return;
        }
        this.store.set({
          ...this.store.getSnapshot(),
          loopWorkspaceId: result.value.loopWorkspaceId,
          workspaceError: null
        });
      }
      detachWorkspacePage() {
        this.cancelSharedDataSubscription("page-detached");
        if (this.bridgeFrame === null) return;
        window.removeEventListener("message", this.onWorkspaceMessage);
        this.bridgeFrame = null;
        this.bridgeOrigin = "";
        this.bridgeNonce = "";
        this.bridgeServerRevision = "";
      }
      rememberModulePath(path) {
        const panelId = loopPanelForPath(path);
        if (panelId !== null) this.modulePaths.set(panelId, path);
      }
      resetWorkspaceState() {
        this.workspaceGeneration += 1;
        this.workspaceRequest?.abort();
        this.workspaceRequest = null;
        this.workspacePendingId = null;
        this.workspaceBridgeSuspended = false;
        this.detachWorkspacePage();
      }
      suspendWorkspaceBridge() {
        this.workspaceBridgeSuspended = true;
        this.workspaceGeneration += 1;
        this.workspaceRequest?.abort();
        this.workspaceRequest = null;
        this.workspacePendingId = null;
      }
      resumeWorkspaceBridge() {
        this.workspaceBridgeSuspended = false;
        if (this.bridgeFrame === null || this.bridgeOrigin === "") return;
        this.bridgeNonce = newGlobalWorkspaceBridgeNonce();
        this.postBridgeInit();
      }
      nextWorkspaceGeneration() {
        this.workspaceGeneration += 1;
        this.workspaceRequest?.abort();
        return this.workspaceGeneration;
      }
      beginWorkspaceRequest() {
        const request = new AbortController();
        this.workspaceRequest = request;
        return request;
      }
      currentWorkspace(generation, request) {
        return generation === this.workspaceGeneration && !request.signal.aborted;
      }
      nextGeneration() {
        this.generation += 1;
        this.request?.abort();
        return this.generation;
      }
      beginRequest() {
        const request = new AbortController();
        this.request = request;
        return request;
      }
      current(generation, request) {
        return generation === this.generation && !request.signal.aborted;
      }
      async call(invoke, signal) {
        try {
          return await invoke(signal);
        } catch {
          return { ok: false, error: transportFailure() };
        }
      }
    };

    // client/ui/locales.ts
    var NS = "loopProxy";
    var en = {
      "human.title": "Act in my name",
      "human.pickProject": "Choose a project in Loop",
      "human.pickKB": "Choose a knowledge base in Loop",
      "human.pasteLink": "Paste the selected resource link",
      "human.shareLink": "Use this resource",
      "human.invalidLink": "Choose a link from this workspace.",
      "human.agentDenied": "I need your approval to continue. My assistant permissions do not cover this action.",
      "human.all": "All resources you can access in this workspace",
      "human.reusable": "Loop will show the expiry before you approve. You can reuse this authorization and revoke it in Loop account settings.",
      "human.expires": "Reusable until {date}. You can revoke this in Loop account settings.",
      "human.open": "Review in Loop",
      "human.reuse": "Use this authorization",
      "human.cancel": "Cancel",
      "human.manage": "Includes management access",
      "human.failed": "Could not complete the request. Return to the original conversation and try again.",
      "collab.management.active": "Delegation: Active",
      "collab.management.unavailable": "Delegation: Unavailable",
      "collab.management.closed": "Delegation: Ended",
      "collab.task.todo": "Task: To do",
      "collab.task.inProgress": "Task: In progress",
      "collab.task.inReview": "Task: In review",
      "collab.task.done": "Task: Done",
      "collab.task.unavailable": "Task unavailable",
      "collab.task.accepted": "Operation accepted",
      "collab.task.execution": "Execution: {status}",
      "collab.task.deliveryGap": "Some earlier task messages expired. Open Loop to check the task.",
      "login.title": "Loop account",
      "login.personalPage": "Your assistant is connected. Authorize this device to open your personal Loop pages here.",
      "login.authorizePages": "Authorize personal pages",
      "login.method": "Login method",
      "login.browser": "Browser",
      "login.tokenHint": "Use a DSH token from your default personal assistant in Loop settings. Personal Loop pages require browser sign-in.",
      "login.description": "Choose your Loop server, then sign in to connect this device.",
      "login.rememberServer": "This device remembers the server after a successful connection.",
      "login.checking": "Checking sign-in status\u2026",
      "login.signedIn": "Signed in",
      "login.signedOut": "Not signed in",
      "login.expired": "Sign-in expired. Please sign in again.",
      "login.statusUnavailable": "Sign-in status unavailable",
      "login.signingIn": "Sign-in in progress",
      "login.signingOut": "Sign-out in progress",
      "login.logout": "Sign out",
      "login.logoutHint": "Signing out disconnects this device from Loop models, Agent access and conversation sync. Your chats remain.",
      "login.logoutPending": "Complete the Loop confirmation to finish signing out. You can retry if the connection fails.",
      "settings.disconnect": "Sign out of Loop",
      "settings.disconnectFinish": "Finish signing out",
      "settings.disconnectConfirm": "Confirm sign-out in Loop",
      "settings.disconnectCheck": "Check sign-out",
      "settings.disconnectPending": "Uploads are stopped. Finish signing out to disconnect from Loop.",
      "settings.disconnectDescription": "Disconnects uploads, Agent access, and models for this Loop connection. Chats are kept.",
      "error.credentialUnavailable": "Saved Loop sign-in is inaccessible on this computer. Restore credential access before reconnecting. Local chat is still available.",
      "settings.uploadConnected": "Connected. Chats upload automatically.",
      "launcher.loopNeedsConnection": "Finish connecting Loop",
      "upload.label": "Loop upload status",
      "upload.uploading": "Uploading\u2026",
      "upload.uploaded": "Uploaded",
      "upload.failed": "Upload failed",
      "upload.off": "Not signed in to Loop",
      "panel.label": "Loop",
      "slash.loopSkills": "Loop \xB7 Skills",
      "slash.loopKnowledge": "Loop \xB7 Knowledge",
      "knowledge.error.unavailable": "Loop knowledge is unavailable. Check your connection and access, then reopen / and select again.",
      "error.loopSkills": "Loop skills could not be loaded. Select them again.",
      "skill.error.auth": "Sign in to Loop before using Loop Skills.",
      "skill.error.hostUpdate": "Update the Loop plugin to use Skills.",
      "skill.error.session": "Open this Session from a Loop workspace before using Loop Skills.",
      "skill.error.reference": "This Loop Skill selection is invalid. Select it again.",
      "skill.error.path": "This Loop Skill path is not supported. Select the Skill again.",
      "skill.error.offline": "Loop is unavailable. Your draft was not changed.",
      "skill.error.busy": "Loop Skill updates are temporarily paused. Retry shortly.",
      "skill.error.cancelled": "Loop Skill loading was cancelled.",
      "skill.error.bindingStale": "This Loop Skill version changed or is no longer authorized. Select it again.",
      "skill.error.tooLarge": "This Loop Skill is too large to load safely.",
      "skill.error.unavailable": "This Loop Skill is unavailable. Select it again.",
      "module.inbox": "Inbox",
      "module.contacts": "Contacts",
      "module.tasks": "Tasks",
      "module.projects": "Projects",
      "module.workflows": "Workflows",
      "module.knowledge": "Knowledge",
      "module.drive": "Cloud Drive",
      "module.dataspaces": "Data Spaces",
      "module.capabilities": "Experts & Skills",
      "module.connectors": "Connectors",
      "launcher.title": "Super Agent",
      "launcher.more": "More",
      "launcher.feedback": "Feedback",
      "launcher.signIn": "Sign in",
      "launcher.open": "Open More menu",
      "launcher.loopAccount": "Loop account",
      "launcher.loopConnected": "Signed in to Loop",
      "launcher.loopConnecting": "Connecting to Loop",
      "launcher.loopNeedsSetup": "Not signed in to Loop",
      "launcher.loopNeedsAttention": "Loop disconnected",
      "launcher.connectLoop": "Sign in to Loop",
      "launcher.modelSelected": "This chat: {model}",
      "launcher.modelSessionDefault": "Chat default: {model}",
      "launcher.modelSelectedUnavailable": "Model unavailable: {model}",
      "launcher.modelNewSessionDefault": "New chat default: {model}",
      "launcher.modelNewSessionDefaultUnavailable": "Default unavailable: {model}",
      "launcher.modelLoading": "Model settings",
      "launcher.modelUnavailable": "Model unavailable \xB7 Open settings",
      "launcher.modelSourceExternal": "External provider",
      "launcher.modelSourceUnknown": "Source needs review",
      "launcher.modelBillingPersonal": "personal provider billing",
      "launcher.modelBillingOrganization": "organization model access",
      "launcher.modelBillingLoopHosted": "Loop hosted usage",
      "launcher.modelBillingProvider": "provider billing",
      "launcher.modelBillingUnknown": "billing needs review",
      "launcher.settings": "Settings",
      "onboarding.loginLoop": "Sign in to Loop",
      "onboarding.openKeySettings": "Use an API key",
      "onboarding.authorizeModels": "Connect Loop models",
      "onboarding.openModelsAuth": "Open authorization",
      "onboarding.continueModels": "I authorized \xB7 Continue",
      "onboarding.configureLoop": "Configure Loop server",
      "onboarding.resume": "Resume Loop setup",
      "onboarding.cancelledBody": "You can finish Loop setup later or use an API Key.",
      "onboarding.workspaceTitle": "Sign in to Loop",
      "onboarding.workspaceBody": "Sign in and choose a workspace to continue.",
      "onboarding.modelsTitle": "Authorize Loop models",
      "onboarding.modelsBody": "Connect your Loop models, then choose one to use.",
      "onboarding.openLoopPage": "Check in Loop",
      "onboarding.continueSetup": "Continue setup",
      "onboarding.checkingModels": "Checking models\u2026",
      "onboarding.recoverLogin": "Recover sign-in",
      "error.credentialRecoveryDisabled": "System prompts are disabled by the launcher. Remove LOOP_KEYCHAIN_NO_UI and restart before recovering sign-in.",
      "onboarding.recoveringLogin": "Approve credential access in the system dialog. Choose Always Allow to keep access after restarting.",
      "onboarding.retryModels": "Check again",
      "onboarding.stopWaiting": "Cancel authorization",
      "onboarding.modelNeedsAuth": "Allow Super Agent to use your Loop models.",
      "onboarding.modelRateLimited": "Too many requests. Try again shortly.",
      "onboarding.noModels": "No models are available. Check your model settings, access, or balance in Loop.",
      "onboarding.catalogUnavailable": "Could not load models. Try again.",
      "onboarding.routeMissing": "The model connection is not ready. Check again.",
      "onboarding.selectionRequired": "Choose a model to continue.",
      "onboarding.scopeRequired": "Sign in to Loop and choose a workspace first.",
      "onboarding.chooseModelHint": "You can change the model beside the chat input.",
      "onboarding.chooseModel": "Choose a model",
      "onboarding.useModel": "Use this model",
      "onboarding.savingModel": "Saving model selection\u2026",
      "onboarding.selectionSaveFailed": "Your model choice was not saved. Try again.",
      "onboarding.selectionSaveUnknown": "Saving is unconfirmed. Select the model again.",
      "onboarding.modelError": "Could not connect the model. Retry or use an API key.",
      "onboarding.externalReady": "Your API-key model is ready.",
      "onboarding.keyTitle": "Finish model setup",
      "onboarding.keyBody": "Add an API key in Settings \u2192 Models, then choose a model.",
      "onboarding.returnLoop": "Use Loop sign-in",
      "onboarding.apiKeyHint": "API keys are stored by DSH\u2019s existing model settings. Signing in to Loop does not replace or delete an existing key.",
      "onboarding.loopConnecting": "Checking the Loop connection\u2026",
      "onboarding.loopReady": "Loop is connected and a model is available.",
      "onboarding.loopConnectedModelPending": "Loop is connected. No Loop model is available yet; finish that setup in Loop or use an API key.",
      "onboarding.loopNeedsServer": "Configure the Loop server, then sign in to continue.",
      "onboarding.loopNeedsAttention": "Loop is not connected. Try again, or use an API key.",
      "onboarding.loopUnavailable": "The Loop connection could not be read. Retry before signing in.",
      "menu.connect": "Connect Loop project\u2026",
      "menu.activeSummary": "Loop project: {loopWorkspace} / {project}",
      "menu.openProject": "Open Loop project",
      "menu.inspect": "View project connection",
      "menu.switch": "Switch project",
      "menu.unbind": "Unlink project",
      "menu.needsAuth": "Reconnect Loop\u2026",
      "menu.waiting": "Check project access\u2026",
      "menu.revoked": "Reconnect Loop\u2026",
      "menu.unavailable": "Repair Loop connection\u2026",
      "menu.statusError": "Loop connection unavailable\u2026",
      "menu.failure": "Could not open the Loop connection. Try again.",
      "dialog.title": "Loop project",
      "dialog.currentBindingTitle": "Current project",
      "dialog.close": "Close",
      "dialog.loading": "Reading Loop connection\u2026",
      "dialog.unboundTitle": "Connect this workspace",
      "dialog.unboundBody": "Choose a Loop project once. New sessions in this workspace will use it automatically.",
      "dialog.connect": "Connect Loop",
      "dialog.loginTitle": "Sign in to Loop",
      "dialog.loginBody": "Sign in to Loop in your browser and choose or create the Agent for this workspace. Then return here.",
      "dialog.openLogin": "Open Loop sign-in",
      "dialog.loginOpened": "After signing in, return here and continue.",
      "dialog.continue": "Continue",
      "dialog.projectTitle": "Choose a project",
      "dialog.chooseAnotherProject": "Choose another project",
      "dialog.agentTitle": "Super Agent",
      "dialog.chooseProject": "Select the project this workspace should use.",
      "dialog.chooseAgent": "Choose the Agent that will work for this workspace.",
      "dialog.chooseLoopWorkspace": "Choose Loop workspace",
      "dialog.createProject": "Create a project",
      "dialog.projectName": "Project name",
      "dialog.projectPlaceholder": "Example: TiDB 9.0 release",
      "dialog.projectPrefix": "Task prefix",
      "dialog.projectPrefixPlaceholder": "Example: TIDB",
      "dialog.projectPrefixHint": "1\u201332 letters; fixed after creation.",
      "dialog.create": "Create",
      "dialog.bind": "Use this project",
      "dialog.selectRequired": "Choose a project and an agent to continue.",
      "dialog.noAgents": "No Agent is available. Sign in again to choose or create one.",
      "dialog.agentSignIn": "Sign in to choose or create",
      "dialog.currentAccount": "Current account",
      "dialog.superAgent": "Super Agent",
      "dialog.notConnected": "Not connected",
      "dialog.localWorkspace": "Local workspace",
      "dialog.loopWorkspace": "Loop workspace",
      "dialog.projectLabel": "Loop project",
      "dialog.channelReady": "Project conversation channel is ready",
      "dialog.viewLoop": "Open Loop project",
      "dialog.switchProject": "Switch project",
      "dialog.unbindProject": "Unlink project",
      "dialog.unbindTitle": "Unlink this project?",
      "dialog.unbindBody": "New chats will no longer use this project; existing chats will immediately stop Loop actions and syncing. Other project connections stay connected. If this is the last project, this Loop connection and its models, sync, and remote access will also be disconnected. Your chats and Loop content will remain.",
      "dialog.disconnectLoginTitle": "Finish Disconnecting Loop",
      "dialog.disconnectLoginBody": "Sign in to your original Loop account and confirm the connections to disconnect. Then return here to finish.",
      "dialog.disconnectLoginOpen": "Sign in to Loop",
      "dialog.disconnectLater": "Finish later",
      "dialog.disconnectCheck": "Check if disconnected",
      "dialog.disconnectChecking": "Checking Disconnect...",
      "dialog.cancel": "Cancel",
      "dialog.confirmUnbind": "Unlink project",
      "dialog.waitingTitle": "Waiting for project access",
      "dialog.waitingBody": "You do not have access to this project yet. Ask a project administrator for access, then check again.",
      "dialog.unavailableTitle": "Project unavailable",
      "dialog.unavailableBody": "The saved Loop project or its conversation channel is no longer available. Choose a project again to recover.",
      "dialog.revokedTitle": "Loop connection revoked",
      "dialog.revokedBody": "This connection is no longer authorized. Reconnect to continue.",
      "dialog.retry": "Check again",
      "dialog.reconnect": "Reconnect Loop",
      "dialog.reloadChoices": "Refresh projects and Agents",
      "dialog.retryConnection": "Check Loop connection again",
      "dialog.retryAccess": "Check project access again",
      "dialog.role.view": "Viewer",
      "dialog.role.edit": "Editor",
      "dialog.role.manage": "Manager",
      "dialog.role.owner": "Owner",
      "dialog.syncTitle": "This session",
      "dialog.syncStatus": "Sync status",
      "dialog.syncDescription": "New sessions from this Loop project workspace sync automatically. Only visible messages are shared; you can pause this session here.",
      "dialog.syncToggle": "Sync this session to Loop",
      "dialog.syncOff": "Sync is off",
      "dialog.syncOn": "Sync is on",
      "dialog.syncPending": "Waiting to send",
      "dialog.syncRetrying": "Reconnecting",
      "dialog.syncError": "Sync needs attention",
      "dialog.syncNeedsAuth": "Sign in again to keep syncing",
      "dialog.syncDestination": "Destination",
      "dialog.syncTopicReady": "Project channel \xB7 topic connected",
      "dialog.syncTopicPending": "The first shared message will create a conversation in the project.",
      "dialog.syncPendingCount": "{count} items waiting",
      "dialog.syncLastReceiptLabel": "Last received",
      "dialog.syncLastReceipt": "Message {sequence} received",
      "dialog.syncPartial": "Some earlier visible history could not be recovered.",
      "dialog.syncCheck": "Check now",
      "dialog.syncUnavailable": "This session is not connected to a Loop project yet.",
      "dialog.syncCreatedBefore": "This session was created before the current workspace was connected. Create a new session to sync it.",
      "dialog.syncOriginalBinding": "This session uses its original Loop project. Open that project, or create a new session to use the current one.",
      "dialog.syncAuth": "Sign in again before sharing this session.",
      "dialog.syncAuthPrompt": "Authorize sync in your browser. Only future visible messages from this session are shared; your existing Loop sign-in is reused.",
      "dialog.syncAuthorize": "Authorize in browser",
      "dialog.syncAuthOpened": "Return here after allowing sync. This session enables automatically.",
      "dialog.syncNeedsAuthHint": "Authorize Loop sync once to continue sending this session\u2019s visible messages.",
      "dialog.syncSaving": "Updating sync\u2026",
      "global.loading": "Loading Loop",
      "global.aria": "Loop application",
      "global.error": "Loop could not open in this panel.",
      "global.reconnect": "Reconnect Loop",
      "global.retry": "Retry",
      "global.serverLabel": "Server address",
      "global.serverPlaceholder": "https://loop.example.com",
      "global.serverSave": "Save and connect",
      "global.serverSaving": "Connecting\u2026",
      "global.workspaceError": "Could not apply the selected Loop workspace. Choose it again in Loop.",
      "global.connectSettingsTitle": "Connect Loop in Settings",
      "global.connectSettingsBody": "Open Harness Settings, choose Loop, and enter your Loop server address.",
      "global.dataWaiting": "Connecting Loop updates\u2026",
      "global.dataReconnecting": "Refreshing Loop data\u2026",
      "global.dataUnavailable": "Live Loop updates are unavailable.",
      "global.dataAuthRequired": "Sign in to Loop again to resume live updates.",
      "global.connectionReconnecting": "Reconnecting Loop updates\u2026",
      "global.connectionDisconnected": "Loop updates are paused.",
      "settings.title": "Loop",
      "settings.uploadDisconnectedHistory": "Upload chats from when you were signed out",
      "settings.uploadDisconnectedHistoryHint": "Off by default. When off, only new messages received while signed in to Loop are uploaded. When on, accessible chat history is also uploaded after sign-in.",
      "settings.uploadPreferencesError": "Could not load or save upload preferences. Try again.",
      "settings.description": "Sign in once. Loop access and available models are configured automatically.",
      "settings.loading": "Loading Loop settings",
      "settings.serverTitle": "Loop server",
      "settings.serverDescription": "Enter the address of your Loop service.",
      "settings.serverConnected": "Server connected",
      "settings.serverUpdate": "Update connection",
      "settings.openLoop": "Open Loop",
      "settings.modelsTitle": "Loop models",
      "settings.modelsDescription": "Use personal, organization, or hosted models from your Loop account.",
      "settings.currentSessionModel": "Model for this chat",
      "settings.currentSessionDefaultModel": "This chat uses the default model",
      "settings.newSessionDefaultModel": "New-session default model",
      "settings.currentModelUnavailable": "This model is unavailable. Choose another model.",
      "settings.currentModelHint": "This reflects the current selection. Harness never switches it automatically when a connection changes.",
      "settings.modelsLoading": "Loading Loop models\u2026",
      "settings.modelsCount": "{count} available models",
      "settings.modelsNoneAvailable": "No models are available. Check model settings, access, or balance in Loop.",
      "settings.modelsEmptyTitle": "No Loop models connected",
      "settings.modelsEmptyBody": "Connect your models to use them in chat.",
      "settings.modelsAuthTitle": "Authorize Loop models",
      "settings.modelsAuthBody": "Authorize in your browser, then return here to continue.",
      "settings.modelsAuthOpen": "Open browser authorization",
      "settings.modelsAuthContinue": "I authorized \xB7 Continue",
      "settings.modelsChecking": "Checking authorization\u2026",
      "settings.modelsDisconnect": "Disconnect",
      "settings.modelsDisconnecting": "Disconnecting\u2026",
      "settings.modelsConnect": "Connect Loop models",
      "settings.modelsConnectAnother": "Add a model connection",
      "settings.modelsAuthorizing": "Starting authorization\u2026",
      "settings.modelsRefresh": "Refresh models",
      "settings.modelsRefreshing": "Refreshing\u2026",
      "settings.modelsSourcePersonal": "Personal",
      "settings.modelsSourceOrganization": "Organization",
      "settings.modelsSourceLoopHosted": "Loop hosted",
      "settings.modelsPickerHint": "You can change the selected model beside the chat input.",
      "settings.modelsUnavailable": "Loop models are temporarily unavailable. Check the Loop connection and try again.",
      "settings.modelsReconnectRequired": "Authorization has expired. Reconnect this account.",
      "settings.modelsAuthRequired": "Finish the browser authorization, then continue. If it expired, start the connection again.",
      "settings.modelsRateLimited": "Loop is receiving too many model requests. Wait a moment and try again.",
      "settings.modelsFailed": "Loop models could not be updated. Try again.",
      "settings.syncTitle": "Chat uploads",
      "settings.syncDescription": "Workspaces and chats upload to your private Loop channels in the background. Local chat keeps working offline.",
      "settings.syncLoading": "Chat uploads settings will appear after the Loop connection is ready.",
      "settings.syncEnable": "Automatically import Loop projects",
      "settings.syncEnabledDescription": "Projects appear in your workspace list. Control conversation sharing separately in the chat\u2019s Loop menu.",
      "settings.syncOffDescription": "Automatic import is off.",
      "settings.connectionHint": "Open Loop, sign in and choose a workspace to import its projects.",
      "settings.defaultRoot": "Project folder",
      "settings.defaultRootPlaceholder": "For example: /Users/me/Loop",
      "settings.defaultRootHint": "Changes affect only projects imported after you save this setting.",
      "settings.defaultRootSave": "Save directory",
      "settings.defaultRootSaving": "Saving directory\u2026",
      "settings.defaultRootInvalid": "Enter a valid directory path.",
      "settings.syncRefresh": "Refresh now",
      "settings.syncRefreshing": "Refreshing\u2026",
      "settings.account": "Account",
      "settings.lastSynced": "Last refreshed",
      "settings.authTitle": "Loop authorization is required",
      "settings.authBody": "Complete one Loop sign-in. All eligible projects reuse this authorization.",
      "settings.connectTitle": "Connect projects",
      "settings.connectNeedsAuth": "Allow access to your Loop projects to import them.",
      "settings.connectNeedsConfig": "Sign in and choose a workspace on the Loop page first.",
      "settings.connectAction": "Sign in to Loop",
      "settings.connecting": "Connecting\u2026",
      "settings.authOpen": "Open Loop sign-in",
      "settings.authContinue": "Continue after sign-in",
      "settings.syncSummary": "Imported {imported}, updated {updated}, unchanged {skipped}.",
      "settings.projectsTitle": "Imported projects",
      "settings.projectsEmpty": "No projects imported yet.",
      "settings.changeDirectory": "Use another directory",
      "settings.changeDirectoryHint": "A new Harness workspace is created here. The old workspace, its files, and its sessions stay intact; only the old Loop association is removed.",
      "settings.newDirectory": "New project directory",
      "settings.confirmDirectory": "Create workspace and relink",
      "settings.changingDirectory": "Relinking project\u2026",
      "settings.cancel": "Cancel",
      "settings.directoryConflict": "That directory is occupied or overlaps a protected location. Choose a separate project directory.",
      "settings.directoryNeedsAuth": "Sign in once, then try changing the directory again.",
      "settings.directoryFailed": "The project could not be relinked. Its previous association is unchanged.",
      "settings.state.off": "Off",
      "settings.state.needsConfig": "Needs setup",
      "settings.state.needsAuth": "Needs sign-in",
      "settings.state.ready": "Up to date",
      "settings.state.partial": "Partially synced",
      "settings.state.error": "Needs attention",
      "settings.project.pending": "Creating workspace",
      "settings.project.synced": "Synced",
      "settings.project.error": "Sync failed",
      "settings.project.workspaceMissing": "Workspace missing",
      "session.action": "Loop",
      "session.aria": "Loop project and sync",
      "session.noWorkspace": "Open this session from a workspace before using Loop.",
      "error.title": "Could not complete that action",
      "error.transport": "Loop could not be reached. Check the Loop server connection in Settings \u2192 Loop, then try again.",
      "error.backendUnavailable": "The Loop service is unavailable. Check Settings \u2192 Loop and the server connection, then try again.",
      "error.timeout": "Loop took too long to respond. Check the server connection in Settings \u2192 Loop, then try again.",
      "error.serverUrl": "Enter a full HTTPS address. Local services can use HTTP.",
      "error.workspaceRequired": "Open a Loop module, choose the Loop workspace once, then connect this project.",
      "error.hostUpdate": "Update the Loop plugin and try again.",
      "error.selection": "Choose a project and a Super Agent first.",
      "error.popup": "The browser blocked Loop sign-in. Allow the sign-in window and try again.",
      "error.challenge": "The Loop sign-in request could not be resumed. Start sign-in again; your workspace and draft are unchanged.",
      "error.challengeExpired": "The project and Agent choices came from an expired setup session. Reload the choices and select again; your workspace and chat draft are unchanged.",
      "error.needsAuth": "Loop sign-in is required. Sign in to continue this workspace without changing your draft.",
      "error.sync": "Sync could not complete. Check the connection and try again.",
      "error.projectPrefix": "Enter a task prefix using 1\u201332 letters.",
      "error.projectTarget": "This project is not available in the current Loop server or account. Check Settings \u2192 Loop, then open Projects and choose it there.",
      "error.generic": "Loop reported a failure. Try again.",
      "collab.section.agents": "Loop agents",
      "collab.section.humans": "Loop colleagues",
      "collab.candidate.delegate": "Task candidate",
      "collab.candidate.notify": "Can be mentioned",
      "collab.candidate.needsAccess": "Can be mentioned \xB7 Task access required",
      "collab.candidate.unavailable": "No collaboration action is available",
      "collab.status.unbound": "Connect Loop collaborators",
      "collab.status.needsAuth": "Sign in to use Loop collaborators",
      "collab.status.needsBoard": "Choose a Loop board",
      "collab.status.unavailable": "Loop collaboration needs attention",
      "collab.status.worksiteNeedsEnable": "Board connected \xB7 enable device",
      "collab.status.worksiteAttention": "Start Work needs attention",
      "collab.status.ready": "Loop collaborators",
      "collab.status.connected": "{board} \xB7 {count} active",
      "collab.status.waiting": "Checking Loop collaboration\u2026",
      "collab.status.details": "View Loop collaboration",
      "collab.dialog.eyebrow": "Loop",
      "collab.dialog.title": "Loop collaborators",
      "collab.dialog.close": "Close",
      "collab.dialog.loading": "Reading Loop collaboration\u2026",
      "collab.dialog.error": "Could not update Loop collaboration.",
      "collab.dialog.scope": "Task board",
      "collab.dialog.account": "Account",
      "collab.dialog.accountUnavailable": "Account name unavailable",
      "collab.dialog.coordinator": "Agent for this chat",
      "collab.dialog.activeTitle": "Collaboration tasks",
      "collab.dialog.activeEmpty": "No Loop work is active for this chat.",
      "collab.dialog.deliveryTitle": "Message delivery history",
      "collab.dialog.deliveryEmpty": "No incoming Loop delivery is waiting.",
      "collab.dialog.bindTitle": "Choose a Loop board",
      "collab.dialog.bindBody": "New tasks go to this board. Existing tasks stay on their original board.",
      "collab.dialog.chooseBoard": "Select the board for new collaboration work.",
      "collab.dialog.noBoards": "No writable Loop board is available. Create or join one in Loop first.",
      "collab.dialog.openLoop": "Open Loop",
      "collab.dialog.bind": "Use this board",
      "collab.dialog.binding": "Connecting board\u2026",
      "collab.dialog.shareTitle": "What collaborators receive",
      "collab.dialog.shareTask": "Task description only",
      "collab.dialog.shareSelected": "Task description and selected resources",
      "collab.dialog.shareDiscussion": "Task discussion",
      "collab.dialog.shareHint": "Your full chat history is not shared.",
      "collab.dialog.shareFirst": "Review the recipients and shared content before sending.",
      "collab.dialog.shareConfirm": "Confirm scope and send",
      "collab.dialog.discard": "Cancel pending collaboration",
      "collab.dialog.shareTargets": "{count} collaborators",
      "collab.dialog.shareResources": "{count} resources",
      "collab.dialog.referenceTitle": "Loop collaborator",
      "collab.dialog.referenceBody": "After sending, Super Agent can work with this agent. You can remove the reference before sending.",
      "collab.dialog.referenceTypeAgent": "Agent",
      "collab.dialog.referenceTypeHuman": "Human",
      "collab.dialog.connectionTitle": "Connection settings",
      "collab.dialog.connectionDistinction": "Connect a Loop agent so Super Agent can coordinate tasks for you.",
      "collab.dialog.boardSetupTitle": "Choose a task board for collaboration",
      "collab.dialog.boardSetupBody": "Choose where to save collaboration tasks.",
      "collab.dialog.connectSignIn": "Sign in and connect Loop",
      "collab.dialog.chooseBoardAction": "Choose Loop board",
      "collab.dialog.repairConnection": "Repair Loop connection",
      "collab.dialog.openConnection": "Open Loop connection",
      "collab.dialog.retry": "Check again",
      "collab.dialog.reconcile": "Reconcile work",
      "collab.dialog.reconciling": "Checking work\u2026",
      "collab.dialog.task": "Collaboration task",
      "collab.dialog.openTask": "Open task",
      "collab.dialog.cancel": "Cancel work",
      "collab.dialog.cancelling": "Requesting cancellation\u2026",
      "collab.dialog.answerInChat": "Answer in chat",
      "collab.dialog.answerNativeHint": "Return to chat to answer.",
      "collab.dialog.followupNativeHint": "Return to chat to continue the task.",
      "collab.dialog.retryContinuation": "Retry reply link",
      "collab.dialog.continuationBinding": "Linking your reply\u2026",
      "collab.dialog.continuationReady": "Reply linked to {count} tasks.",
      "collab.dialog.reviewInChat": "Review in chat",
      "collab.dialog.unknownResult": "Outcome unknown \u2014 reconcile before retrying",
      "collab.state.recorded": "Recorded",
      "collab.state.dispatching": "Dispatching",
      "collab.state.accepted": "Accepted",
      "collab.state.running": "Running",
      "collab.state.waiting": "Waiting for you",
      "collab.state.succeeded": "Result available",
      "collab.state.completed": "Completed",
      "collab.state.cancelRequested": "Cancellation requested",
      "collab.state.canceled": "Cancelled",
      "collab.state.failed": "Failed",
      "collab.state.unreachable": "Result unknown",
      "collab.state.unknown": "Unknown",
      "collab.delivery.pending": "Waiting to deliver",
      "collab.delivery.claimed": "Received by Harness",
      "collab.delivery.committed": "Added to this chat",
      "collab.delivery.canceled": "Cancelled by user",
      "collab.delivery.needsAuth": "Waiting for Loop sign-in",
      "collab.delivery.reconcile": "Waiting for reconciliation",
      "collab.delivery.revoked": "Loop authorization was revoked",
      "collab.delivery.retiredRoute": "Receiving results for existing tasks only",
      "collab.delivery.bindingConflict": "Task connection changed",
      "collab.delivery.blocked": "Delivery blocked",
      "collab.delivery.undeliverable": "Could not deliver",
      "collab.notice.connected": "Loop board connected for this chat.",
      "collab.notice.shareConfirmed": "Sharing scope confirmed. The original message will continue.",
      "collab.notice.intentDiscarded": "Pending collaboration canceled.",
      "collab.notice.intentBound": "Sent with mention context.",
      "collab.notice.cancelPending": "Cancellation is waiting for the Loop connection.",
      "collab.notice.cancelRequested": "Loop received the cancellation request; stopping is not yet confirmed.",
      "collab.notice.stopped": "Loop confirmed the run stopped.",
      "collab.notice.notDispatched": "Cancelled locally. No Loop work was dispatched.",
      "collab.notice.alreadyTerminal": "The Loop work had already finished; its result remains intact.",
      "collab.notice.cancelUnknown": "Cancellation outcome is unknown. Reconcile before retrying.",
      "collab.notice.reconciled": "Checked the latest Loop work state.",
      "collab.notice.continuationLinked": "Reply linked to the task.",
      "collab.notice.continuationNeedsTarget": "There are multiple tasks. Mention the task name when you continue.",
      "collab.notice.continuationUnavailable": "Update the Loop plugin to continue this task.",
      "collab.notice.continuationFailed": "The reply was not linked to active Loop work. Normal chat was preserved.",
      "collab.error.notBound": "Choose a Loop board before mentioning collaborators.",
      "collab.error.humanDisabled": "Select a Loop Agent. Mentioning people is not supported yet.",
      "collab.error.permission": "Loop denied this operation. Check the assistant\u2019s permissions in this workspace.",
      "collab.error.needsAccess": "This collaborator is visible but needs access or does not accept this action.",
      "collab.error.auth": "Sign in to Loop before using collaborators.",
      "collab.error.bindingStale": "The Loop board or authority changed. Remove stale references and select collaborators again.",
      "collab.error.intentExpired": "This unsent Loop reference expired. Select the collaborator again.",
      "collab.error.intentConflict": "This message is linked to another task. Check it before retrying.",
      "collab.error.payloadMismatch": "The message changed. Select the collaborators again before sending.",
      "collab.error.unsupported": "This agent cannot collaborate right now.",
      "collab.error.bindFailed": "Could not use this board. The selected board or linked Agent changed; reload the boards and choose again.",
      "collab.error.resultUnknown": "The result is unknown. Reconcile with Loop before retrying.",
      "collab.error.queue": "The Loop delivery or action queue is full. Wait for existing work to finish.",
      "collab.error.storage": "The local Loop delivery store is full. Free storage before retrying.",
      "collab.error.offline": "Loop is offline. The action was not confirmed.",
      "collab.error.session": "This Session is unavailable. Reopen it before retrying.",
      "collab.error.internal": "Loop collaboration failed. Check the connection and try again.",
      "collab.worksite.title": "Access this device from Loop Web",
      "collab.worksite.stopped": "Remote access is not running.",
      "collab.worksite.connecting": "Connecting remote access\u2026",
      "collab.worksite.connected": "Remote Start Work is connected for this device.",
      "collab.worksite.needsEnable": "To access this device from Loop Web, enable it in Start Work.",
      "collab.worksite.registrationConflict": "This installation belongs to another Loop account. Disconnect it with that account first.",
      "collab.worksite.stateChanged": "The device connection changed. Refresh Start Work.",
      "collab.worksite.blocked": "Remote access is unavailable. Check this device in Start Work.",
      "collab.worksite.offline": "Device offline. Reconnecting\u2026",
      "collab.worksite.openStartWork": "Open Loop Start Work",
      "collab.worksite.openFailed": "Could not open Loop Start Work. Check the Loop server and Workspace connection."
    };
    var zh = {
      "human.title": "\u4EE5\u6211\u7684\u540D\u4E49\u529E\u7406",
      "human.pickProject": "\u53BB Loop \u9009\u62E9\u9879\u76EE",
      "human.pickKB": "\u53BB Loop \u9009\u62E9\u77E5\u8BC6\u5E93",
      "human.pasteLink": "\u7C98\u8D34\u6240\u9009\u8D44\u6E90\u7684\u94FE\u63A5",
      "human.shareLink": "\u4F7F\u7528\u8FD9\u4E2A\u8D44\u6E90",
      "human.invalidLink": "\u8BF7\u9009\u62E9\u5F53\u524D\u5DE5\u4F5C\u533A\u7684\u8D44\u6E90\u94FE\u63A5\u3002",
      "human.agentDenied": "\u52A9\u624B\u7684\u6743\u9650\u4E0D\u8DB3\uFF0C\u7EE7\u7EED\u529E\u7406\u8FD9\u4E00\u6B65\u9700\u8981\u4F60\u6388\u6743\u3002",
      "human.all": "\u6B64\u5DE5\u4F5C\u533A\u5185\u4F60\u6709\u6743\u8BBF\u95EE\u7684\u6240\u6709\u8D44\u6E90",
      "human.reusable": "\u6388\u6743\u53EF\u91CD\u590D\u4F7F\u7528\u3002Loop \u4F1A\u5728\u786E\u8BA4\u524D\u663E\u793A\u5230\u671F\u65F6\u95F4\uFF0C\u4F60\u53EF\u4EE5\u968F\u65F6\u5728 Loop \u8D26\u53F7\u8BBE\u7F6E\u4E2D\u64A4\u9500\u3002",
      "human.expires": "\u6388\u6743\u53EF\u91CD\u590D\u4F7F\u7528\uFF0C\u6709\u6548\u81F3 {date}\u3002\u53EF\u968F\u65F6\u5728 Loop \u8D26\u53F7\u8BBE\u7F6E\u4E2D\u64A4\u9500\u3002",
      "human.open": "\u524D\u5F80 Loop \u786E\u8BA4",
      "human.reuse": "\u4F7F\u7528\u5DF2\u6709\u6388\u6743",
      "human.cancel": "\u53D6\u6D88",
      "human.manage": "\u542B\u7BA1\u7406\u6743\u9650",
      "human.failed": "\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u8FD4\u56DE\u539F\u5BF9\u8BDD\u91CD\u8BD5\u3002",
      "collab.management.active": "\u7BA1\u7406\u59D4\u6258\uFF1A\u6709\u6548",
      "collab.management.unavailable": "\u7BA1\u7406\u59D4\u6258\uFF1A\u4E0D\u53EF\u7528",
      "collab.management.closed": "\u7BA1\u7406\u59D4\u6258\uFF1A\u5DF2\u7ED3\u675F",
      "collab.task.todo": "\u4EFB\u52A1\uFF1A\u5F85\u529E",
      "collab.task.inProgress": "\u4EFB\u52A1\uFF1A\u8FDB\u884C\u4E2D",
      "collab.task.inReview": "\u4EFB\u52A1\uFF1A\u5F85\u9A8C\u6536",
      "collab.task.done": "\u4EFB\u52A1\uFF1A\u5DF2\u5B8C\u6210",
      "collab.task.unavailable": "\u4EFB\u52A1\u4E0D\u53EF\u8BBF\u95EE",
      "collab.task.accepted": "\u64CD\u4F5C\u5DF2\u53D7\u7406",
      "collab.task.execution": "\u6267\u884C\uFF1A{status}",
      "collab.task.deliveryGap": "\u90E8\u5206\u8F83\u65E9\u7684\u4EFB\u52A1\u6D88\u606F\u5DF2\u8FC7\u671F\u3002\u8BF7\u5728 Loop \u4E2D\u67E5\u770B\u4EFB\u52A1\u3002",
      "login.title": "Loop \u8D26\u53F7",
      "login.personalPage": "\u52A9\u624B\u5DF2\u8FDE\u63A5\u3002\u6388\u6743\u6B64\u8BBE\u5907\u540E\uFF0C\u5373\u53EF\u5728\u8FD9\u91CC\u6253\u5F00\u4F60\u7684 Loop \u4E2A\u4EBA\u9875\u9762\u3002",
      "login.authorizePages": "\u6388\u6743\u4E2A\u4EBA\u9875\u9762",
      "login.method": "\u767B\u5F55\u65B9\u5F0F",
      "login.browser": "\u6D4F\u89C8\u5668\u767B\u5F55",
      "login.tokenHint": "\u4F7F\u7528 Loop \u8BBE\u7F6E\u4E2D\u9ED8\u8BA4\u4E2A\u4EBA\u52A9\u624B\u7B7E\u53D1\u7684 DSH \u4EE4\u724C\u3002\u6253\u5F00\u4E2A\u4EBA Loop \u9875\u9762\u9700\u8981\u6D4F\u89C8\u5668\u767B\u5F55\u3002",
      "login.description": "\u9009\u62E9 Loop \u670D\u52A1\u5668\uFF0C\u767B\u5F55\u540E\u5373\u53EF\u8FDE\u63A5\u6B64\u8BBE\u5907\u3002",
      "login.rememberServer": "\u8FDE\u63A5\u6210\u529F\u540E\uFF0C\u6B64\u8BBE\u5907\u4F1A\u8BB0\u4F4F\u670D\u52A1\u5668\u5730\u5740\u3002",
      "login.checking": "\u6B63\u5728\u68C0\u67E5\u767B\u5F55\u72B6\u6001\u2026",
      "login.signedIn": "\u5DF2\u767B\u5F55",
      "login.signedOut": "\u672A\u767B\u5F55",
      "login.expired": "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55",
      "login.statusUnavailable": "\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u767B\u5F55\u72B6\u6001",
      "login.signingIn": "\u6B63\u5728\u767B\u5F55",
      "login.signingOut": "\u6B63\u5728\u9000\u51FA\u767B\u5F55",
      "login.logout": "\u9000\u51FA\u767B\u5F55",
      "login.logoutHint": "\u9000\u51FA\u540E\uFF0C\u6B64\u8BBE\u5907\u5C06\u65AD\u5F00 Loop \u6A21\u578B\u3001Agent \u548C\u4F1A\u8BDD\u540C\u6B65\u8FDE\u63A5\uFF0C\u5DF2\u6709\u804A\u5929\u4FDD\u7559\u3002",
      "login.logoutPending": "\u8BF7\u524D\u5F80 Loop \u5B8C\u6210\u9000\u51FA\u786E\u8BA4\u3002\u8FDE\u63A5\u5931\u8D25\u65F6\u53EF\u91CD\u8BD5\u3002",
      "settings.disconnect": "\u9000\u51FA Loop",
      "settings.disconnectFinish": "\u5B8C\u6210\u9000\u51FA",
      "settings.disconnectConfirm": "\u524D\u5F80 Loop \u786E\u8BA4\u9000\u51FA",
      "settings.disconnectCheck": "\u68C0\u67E5\u9000\u51FA\u7ED3\u679C",
      "settings.disconnectPending": "\u5DF2\u505C\u6B62\u4E0A\u4F20\uFF0C\u8BF7\u5B8C\u6210\u9000\u51FA\u4EE5\u65AD\u5F00 Loop\u3002",
      "settings.disconnectDescription": "\u65AD\u5F00\u5F53\u524D Loop \u8FDE\u63A5\u7684\u4E0A\u4F20\u3001\u667A\u80FD\u4F53\u548C\u6A21\u578B\u6388\u6743\uFF0C\u804A\u5929\u8BB0\u5F55\u4F1A\u4FDD\u7559\u3002",
      "error.credentialUnavailable": "\u65E0\u6CD5\u8BFB\u53D6\u672C\u673A\u4FDD\u5B58\u7684 Loop \u767B\u5F55\u51ED\u636E\u3002\u8BF7\u6062\u590D\u51ED\u636E\u8BBF\u95EE\u540E\u91CD\u65B0\u8FDE\u63A5\uFF0C\u672C\u5730\u804A\u5929\u4ECD\u53EF\u4F7F\u7528\u3002",
      "settings.uploadConnected": "\u5DF2\u8FDE\u63A5\uFF0C\u804A\u5929\u8BB0\u5F55\u4F1A\u81EA\u52A8\u4E0A\u4F20\u3002",
      "launcher.loopNeedsConnection": "\u5B8C\u6210 Loop \u8FDE\u63A5",
      "upload.label": "Loop \u4E0A\u4F20\u72B6\u6001",
      "upload.uploading": "\u6B63\u5728\u4E0A\u4F20\u4E2D",
      "upload.uploaded": "\u5DF2\u4E0A\u4F20",
      "upload.failed": "\u4E0A\u4F20\u5931\u8D25",
      "upload.off": "\u672A\u767B\u5F55 Loop",
      "panel.label": "Loop",
      "slash.loopSkills": "Loop \xB7 \u6280\u80FD",
      "slash.loopKnowledge": "Loop \xB7 \u77E5\u8BC6\u5E93",
      "knowledge.error.unavailable": "Loop \u77E5\u8BC6\u5E93\u6682\u4E0D\u53EF\u7528\u3002\u8BF7\u68C0\u67E5\u8FDE\u63A5\u4E0E\u8BBF\u95EE\u6743\u9650\uFF0C\u518D\u6253\u5F00 / \u91CD\u65B0\u9009\u62E9\u3002",
      "error.loopSkills": "Loop \u6280\u80FD\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
      "skill.error.auth": "\u4F7F\u7528 Loop \u6280\u80FD\u524D\u8BF7\u5148\u767B\u5F55 Loop\u3002",
      "skill.error.hostUpdate": "\u8BF7\u66F4\u65B0 Loop \u63D2\u4EF6\u540E\u4F7F\u7528\u6280\u80FD\u3002",
      "skill.error.session": "\u8BF7\u5148\u4ECE\u6B64 Session \u6240\u5728\u7684 Loop \u5DE5\u4F5C\u533A\u6253\u5F00 Loop \u6280\u80FD\u3002",
      "skill.error.reference": "\u6B64 Loop \u6280\u80FD\u9009\u62E9\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
      "skill.error.path": "\u6B64 Loop \u6280\u80FD\u8DEF\u5F84\u4E0D\u53D7\u652F\u6301\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6280\u80FD\u3002",
      "skill.error.offline": "Loop \u5F53\u524D\u4E0D\u53EF\u7528\uFF0C\u8349\u7A3F\u672A\u6539\u53D8\u3002",
      "skill.error.busy": "Loop \u6280\u80FD\u66F4\u65B0\u6682\u65F6\u53D7\u9650\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
      "skill.error.cancelled": "Loop \u6280\u80FD\u52A0\u8F7D\u5DF2\u53D6\u6D88\u3002",
      "skill.error.bindingStale": "\u6B64 Loop \u6280\u80FD\u7248\u672C\u5DF2\u53D8\u5316\u6216\u4E0D\u518D\u53D7\u6743\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
      "skill.error.tooLarge": "\u6B64 Loop \u6280\u80FD\u8FC7\u5927\uFF0C\u65E0\u6CD5\u5B89\u5168\u52A0\u8F7D\u3002",
      "skill.error.unavailable": "\u6B64 Loop \u6280\u80FD\u5F53\u524D\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
      "module.inbox": "\u6536\u4EF6\u7BB1",
      "module.contacts": "\u901A\u8BAF\u5F55",
      "module.tasks": "\u4EFB\u52A1",
      "module.projects": "\u9879\u76EE",
      "module.workflows": "\u5DE5\u4F5C\u6D41",
      "module.knowledge": "\u77E5\u8BC6\u5E93",
      "module.drive": "\u4E91\u76D8",
      "module.dataspaces": "\u6570\u636E\u7A7A\u95F4",
      "module.capabilities": "\u4E13\u5BB6 \xB7 \u6280\u80FD",
      "module.connectors": "\u8FDE\u63A5\u5668",
      "launcher.title": "Super Agent",
      "launcher.more": "\u66F4\u591A",
      "launcher.feedback": "\u610F\u89C1\u53CD\u9988",
      "launcher.signIn": "\u767B\u5F55",
      "launcher.open": "\u6253\u5F00\u66F4\u591A\u83DC\u5355",
      "launcher.loopAccount": "Loop \u8D26\u53F7",
      "launcher.loopConnected": "\u5DF2\u767B\u5F55 Loop",
      "launcher.loopConnecting": "\u6B63\u5728\u8FDE\u63A5 Loop",
      "launcher.loopNeedsSetup": "\u5C1A\u672A\u767B\u5F55 Loop",
      "launcher.loopNeedsAttention": "Loop \u8FDE\u63A5\u4E2D\u65AD",
      "launcher.connectLoop": "\u767B\u5F55 Loop",
      "launcher.modelSelected": "\u672C\u6B21\u4F1A\u8BDD\uFF1A{model}",
      "launcher.modelSessionDefault": "\u672C\u6B21\u4F1A\u8BDD\u9ED8\u8BA4\uFF1A{model}",
      "launcher.modelSelectedUnavailable": "\u6A21\u578B\u4E0D\u53EF\u7528\uFF1A{model}",
      "launcher.modelNewSessionDefault": "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\uFF1A{model}",
      "launcher.modelNewSessionDefaultUnavailable": "\u9ED8\u8BA4\u6A21\u578B\u4E0D\u53EF\u7528\uFF1A{model}",
      "launcher.modelLoading": "\u67E5\u770B\u6A21\u578B\u8BBE\u7F6E",
      "launcher.modelUnavailable": "\u6A21\u578B\u4E0D\u53EF\u7528\uFF0C\u6253\u5F00\u8BBE\u7F6E",
      "launcher.modelSourceExternal": "\u5916\u90E8\u4F9B\u5E94\u5546",
      "launcher.modelSourceUnknown": "\u6765\u6E90\u5F85\u786E\u8BA4",
      "launcher.modelBillingPersonal": "\u4E2A\u4EBA\u4F9B\u5E94\u5546\u8BA1\u8D39",
      "launcher.modelBillingOrganization": "\u7EC4\u7EC7\u6A21\u578B\u6743\u9650",
      "launcher.modelBillingLoopHosted": "Loop \u6258\u7BA1\u7528\u91CF",
      "launcher.modelBillingProvider": "\u4F9B\u5E94\u5546\u8BA1\u8D39",
      "launcher.modelBillingUnknown": "\u8D39\u7528\u6765\u6E90\u5F85\u786E\u8BA4",
      "launcher.settings": "\u8BBE\u7F6E",
      "onboarding.loginLoop": "\u767B\u5F55 Loop",
      "onboarding.openKeySettings": "\u8F93\u5165 API Key",
      "onboarding.authorizeModels": "\u8FDE\u63A5 Loop \u6A21\u578B",
      "onboarding.openModelsAuth": "\u524D\u5F80\u6388\u6743",
      "onboarding.continueModels": "\u6211\u5DF2\u6388\u6743\uFF0C\u7EE7\u7EED",
      "onboarding.configureLoop": "\u914D\u7F6E Loop \u670D\u52A1\u5668",
      "onboarding.resume": "\u7EE7\u7EED Loop \u8BBE\u7F6E",
      "onboarding.cancelledBody": "\u53EF\u4EE5\u7A0D\u540E\u7EE7\u7EED\u8BBE\u7F6E Loop\uFF0C\u4E5F\u53EF\u4EE5\u4F7F\u7528 API Key\u3002",
      "onboarding.workspaceTitle": "\u767B\u5F55 Loop",
      "onboarding.workspaceBody": "\u767B\u5F55\u540E\u9009\u62E9\u5DE5\u4F5C\u533A\uFF0C\u5373\u53EF\u7EE7\u7EED\u3002",
      "onboarding.modelsTitle": "\u6388\u6743 Loop \u6A21\u578B",
      "onboarding.modelsBody": "\u8FDE\u63A5 Loop \u6A21\u578B\u540E\uFF0C\u9009\u62E9\u8981\u4F7F\u7528\u7684\u6A21\u578B\u3002",
      "onboarding.openLoopPage": "\u6253\u5F00 Loop \u68C0\u67E5",
      "onboarding.continueSetup": "\u7EE7\u7EED\u8BBE\u7F6E",
      "onboarding.checkingModels": "\u6B63\u5728\u68C0\u67E5\u6A21\u578B\u2026",
      "onboarding.recoverLogin": "\u6062\u590D\u767B\u5F55",
      "error.credentialRecoveryDisabled": "\u542F\u52A8\u5668\u7981\u6B62\u7CFB\u7EDF\u6388\u6743\u5F39\u7A97\u3002\u8BF7\u79FB\u9664 LOOP_KEYCHAIN_NO_UI \u8BBE\u7F6E\u5E76\u91CD\u542F\uFF0C\u518D\u6062\u590D\u767B\u5F55\u3002",
      "onboarding.recoveringLogin": "\u8BF7\u5728\u7CFB\u7EDF\u7A97\u53E3\u4E2D\u6388\u6743\u8BBF\u95EE\u51ED\u636E\u3002\u9009\u62E9\u201C\u59CB\u7EC8\u5141\u8BB8\u201D\uFF0C\u91CD\u542F\u540E\u5373\u53EF\u7EE7\u7EED\u4F7F\u7528\u3002",
      "onboarding.retryModels": "\u91CD\u65B0\u68C0\u67E5",
      "onboarding.stopWaiting": "\u53D6\u6D88\u6388\u6743",
      "onboarding.modelNeedsAuth": "\u8BF7\u5141\u8BB8 Super Agent \u4F7F\u7528\u4F60\u7684 Loop \u6A21\u578B\u3002",
      "onboarding.modelRateLimited": "\u8BF7\u6C42\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
      "onboarding.noModels": "\u8FD8\u6CA1\u6709\u53EF\u7528\u6A21\u578B\u3002\u8BF7\u5728 Loop \u4E2D\u68C0\u67E5\u6A21\u578B\u914D\u7F6E\u3001\u6743\u9650\u6216\u4F59\u989D\u3002",
      "onboarding.catalogUnavailable": "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u6A21\u578B\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      "onboarding.routeMissing": "\u6A21\u578B\u8FDE\u63A5\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002",
      "onboarding.selectionRequired": "\u8BF7\u9009\u62E9\u8981\u4F7F\u7528\u7684\u6A21\u578B\u3002",
      "onboarding.scopeRequired": "\u8BF7\u5148\u767B\u5F55 Loop \u5E76\u9009\u62E9\u5DE5\u4F5C\u533A\u3002",
      "onboarding.chooseModelHint": "\u53EF\u5728\u804A\u5929\u8F93\u5165\u6846\u65C1\u968F\u65F6\u5207\u6362\u3002",
      "onboarding.chooseModel": "\u9009\u62E9\u6A21\u578B",
      "onboarding.useModel": "\u4F7F\u7528\u6B64\u6A21\u578B",
      "onboarding.savingModel": "\u6B63\u5728\u4FDD\u5B58\u6A21\u578B\u9009\u62E9\u2026",
      "onboarding.selectionSaveFailed": "\u6A21\u578B\u9009\u62E9\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      "onboarding.selectionSaveUnknown": "\u5C1A\u672A\u786E\u8BA4\u4FDD\u5B58\uFF0C\u8BF7\u518D\u9009\u4E00\u6B21\u3002",
      "onboarding.modelError": "\u6A21\u578B\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u6216\u4F7F\u7528 API Key\u3002",
      "onboarding.externalReady": "API Key \u6A21\u578B\u5DF2\u5C31\u7EEA\u3002",
      "onboarding.keyTitle": "\u5B8C\u6210\u6A21\u578B\u8BBE\u7F6E",
      "onboarding.keyBody": "\u5728\u201C\u8BBE\u7F6E \u2192 \u6A21\u578B\u201D\u4E2D\u6DFB\u52A0 API Key\uFF0C\u7136\u540E\u9009\u62E9\u6A21\u578B\u3002",
      "onboarding.returnLoop": "\u6539\u7528 Loop \u767B\u5F55",
      "onboarding.apiKeyHint": "API Key \u7531 DSH \u73B0\u6709\u6A21\u578B\u8BBE\u7F6E\u4FDD\u5B58\u3002\u767B\u5F55 Loop \u4E0D\u4F1A\u66FF\u6362\u6216\u5220\u9664\u5DF2\u6709 Key\u3002",
      "onboarding.loopConnecting": "\u6B63\u5728\u68C0\u67E5 Loop \u8FDE\u63A5\u2026",
      "onboarding.loopReady": "Loop \u5DF2\u8FDE\u63A5\uFF0C\u6A21\u578B\u53EF\u7528\u3002",
      "onboarding.loopConnectedModelPending": "Loop \u5DF2\u8FDE\u63A5\uFF0C\u4F46\u5C1A\u672A\u53D6\u5F97\u53EF\u7528\u6A21\u578B\u3002\u8BF7\u5148\u5728 Loop \u5B8C\u6210\u6A21\u578B\u914D\u7F6E\uFF0C\u6216\u4F7F\u7528 API Key\u3002",
      "onboarding.loopNeedsServer": "\u8BF7\u5148\u914D\u7F6E Loop \u670D\u52A1\u5668\uFF0C\u7136\u540E\u767B\u5F55\u7EE7\u7EED\u3002",
      "onboarding.loopNeedsAttention": "Loop \u5C1A\u672A\u8FDE\u63A5\u3002\u8BF7\u91CD\u8BD5\uFF0C\u6216\u4F7F\u7528 API Key\u3002",
      "onboarding.loopUnavailable": "\u65E0\u6CD5\u8BFB\u53D6 Loop \u8FDE\u63A5\uFF0C\u8BF7\u91CD\u8BD5\u540E\u518D\u767B\u5F55\u3002",
      "menu.connect": "\u5173\u8054 Loop \u9879\u76EE\u2026",
      "menu.activeSummary": "Loop \u9879\u76EE\uFF1A{loopWorkspace} / {project}",
      "menu.openProject": "\u6253\u5F00 Loop \u9879\u76EE",
      "menu.inspect": "\u67E5\u770B\u9879\u76EE\u8FDE\u63A5",
      "menu.switch": "\u5207\u6362\u9879\u76EE",
      "menu.unbind": "\u53D6\u6D88\u9879\u76EE\u5173\u8054",
      "menu.needsAuth": "\u91CD\u65B0\u8FDE\u63A5 Loop\u2026",
      "menu.waiting": "\u68C0\u67E5\u9879\u76EE\u6743\u9650\u2026",
      "menu.revoked": "\u91CD\u65B0\u8FDE\u63A5 Loop\u2026",
      "menu.unavailable": "\u4FEE\u590D Loop \u8FDE\u63A5\u2026",
      "menu.statusError": "Loop \u8FDE\u63A5\u4E0D\u53EF\u7528\u2026",
      "menu.failure": "\u65E0\u6CD5\u6253\u5F00 Loop \u8FDE\u63A5\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      "dialog.title": "Loop \u9879\u76EE",
      "dialog.currentBindingTitle": "\u5F53\u524D\u9879\u76EE",
      "dialog.close": "\u5173\u95ED",
      "dialog.loading": "\u6B63\u5728\u8BFB\u53D6 Loop \u8FDE\u63A5\u2026",
      "dialog.unboundTitle": "\u8FDE\u63A5\u6B64\u5DE5\u4F5C\u533A",
      "dialog.unboundBody": "\u53EA\u9700\u9009\u62E9\u4E00\u4E2A Loop \u9879\u76EE\u3002\u6B64\u540E\u8BE5\u5DE5\u4F5C\u533A\u7684\u65B0\u4F1A\u8BDD\u4F1A\u81EA\u52A8\u4F7F\u7528\u5B83\u3002",
      "dialog.connect": "\u8FDE\u63A5 Loop",
      "dialog.loginTitle": "\u767B\u5F55 Loop",
      "dialog.loginBody": "\u5728\u6D4F\u89C8\u5668\u4E2D\u767B\u5F55 Loop\uFF0C\u4E3A\u6B64\u5DE5\u4F5C\u533A\u9009\u62E9\u6216\u521B\u5EFA\u667A\u80FD\u4F53\uFF0C\u7136\u540E\u56DE\u5230\u8FD9\u91CC\u3002",
      "dialog.openLogin": "\u6253\u5F00 Loop \u767B\u5F55",
      "dialog.loginOpened": "\u767B\u5F55\u5B8C\u6210\u540E\u56DE\u5230\u8FD9\u91CC\u7EE7\u7EED\u3002",
      "dialog.continue": "\u7EE7\u7EED",
      "dialog.projectTitle": "\u9009\u62E9\u9879\u76EE",
      "dialog.chooseAnotherProject": "\u9009\u62E9\u5176\u4ED6\u9879\u76EE",
      "dialog.agentTitle": "Super Agent",
      "dialog.chooseProject": "\u9009\u62E9\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8981\u4F7F\u7528\u7684\u9879\u76EE\u3002",
      "dialog.chooseAgent": "\u9009\u62E9\u4E3A\u6B64\u5DE5\u4F5C\u533A\u6267\u884C\u4EFB\u52A1\u7684\u667A\u80FD\u4F53\u3002",
      "dialog.chooseLoopWorkspace": "\u9009\u62E9 Loop \u5DE5\u4F5C\u533A",
      "dialog.createProject": "\u65B0\u5EFA\u9879\u76EE",
      "dialog.projectName": "\u9879\u76EE\u540D\u79F0",
      "dialog.projectPlaceholder": "\u4F8B\u5982\uFF1ATiDB 9.0 \u53D1\u5E03",
      "dialog.projectPrefix": "\u4EFB\u52A1\u7F16\u53F7\u524D\u7F00",
      "dialog.projectPrefixPlaceholder": "\u4F8B\u5982\uFF1ATIDB",
      "dialog.projectPrefixHint": "1\u201332 \u4E2A\u82F1\u6587\u5B57\u6BCD\uFF0C\u521B\u5EFA\u540E\u4E0D\u53EF\u4FEE\u6539\u3002",
      "dialog.create": "\u65B0\u5EFA",
      "dialog.bind": "\u4F7F\u7528\u6B64\u9879\u76EE",
      "dialog.selectRequired": "\u8BF7\u9009\u62E9\u9879\u76EE\u548C Super Agent \u540E\u7EE7\u7EED\u3002",
      "dialog.noAgents": "\u6682\u65E0\u53EF\u7528\u667A\u80FD\u4F53\u3002\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u9009\u62E9\u6216\u521B\u5EFA\u4E00\u4E2A\u3002",
      "dialog.agentSignIn": "\u91CD\u65B0\u767B\u5F55\u4EE5\u9009\u62E9\u6216\u521B\u5EFA",
      "dialog.currentAccount": "\u5F53\u524D\u8D26\u53F7",
      "dialog.superAgent": "Super Agent",
      "dialog.notConnected": "\u672A\u8FDE\u63A5",
      "dialog.localWorkspace": "\u672C\u5730\u5DE5\u4F5C\u533A",
      "dialog.loopWorkspace": "Loop \u5DE5\u4F5C\u7A7A\u95F4",
      "dialog.projectLabel": "Loop \u9879\u76EE",
      "dialog.channelReady": "\u9879\u76EE\u4F1A\u8BDD\u9891\u9053\u5DF2\u5C31\u7EEA",
      "dialog.viewLoop": "\u6253\u5F00 Loop \u9879\u76EE",
      "dialog.switchProject": "\u5207\u6362\u9879\u76EE",
      "dialog.unbindProject": "\u53D6\u6D88\u9879\u76EE\u5173\u8054",
      "dialog.unbindTitle": "\u53D6\u6D88\u9879\u76EE\u5173\u8054\uFF1F",
      "dialog.unbindBody": "\u65B0\u4F1A\u8BDD\u5C06\u4E0D\u518D\u4F7F\u7528\u6B64\u9879\u76EE\uFF0C\u5DF2\u6709\u4F1A\u8BDD\u4F1A\u7ACB\u5373\u505C\u6B62 Loop \u64CD\u4F5C\u548C\u540C\u6B65\u3002\u5176\u4ED6\u9879\u76EE\u8FDE\u63A5\u4E0D\u53D7\u5F71\u54CD\u3002\u82E5\u8FD9\u662F\u6700\u540E\u4E00\u4E2A\u9879\u76EE\uFF0C\u4E5F\u4F1A\u65AD\u5F00\u8FD9\u6B21 Loop \u8FDE\u63A5\u53CA\u5176\u6A21\u578B\u3001\u540C\u6B65\u548C\u8FDC\u7A0B\u8BBF\u95EE\u3002\u804A\u5929\u4E0E Loop \u5185\u5BB9\u4F1A\u4FDD\u7559\u3002",
      "dialog.disconnectLoginTitle": "\u5B8C\u6210\u9000\u51FA Loop",
      "dialog.disconnectLoginBody": "\u8BF7\u767B\u5F55\u539F\u6765\u7684 Loop \u8D26\u53F7\uFF0C\u786E\u8BA4\u8981\u65AD\u5F00\u7684\u8FDE\u63A5\uFF0C\u7136\u540E\u56DE\u5230\u8FD9\u91CC\u5B8C\u6210\u9000\u51FA\u3002",
      "dialog.disconnectLoginOpen": "\u767B\u5F55 Loop",
      "dialog.disconnectLater": "\u7A0D\u540E\u5B8C\u6210",
      "dialog.disconnectCheck": "\u68C0\u67E5\u662F\u5426\u5DF2\u9000\u51FA",
      "dialog.disconnectChecking": "\u6B63\u5728\u68C0\u67E5\u9000\u51FA...",
      "dialog.cancel": "\u53D6\u6D88",
      "dialog.confirmUnbind": "\u53D6\u6D88\u9879\u76EE\u5173\u8054",
      "dialog.waitingTitle": "\u7B49\u5F85\u9879\u76EE\u6743\u9650",
      "dialog.waitingBody": "\u4F60\u8FD8\u6CA1\u6709\u6B64\u9879\u76EE\u7684\u8BBF\u95EE\u6743\u9650\u3002\u8BF7\u8054\u7CFB\u9879\u76EE\u7BA1\u7406\u5458\u83B7\u53D6\u6743\u9650\uFF0C\u7136\u540E\u518D\u6B21\u68C0\u67E5\u3002",
      "dialog.unavailableTitle": "\u9879\u76EE\u4E0D\u53EF\u7528",
      "dialog.unavailableBody": "\u4FDD\u5B58\u7684 Loop \u9879\u76EE\u6216\u4F1A\u8BDD\u9891\u9053\u5DF2\u4E0D\u53EF\u7528\u3002\u8BF7\u91CD\u65B0\u9009\u62E9\u9879\u76EE\u4EE5\u6062\u590D\u3002",
      "dialog.revokedTitle": "Loop \u8FDE\u63A5\u5DF2\u64A4\u9500",
      "dialog.revokedBody": "\u6B64\u8FDE\u63A5\u5DF2\u4E0D\u518D\u83B7\u5F97\u6388\u6743\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002",
      "dialog.retry": "\u518D\u6B21\u68C0\u67E5",
      "dialog.reconnect": "\u91CD\u65B0\u8FDE\u63A5 Loop",
      "dialog.reloadChoices": "\u5237\u65B0\u9879\u76EE\u548C\u667A\u80FD\u4F53",
      "dialog.retryConnection": "\u91CD\u65B0\u68C0\u67E5 Loop \u8FDE\u63A5",
      "dialog.retryAccess": "\u91CD\u65B0\u68C0\u67E5\u9879\u76EE\u6743\u9650",
      "dialog.role.view": "\u53EF\u67E5\u770B",
      "dialog.role.edit": "\u53EF\u7F16\u8F91",
      "dialog.role.manage": "\u53EF\u7BA1\u7406",
      "dialog.role.owner": "\u6240\u6709\u8005",
      "dialog.syncTitle": "\u6B64\u4F1A\u8BDD",
      "dialog.syncStatus": "\u540C\u6B65\u72B6\u6001",
      "dialog.syncDescription": "\u6B64 Loop \u9879\u76EE\u5DE5\u4F5C\u533A\u7684\u65B0\u4F1A\u8BDD\u4F1A\u81EA\u52A8\u540C\u6B65\uFF1B\u8FD9\u91CC\u53EA\u540C\u6B65\u53EF\u89C1\u6D88\u606F\uFF0C\u4E5F\u53EF\u4EE5\u6682\u505C\u5F53\u524D\u4F1A\u8BDD\u3002",
      "dialog.syncToggle": "\u540C\u6B65\u6B64\u4F1A\u8BDD\u5230 Loop",
      "dialog.syncOff": "\u540C\u6B65\u5DF2\u5173\u95ED",
      "dialog.syncOn": "\u540C\u6B65\u5DF2\u5F00\u542F",
      "dialog.syncPending": "\u7B49\u5F85\u53D1\u9001",
      "dialog.syncRetrying": "\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5",
      "dialog.syncError": "\u540C\u6B65\u9700\u8981\u5904\u7406",
      "dialog.syncNeedsAuth": "\u91CD\u65B0\u767B\u5F55\u540E\u624D\u80FD\u7EE7\u7EED\u540C\u6B65",
      "dialog.syncDestination": "\u76EE\u6807\u4F4D\u7F6E",
      "dialog.syncTopicReady": "\u9879\u76EE\u9891\u9053 \xB7 \u8BDD\u9898\u5DF2\u8FDE\u63A5",
      "dialog.syncTopicPending": "\u53D1\u9001\u9996\u6761\u5171\u4EAB\u6D88\u606F\u540E\uFF0C\u5C06\u5728\u9879\u76EE\u4E2D\u521B\u5EFA\u8BDD\u9898\u3002",
      "dialog.syncPendingCount": "{count} \u9879\u7B49\u5F85\u53D1\u9001",
      "dialog.syncLastReceiptLabel": "\u6700\u8FD1\u63A5\u6536",
      "dialog.syncLastReceipt": "\u5DF2\u63A5\u6536\u7B2C {sequence} \u6761\u6D88\u606F",
      "dialog.syncPartial": "\u90E8\u5206\u8F83\u65E9\u7684\u53EF\u89C1\u5386\u53F2\u65E0\u6CD5\u6062\u590D\u3002",
      "dialog.syncCheck": "\u7ACB\u5373\u68C0\u67E5",
      "dialog.syncUnavailable": "\u6B64\u4F1A\u8BDD\u5C1A\u672A\u8FDE\u63A5\u5230 Loop \u9879\u76EE\u3002",
      "dialog.syncCreatedBefore": "\u6B64\u4F1A\u8BDD\u521B\u5EFA\u4E8E\u5F53\u524D\u5DE5\u4F5C\u533A\u8FDE\u63A5\u4E4B\u524D\u3002\u8BF7\u65B0\u5EFA\u4F1A\u8BDD\u540E\u518D\u5F00\u542F\u540C\u6B65\u3002",
      "dialog.syncOriginalBinding": "\u6B64\u4F1A\u8BDD\u4ECD\u4F7F\u7528\u539F\u6765\u7684 Loop \u9879\u76EE\u3002\u8BF7\u6253\u5F00\u8BE5\u9879\u76EE\uFF0C\u6216\u65B0\u5EFA\u4F1A\u8BDD\u540E\u4F7F\u7528\u5F53\u524D\u9879\u76EE\u3002",
      "dialog.syncAuth": "\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u518D\u540C\u6B65\u6B64\u4F1A\u8BDD\u3002",
      "dialog.syncAuthPrompt": "\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u6388\u6743\u3002\u4EC5\u540C\u6B65\u6B64\u4F1A\u8BDD\u4E4B\u540E\u53EF\u89C1\u7684\u6D88\u606F\uFF0C\u5E76\u590D\u7528\u4F60\u5DF2\u6709\u7684 Loop \u767B\u5F55\u3002",
      "dialog.syncAuthorize": "\u5728\u6D4F\u89C8\u5668\u4E2D\u6388\u6743",
      "dialog.syncAuthOpened": "\u5141\u8BB8\u540C\u6B65\u540E\u8FD4\u56DE\u8FD9\u91CC\uFF0C\u6B64\u4F1A\u8BDD\u4F1A\u81EA\u52A8\u5F00\u542F\u540C\u6B65\u3002",
      "dialog.syncNeedsAuthHint": "\u6388\u6743\u4E00\u6B21 Loop \u540C\u6B65\u540E\uFF0C\u5373\u53EF\u7EE7\u7EED\u53D1\u9001\u6B64\u4F1A\u8BDD\u7684\u53EF\u89C1\u6D88\u606F\u3002",
      "dialog.syncSaving": "\u6B63\u5728\u66F4\u65B0\u540C\u6B65\u2026",
      "global.loading": "\u6B63\u5728\u52A0\u8F7D Loop",
      "global.aria": "Loop \u5E94\u7528",
      "global.error": "\u65E0\u6CD5\u5728\u6B64\u9762\u677F\u4E2D\u6253\u5F00 Loop\u3002",
      "global.reconnect": "\u91CD\u65B0\u8FDE\u63A5 Loop",
      "global.retry": "\u91CD\u8BD5",
      "global.serverLabel": "\u670D\u52A1\u5668\u5730\u5740",
      "global.serverPlaceholder": "https://loop.example.com",
      "global.serverSave": "\u4FDD\u5B58\u5E76\u8FDE\u63A5",
      "global.serverSaving": "\u6B63\u5728\u8FDE\u63A5\u2026",
      "global.workspaceError": "\u65E0\u6CD5\u5E94\u7528\u6240\u9009 Loop \u5DE5\u4F5C\u533A\uFF0C\u8BF7\u5728 Loop \u4E2D\u91CD\u65B0\u9009\u62E9\u3002",
      "global.connectSettingsTitle": "\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u8FDE\u63A5 Loop",
      "global.connectSettingsBody": "\u6253\u5F00 Harness \u8BBE\u7F6E\uFF0C\u9009\u62E9 Loop\uFF0C\u7136\u540E\u586B\u5199 Loop \u670D\u52A1\u5668\u5730\u5740\u3002",
      "global.dataWaiting": "\u6B63\u5728\u8FDE\u63A5 Loop \u6570\u636E\u2026",
      "global.dataReconnecting": "\u6B63\u5728\u5237\u65B0 Loop \u6570\u636E\u2026",
      "global.dataUnavailable": "Loop \u5B9E\u65F6\u6570\u636E\u6682\u4E0D\u53EF\u7528\u3002",
      "global.dataAuthRequired": "\u8BF7\u91CD\u65B0\u767B\u5F55 Loop \u4EE5\u6062\u590D\u5B9E\u65F6\u6570\u636E\u3002",
      "global.connectionReconnecting": "\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5 Loop \u6570\u636E\u2026",
      "global.connectionDisconnected": "Loop \u6570\u636E\u66F4\u65B0\u5DF2\u6682\u505C\u3002",
      "settings.title": "Loop",
      "settings.uploadDisconnectedHistory": "\u4E0A\u4F20\u672A\u767B\u5F55\u671F\u95F4\u7684\u804A\u5929",
      "settings.uploadDisconnectedHistoryHint": "\u9ED8\u8BA4\u5173\u95ED\u3002\u5173\u95ED\u65F6\uFF0C\u53EA\u4E0A\u4F20\u767B\u5F55 Loop \u671F\u95F4\u6536\u5230\u7684\u65B0\u6D88\u606F\uFF1B\u5F00\u542F\u540E\uFF0C\u767B\u5F55\u65F6\u4E5F\u4F1A\u8865\u4F20\u53EF\u8BBF\u95EE\u7684\u804A\u5929\u5386\u53F2\u3002",
      "settings.uploadPreferencesError": "\u65E0\u6CD5\u8BFB\u53D6\u6216\u4FDD\u5B58\u4E0A\u4F20\u8BBE\u7F6E\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      "settings.description": "\u767B\u5F55\u4E00\u6B21\uFF0C\u81EA\u52A8\u8FDE\u63A5 Loop \u5E76\u914D\u7F6E\u53EF\u7528\u6A21\u578B\u3002",
      "settings.loading": "\u6B63\u5728\u52A0\u8F7D Loop \u8BBE\u7F6E",
      "settings.serverTitle": "Loop \u670D\u52A1\u5668",
      "settings.serverDescription": "\u586B\u5199\u4F60\u4F7F\u7528\u7684 Loop \u7F51\u5740\u3002",
      "settings.serverConnected": "\u670D\u52A1\u5668\u5DF2\u8FDE\u63A5",
      "settings.serverUpdate": "\u66F4\u65B0\u8FDE\u63A5",
      "settings.openLoop": "\u6253\u5F00 Loop",
      "settings.modelsTitle": "Loop \u6A21\u578B",
      "settings.modelsDescription": "\u4F7F\u7528 Loop \u8D26\u53F7\u4E2D\u7684\u4E2A\u4EBA\u3001\u7EC4\u7EC7\u6216\u6258\u7BA1\u6A21\u578B\u3002",
      "settings.currentSessionModel": "\u672C\u6B21\u4F1A\u8BDD\u7684\u6A21\u578B",
      "settings.currentSessionDefaultModel": "\u672C\u6B21\u4F1A\u8BDD\u4F7F\u7528\u9ED8\u8BA4\u6A21\u578B",
      "settings.newSessionDefaultModel": "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u6A21\u578B",
      "settings.currentModelUnavailable": "\u5F53\u524D\u6A21\u578B\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
      "settings.currentModelHint": "\u8FD9\u91CC\u663E\u793A\u5F53\u524D\u5B9E\u9645\u9009\u62E9\u3002\u8FDE\u63A5\u53D8\u5316\u65F6 Harness \u4E0D\u4F1A\u81EA\u52A8\u5207\u6362\u6A21\u578B\u3002",
      "settings.modelsLoading": "\u6B63\u5728\u52A0\u8F7D Loop \u6A21\u578B\u2026",
      "settings.modelsCount": "{count} \u4E2A\u53EF\u7528\u6A21\u578B",
      "settings.modelsNoneAvailable": "\u6682\u65E0\u53EF\u7528\u6A21\u578B\uFF0C\u8BF7\u5728 Loop \u4E2D\u68C0\u67E5\u6A21\u578B\u914D\u7F6E\u3001\u6743\u9650\u6216\u4F59\u989D\u3002",
      "settings.modelsEmptyTitle": "\u5C1A\u672A\u8FDE\u63A5 Loop \u6A21\u578B",
      "settings.modelsEmptyBody": "\u8FDE\u63A5\u540E\u5373\u53EF\u5728\u804A\u5929\u4E2D\u9009\u62E9\u4F7F\u7528\u3002",
      "settings.modelsAuthTitle": "\u6388\u6743 Loop \u6A21\u578B",
      "settings.modelsAuthBody": "\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u786E\u8BA4\u6388\u6743\uFF0C\u7136\u540E\u56DE\u5230\u8FD9\u91CC\u7EE7\u7EED\u3002",
      "settings.modelsAuthOpen": "\u6253\u5F00\u6D4F\u89C8\u5668\u6388\u6743",
      "settings.modelsAuthContinue": "\u6211\u5DF2\u6388\u6743\uFF0C\u7EE7\u7EED",
      "settings.modelsChecking": "\u6B63\u5728\u786E\u8BA4\u6388\u6743\u2026",
      "settings.modelsDisconnect": "\u65AD\u5F00",
      "settings.modelsDisconnecting": "\u6B63\u5728\u65AD\u5F00\u2026",
      "settings.modelsConnect": "\u8FDE\u63A5 Loop \u6A21\u578B",
      "settings.modelsConnectAnother": "\u6DFB\u52A0\u6A21\u578B\u8FDE\u63A5",
      "settings.modelsAuthorizing": "\u6B63\u5728\u53D1\u8D77\u6388\u6743\u2026",
      "settings.modelsRefresh": "\u5237\u65B0\u6A21\u578B",
      "settings.modelsRefreshing": "\u6B63\u5728\u5237\u65B0\u2026",
      "settings.modelsSourcePersonal": "\u4E2A\u4EBA",
      "settings.modelsSourceOrganization": "\u7EC4\u7EC7",
      "settings.modelsSourceLoopHosted": "Loop \u6258\u7BA1",
      "settings.modelsPickerHint": "\u53EF\u5728\u804A\u5929\u8F93\u5165\u6846\u65C1\u66F4\u6362\u5DF2\u9009\u6A21\u578B\u3002",
      "settings.modelsUnavailable": "Loop \u6A21\u578B\u6682\u65F6\u4E0D\u53EF\u7528\u3002\u8BF7\u68C0\u67E5 Loop \u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
      "settings.modelsReconnectRequired": "\u6388\u6743\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002",
      "settings.modelsAuthRequired": "\u8BF7\u5148\u5728\u6D4F\u89C8\u5668\u5B8C\u6210\u6388\u6743\uFF0C\u518D\u7EE7\u7EED\u3002\u82E5\u6388\u6743\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002",
      "settings.modelsRateLimited": "Loop \u5F53\u524D\u6536\u5230\u7684\u6A21\u578B\u8BF7\u6C42\u8FC7\u591A\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
      "settings.modelsFailed": "Loop \u6A21\u578B\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      "settings.syncTitle": "\u804A\u5929\u8BB0\u5F55\u4E0A\u4F20",
      "settings.syncDescription": "\u767B\u5F55\u540E\uFF0C\u5DE5\u4F5C\u533A\u548C\u4F1A\u8BDD\u4F1A\u5728\u540E\u53F0\u4E0A\u4F20\u5230\u4F60\u7684\u79C1\u4EBA\u9891\u9053\u3002\u672C\u5730\u804A\u5929\u4E0D\u53D7\u5F71\u54CD\u3002",
      "settings.syncLoading": "Loop \u8FDE\u63A5\u5C31\u7EEA\u540E\u5C06\u5728\u6B64\u663E\u793A\u804A\u5929\u8BB0\u5F55\u4E0A\u4F20\u8BBE\u7F6E\u3002",
      "settings.syncEnable": "\u81EA\u52A8\u5BFC\u5165 Loop \u9879\u76EE",
      "settings.syncEnabledDescription": "\u9879\u76EE\u4F1A\u81EA\u52A8\u51FA\u73B0\u5728\u5DE5\u4F5C\u533A\u5217\u8868\u4E2D\u3002\u4F1A\u8BDD\u5171\u4EAB\u53EF\u5728\u8F93\u5165\u6846\u7684 Loop \u83DC\u5355\u4E2D\u5355\u72EC\u63A7\u5236\u3002",
      "settings.syncOffDescription": "\u81EA\u52A8\u5BFC\u5165\u5DF2\u5173\u95ED\u3002",
      "settings.connectionHint": "\u6253\u5F00 Loop\uFF0C\u767B\u5F55\u5E76\u9009\u62E9\u5DE5\u4F5C\u533A\uFF0C\u5373\u53EF\u5BFC\u5165\u5176\u4E2D\u7684\u9879\u76EE\u3002",
      "settings.defaultRoot": "\u9879\u76EE\u4FDD\u5B58\u4F4D\u7F6E",
      "settings.defaultRootPlaceholder": "\u4F8B\u5982\uFF1A/Users/me/Loop",
      "settings.defaultRootHint": "\u4FEE\u6539\u53EA\u5F71\u54CD\u4FDD\u5B58\u540E\u65B0\u5BFC\u5165\u7684\u9879\u76EE\u3002",
      "settings.defaultRootSave": "\u4FDD\u5B58\u76EE\u5F55",
      "settings.defaultRootSaving": "\u6B63\u5728\u4FDD\u5B58\u76EE\u5F55\u2026",
      "settings.defaultRootInvalid": "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u76EE\u5F55\u8DEF\u5F84\u3002",
      "settings.syncRefresh": "\u7ACB\u5373\u5237\u65B0",
      "settings.syncRefreshing": "\u6B63\u5728\u5237\u65B0\u2026",
      "settings.account": "\u8D26\u53F7",
      "settings.lastSynced": "\u6700\u8FD1\u5237\u65B0",
      "settings.authTitle": "\u9700\u8981\u6388\u6743 Loop",
      "settings.authBody": "\u5B8C\u6210\u4E00\u6B21 Loop \u767B\u5F55\u540E\uFF0C\u6240\u6709\u7B26\u5408\u6761\u4EF6\u7684\u9879\u76EE\u90FD\u4F1A\u590D\u7528\u8FD9\u6B21\u6388\u6743\u3002",
      "settings.connectTitle": "\u8FDE\u63A5\u9879\u76EE",
      "settings.connectNeedsAuth": "\u5141\u8BB8\u8BFB\u53D6\u4F60\u7684 Loop \u9879\u76EE\u540E\uFF0C\u5373\u53EF\u81EA\u52A8\u5BFC\u5165\u3002",
      "settings.connectNeedsConfig": "\u8BF7\u5148\u5728 Loop \u9875\u9762\u767B\u5F55\u5E76\u9009\u62E9\u5DE5\u4F5C\u533A\u3002",
      "settings.connectAction": "\u767B\u5F55 Loop",
      "settings.connecting": "\u6B63\u5728\u8FDE\u63A5\u2026",
      "settings.authOpen": "\u6253\u5F00 Loop \u767B\u5F55",
      "settings.authContinue": "\u767B\u5F55\u540E\u7EE7\u7EED",
      "settings.syncSummary": "\u5DF2\u5BFC\u5165 {imported} \u4E2A\uFF0C\u66F4\u65B0 {updated} \u4E2A\uFF0C\u65E0\u53D8\u5316 {skipped} \u4E2A\u3002",
      "settings.projectsTitle": "\u5DF2\u5BFC\u5165\u7684\u9879\u76EE",
      "settings.projectsEmpty": "\u8FD8\u6CA1\u6709\u5BFC\u5165\u9879\u76EE\u3002",
      "settings.changeDirectory": "\u66F4\u6362\u76EE\u5F55",
      "settings.changeDirectoryHint": "\u5C06\u5728\u6B64\u76EE\u5F55\u521B\u5EFA\u65B0\u7684 Harness \u5DE5\u4F5C\u533A\u3002\u65E7\u5DE5\u4F5C\u533A\u3001\u6587\u4EF6\u548C\u4F1A\u8BDD\u5168\u90E8\u4FDD\u7559\uFF1B\u53EA\u89E3\u9664\u65E7\u7684 Loop \u5173\u8054\u3002",
      "settings.newDirectory": "\u9879\u76EE\u65B0\u76EE\u5F55",
      "settings.confirmDirectory": "\u521B\u5EFA\u5DE5\u4F5C\u533A\u5E76\u91CD\u65B0\u5173\u8054",
      "settings.changingDirectory": "\u6B63\u5728\u91CD\u65B0\u5173\u8054\u2026",
      "settings.cancel": "\u53D6\u6D88",
      "settings.directoryConflict": "\u8BE5\u76EE\u5F55\u5DF2\u88AB\u5360\u7528\u6216\u4E0E\u53D7\u4FDD\u62A4\u76EE\u5F55\u91CD\u53E0\uFF0C\u8BF7\u9009\u62E9\u72EC\u7ACB\u7684\u9879\u76EE\u76EE\u5F55\u3002",
      "settings.directoryNeedsAuth": "\u8BF7\u5148\u5B8C\u6210\u4E00\u6B21\u767B\u5F55\uFF0C\u518D\u5C1D\u8BD5\u66F4\u6362\u76EE\u5F55\u3002",
      "settings.directoryFailed": "\u65E0\u6CD5\u91CD\u65B0\u5173\u8054\u6B64\u9879\u76EE\uFF1B\u539F\u6709 Loop \u5173\u8054\u4FDD\u6301\u4E0D\u53D8\u3002",
      "settings.state.off": "\u5DF2\u5173\u95ED",
      "settings.state.needsConfig": "\u9700\u8981\u8BBE\u7F6E",
      "settings.state.needsAuth": "\u9700\u8981\u767B\u5F55",
      "settings.state.ready": "\u5DF2\u540C\u6B65",
      "settings.state.partial": "\u90E8\u5206\u540C\u6B65",
      "settings.state.error": "\u9700\u8981\u5904\u7406",
      "settings.project.pending": "\u6B63\u5728\u521B\u5EFA\u5DE5\u4F5C\u533A",
      "settings.project.synced": "\u5DF2\u540C\u6B65",
      "settings.project.error": "\u540C\u6B65\u5931\u8D25",
      "settings.project.workspaceMissing": "\u5DE5\u4F5C\u533A\u4E0D\u5B58\u5728",
      "session.action": "Loop",
      "session.aria": "Loop \u9879\u76EE\u4E0E\u540C\u6B65",
      "session.noWorkspace": "\u8BF7\u4ECE\u5DE5\u4F5C\u533A\u6253\u5F00\u4F1A\u8BDD\u540E\u518D\u4F7F\u7528 Loop\u3002",
      "error.title": "\u64CD\u4F5C\u672A\u5B8C\u6210",
      "error.transport": "\u65E0\u6CD5\u8FDE\u63A5 Loop\u3002\u8BF7\u68C0\u67E5\u201C\u8BBE\u7F6E \u2192 Loop\u201D\u4E2D\u7684\u670D\u52A1\u5668\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
      "error.backendUnavailable": "Loop \u670D\u52A1\u6682\u4E0D\u53EF\u7528\u3002\u8BF7\u68C0\u67E5\u201C\u8BBE\u7F6E \u2192 Loop\u201D\u548C\u670D\u52A1\u5668\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
      "error.timeout": "Loop \u54CD\u5E94\u8D85\u65F6\u3002\u8BF7\u68C0\u67E5\u201C\u8BBE\u7F6E \u2192 Loop\u201D\u4E2D\u7684\u670D\u52A1\u5668\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
      "error.serverUrl": "\u8BF7\u8F93\u5165\u5B8C\u6574\u7684 HTTPS \u7F51\u5740\uFF1B\u672C\u673A\u670D\u52A1\u53EF\u4F7F\u7528 HTTP\u3002",
      "error.workspaceRequired": "\u8BF7\u6253\u5F00\u4EFB\u4E00 Loop \u6A21\u5757\uFF0C\u5B8C\u6210\u4E00\u6B21 Loop \u5DE5\u4F5C\u533A\u9009\u62E9\uFF0C\u518D\u8FDE\u63A5\u6B64\u9879\u76EE\u3002",
      "error.hostUpdate": "\u8BF7\u66F4\u65B0 Loop \u63D2\u4EF6\u540E\u91CD\u8BD5\u3002",
      "error.selection": "\u8BF7\u5148\u9009\u62E9\u9879\u76EE\u548C Super Agent\u3002",
      "error.popup": "\u6D4F\u89C8\u5668\u963B\u6B62\u4E86 Loop \u767B\u5F55\uFF0C\u8BF7\u5141\u8BB8\u767B\u5F55\u7A97\u53E3\u540E\u91CD\u8BD5\u3002",
      "error.challenge": "Loop \u767B\u5F55\u8BF7\u6C42\u65E0\u6CD5\u7EE7\u7EED\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55\uFF1B\u5F53\u524D\u5DE5\u4F5C\u533A\u548C\u8349\u7A3F\u4E0D\u4F1A\u6539\u53D8\u3002",
      "error.challengeExpired": "\u7528\u4E8E\u9009\u62E9\u9879\u76EE\u548C\u667A\u80FD\u4F53\u7684\u8FDE\u63A5\u4F1A\u8BDD\u5DF2\u8FC7\u671F\u3002\u8BF7\u91CD\u65B0\u8F7D\u5165\u9009\u9879\u540E\u518D\u9009\u62E9\uFF1B\u5F53\u524D\u5DE5\u4F5C\u533A\u548C\u804A\u5929\u8349\u7A3F\u4E0D\u4F1A\u6539\u53D8\u3002",
      "error.needsAuth": "\u9700\u8981\u767B\u5F55 Loop\u3002\u8BF7\u91CD\u65B0\u767B\u5F55\u4EE5\u7EE7\u7EED\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u804A\u5929\u8349\u7A3F\u4E0D\u4F1A\u6539\u53D8\u3002",
      "error.sync": "\u540C\u6B65\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
      "error.projectPrefix": "\u4EFB\u52A1\u7F16\u53F7\u524D\u7F00\u9700\u4E3A 1\u201332 \u4E2A\u82F1\u6587\u5B57\u6BCD\u3002",
      "error.projectTarget": "\u5F53\u524D Loop \u670D\u52A1\u5668\u6216\u8D26\u53F7\u65E0\u6CD5\u6253\u5F00\u6B64\u9879\u76EE\u3002\u8BF7\u5148\u5728\u201C\u8BBE\u7F6E \u2192 Loop\u201D\u786E\u8BA4\u8FDE\u63A5\uFF0C\u518D\u4ECE\u201CLoop \u9879\u76EE\u201D\u4E2D\u9009\u62E9\u9879\u76EE\u3002",
      "error.generic": "Loop \u8FD4\u56DE\u4E86\u5931\u8D25\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      "collab.section.agents": "Loop \u667A\u80FD\u4F53",
      "collab.section.humans": "Loop \u540C\u4E8B",
      "collab.candidate.delegate": "\u53EF\u4F5C\u4E3A\u4EFB\u52A1\u4EBA\u9009",
      "collab.candidate.notify": "\u53EF\u63D0\u53CA",
      "collab.candidate.needsAccess": "\u53EF\u63D0\u53CA \xB7 \u6D3E\u5DE5\u9700\u8981\u6743\u9650",
      "collab.candidate.unavailable": "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684\u534F\u4F5C\u64CD\u4F5C",
      "collab.status.unbound": "\u8FDE\u63A5 Loop \u534F\u4F5C",
      "collab.status.needsAuth": "\u767B\u5F55\u540E\u4F7F\u7528 Loop \u534F\u4F5C",
      "collab.status.needsBoard": "\u9009\u62E9 Loop \u770B\u677F",
      "collab.status.unavailable": "Loop \u534F\u4F5C\u9700\u8981\u5904\u7406",
      "collab.status.worksiteNeedsEnable": "\u770B\u677F\u5DF2\u8FDE\u63A5 \xB7 \u542F\u7528\u8BBE\u5907",
      "collab.status.worksiteAttention": "\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D\u9700\u8981\u5904\u7406",
      "collab.status.ready": "Loop \u534F\u4F5C",
      "collab.status.connected": "{board} \xB7 {count} \u9879\u8FDB\u884C\u4E2D",
      "collab.status.waiting": "\u6B63\u5728\u68C0\u67E5 Loop \u534F\u4F5C\u2026",
      "collab.status.details": "\u67E5\u770B Loop \u534F\u4F5C",
      "collab.dialog.eyebrow": "Loop",
      "collab.dialog.title": "Loop \u534F\u4F5C",
      "collab.dialog.close": "\u5173\u95ED",
      "collab.dialog.loading": "\u6B63\u5728\u8BFB\u53D6 Loop \u534F\u4F5C\u2026",
      "collab.dialog.error": "\u65E0\u6CD5\u66F4\u65B0 Loop \u534F\u4F5C\u3002",
      "collab.dialog.scope": "\u4EFB\u52A1\u770B\u677F",
      "collab.dialog.account": "\u8D26\u53F7",
      "collab.dialog.accountUnavailable": "\u8D26\u53F7\u540D\u79F0\u6682\u4E0D\u53EF\u7528",
      "collab.dialog.coordinator": "\u672C\u6B21\u4F1A\u8BDD\u7684\u667A\u80FD\u4F53",
      "collab.dialog.activeTitle": "\u534F\u4F5C\u4EFB\u52A1",
      "collab.dialog.activeEmpty": "\u6B64\u804A\u5929\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684 Loop \u5DE5\u4F5C\u3002",
      "collab.dialog.deliveryTitle": "\u6D88\u606F\u63A5\u6536\u8BB0\u5F55",
      "collab.dialog.deliveryEmpty": "\u5F53\u524D\u6CA1\u6709\u7B49\u5F85\u8FDB\u5165\u6B64\u804A\u5929\u7684 Loop \u5185\u5BB9\u3002",
      "collab.dialog.bindTitle": "\u9009\u62E9 Loop \u770B\u677F",
      "collab.dialog.bindBody": "\u65B0\u4EFB\u52A1\u4F1A\u653E\u5728\u8FD9\u4E2A\u770B\u677F\uFF0C\u5DF2\u6709\u4EFB\u52A1\u4FDD\u6301\u539F\u4F4D\u7F6E\u3002",
      "collab.dialog.chooseBoard": "\u4E3A\u65B0\u534F\u4F5C\u5DE5\u4F5C\u9009\u62E9\u770B\u677F\u3002",
      "collab.dialog.noBoards": "\u5F53\u524D\u6CA1\u6709\u53EF\u5199\u7684 Loop \u770B\u677F\u3002\u8BF7\u5148\u5728 Loop \u4E2D\u521B\u5EFA\u6216\u52A0\u5165\u770B\u677F\u3002",
      "collab.dialog.openLoop": "\u6253\u5F00 Loop",
      "collab.dialog.bind": "\u4F7F\u7528\u6B64\u770B\u677F",
      "collab.dialog.binding": "\u6B63\u5728\u8FDE\u63A5\u770B\u677F\u2026",
      "collab.dialog.shareTitle": "\u534F\u4F5C\u8005\u5C06\u6536\u5230\u4EC0\u4E48",
      "collab.dialog.shareTask": "\u4EC5\u4EFB\u52A1\u8BF4\u660E",
      "collab.dialog.shareSelected": "\u4EFB\u52A1\u8BF4\u660E\u548C\u5DF2\u9009\u8D44\u6599",
      "collab.dialog.shareDiscussion": "\u4EFB\u52A1\u8BA8\u8BBA",
      "collab.dialog.shareHint": "\u4E0D\u4F1A\u5206\u4EAB\u6B64\u804A\u5929\u7684\u5B8C\u6574\u5386\u53F2\u3002",
      "collab.dialog.shareFirst": "\u53D1\u9001\u524D\uFF0C\u8BF7\u786E\u8BA4\u63A5\u6536\u8005\u548C\u5206\u4EAB\u5185\u5BB9\u3002",
      "collab.dialog.shareConfirm": "\u786E\u8BA4\u8303\u56F4\u5E76\u53D1\u9001",
      "collab.dialog.discard": "\u53D6\u6D88\u5F85\u53D1\u9001\u7684\u534F\u4F5C",
      "collab.dialog.shareTargets": "{count} \u4E2A\u534F\u4F5C\u8005",
      "collab.dialog.shareResources": "{count} \u4EFD\u8D44\u6599",
      "collab.dialog.referenceTitle": "Loop \u534F\u4F5C\u8005",
      "collab.dialog.referenceBody": "\u53D1\u9001\u540E\uFF0CSuper Agent \u4F1A\u4E0E\u8FD9\u4F4D\u667A\u80FD\u4F53\u534F\u4F5C\u3002\u53D1\u9001\u524D\u53EF\u5220\u9664\u6B64\u5F15\u7528\u3002",
      "collab.dialog.referenceTypeAgent": "\u667A\u80FD\u4F53",
      "collab.dialog.referenceTypeHuman": "\u6210\u5458",
      "collab.dialog.connectionTitle": "\u8FDE\u63A5\u8BBE\u7F6E",
      "collab.dialog.connectionDistinction": "\u8FDE\u63A5\u4E00\u4E2A Loop \u667A\u80FD\u4F53\uFF0C\u8BA9 Super Agent \u4E3A\u4F60\u534F\u8C03\u4EFB\u52A1\u3002",
      "collab.dialog.boardSetupTitle": "\u4E3A\u6B64\u534F\u4F5C\u9009\u62E9\u4EFB\u52A1\u770B\u677F",
      "collab.dialog.boardSetupBody": "\u9009\u62E9\u4EFB\u52A1\u4FDD\u5B58\u7684\u4F4D\u7F6E\u3002",
      "collab.dialog.connectSignIn": "\u767B\u5F55\u5E76\u8FDE\u63A5 Loop",
      "collab.dialog.chooseBoardAction": "\u9009\u62E9 Loop \u770B\u677F",
      "collab.dialog.repairConnection": "\u4FEE\u590D Loop \u8FDE\u63A5",
      "collab.dialog.openConnection": "\u6253\u5F00 Loop \u8FDE\u63A5",
      "collab.dialog.retry": "\u518D\u6B21\u68C0\u67E5",
      "collab.dialog.reconcile": "\u6838\u5BF9\u5DE5\u4F5C\u72B6\u6001",
      "collab.dialog.reconciling": "\u6B63\u5728\u6838\u5BF9\u2026",
      "collab.dialog.task": "\u534F\u4F5C\u4EFB\u52A1",
      "collab.dialog.openTask": "\u6253\u5F00\u4EFB\u52A1",
      "collab.dialog.cancel": "\u53D6\u6D88\u5DE5\u4F5C",
      "collab.dialog.cancelling": "\u6B63\u5728\u8BF7\u6C42\u53D6\u6D88\u2026",
      "collab.dialog.answerInChat": "\u5728\u804A\u5929\u4E2D\u56DE\u7B54",
      "collab.dialog.answerNativeHint": "\u56DE\u5230\u804A\u5929\uFF0C\u76F4\u63A5\u56DE\u7B54\u5373\u53EF\u3002",
      "collab.dialog.followupNativeHint": "\u56DE\u5230\u804A\u5929\uFF0C\u7EE7\u7EED\u63D0\u51FA\u8981\u6C42\u5373\u53EF\u3002",
      "collab.dialog.retryContinuation": "\u91CD\u8BD5\u5173\u8054\u56DE\u590D",
      "collab.dialog.continuationBinding": "\u6B63\u5728\u5173\u8054\u56DE\u590D\u2026",
      "collab.dialog.continuationReady": "\u56DE\u590D\u5DF2\u5173\u8054\u5230 {count} \u4E2A\u4EFB\u52A1\u3002",
      "collab.dialog.reviewInChat": "\u5728\u804A\u5929\u4E2D\u9A8C\u6536",
      "collab.dialog.unknownResult": "\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5148\u6838\u5BF9\u518D\u91CD\u8BD5",
      "collab.state.recorded": "\u5DF2\u8BB0\u5F55",
      "collab.state.dispatching": "\u6B63\u5728\u6D3E\u53D1",
      "collab.state.accepted": "\u5DF2\u53D7\u7406",
      "collab.state.running": "\u8FD0\u884C\u4E2D",
      "collab.state.waiting": "\u7B49\u5F85\u4F60\u5904\u7406",
      "collab.state.succeeded": "\u7ED3\u679C\u53EF\u7528",
      "collab.state.completed": "\u5DF2\u5B8C\u6210",
      "collab.state.cancelRequested": "\u5DF2\u8BF7\u6C42\u53D6\u6D88",
      "collab.state.canceled": "\u5DF2\u53D6\u6D88",
      "collab.state.failed": "\u5931\u8D25",
      "collab.state.unreachable": "\u7ED3\u679C\u672A\u77E5",
      "collab.state.unknown": "\u672A\u77E5",
      "collab.delivery.pending": "\u7B49\u5F85\u6295\u9012",
      "collab.delivery.claimed": "Harness \u5DF2\u63A5\u6536",
      "collab.delivery.committed": "\u5DF2\u52A0\u5165\u6B64\u804A\u5929",
      "collab.delivery.canceled": "\u7528\u6237\u5DF2\u53D6\u6D88",
      "collab.delivery.needsAuth": "\u7B49\u5F85 Loop \u767B\u5F55",
      "collab.delivery.reconcile": "\u7B49\u5F85\u6838\u5BF9\u7ED3\u679C",
      "collab.delivery.revoked": "Loop \u6388\u6743\u5DF2\u64A4\u9500",
      "collab.delivery.retiredRoute": "\u4EC5\u4FDD\u7559\u539F\u4EFB\u52A1\u7684\u7ED3\u679C\u63A5\u6536",
      "collab.delivery.bindingConflict": "\u4EFB\u52A1\u8FDE\u63A5\u5DF2\u53D8\u5316",
      "collab.delivery.blocked": "\u6295\u9012\u53D7\u963B",
      "collab.delivery.undeliverable": "\u65E0\u6CD5\u6295\u9012",
      "collab.notice.connected": "\u5DF2\u4E3A\u6B64\u804A\u5929\u8FDE\u63A5 Loop \u770B\u677F\u3002",
      "collab.notice.shareConfirmed": "\u5DF2\u786E\u8BA4\u5206\u4EAB\u8303\u56F4\uFF0C\u539F\u6D88\u606F\u5C06\u7EE7\u7EED\u53D1\u9001\u3002",
      "collab.notice.intentDiscarded": "\u5DF2\u53D6\u6D88\u5F85\u53D1\u9001\u7684\u534F\u4F5C\u3002",
      "collab.notice.intentBound": "\u5DF2\u53D1\u9001\uFF0C\u63D0\u53CA\u4FE1\u606F\u5DF2\u9644\u52A0\u3002",
      "collab.notice.cancelPending": "\u53D6\u6D88\u64CD\u4F5C\u6B63\u5728\u7B49\u5F85 Loop \u8FDE\u63A5\u3002",
      "collab.notice.cancelRequested": "Loop \u5DF2\u6536\u5230\u53D6\u6D88\u8BF7\u6C42\uFF0C\u4F46\u5C1A\u672A\u786E\u8BA4\u505C\u6B62\u3002",
      "collab.notice.stopped": "Loop \u5DF2\u786E\u8BA4\u8FD0\u884C\u505C\u6B62\u3002",
      "collab.notice.notDispatched": "\u5DF2\u5728\u672C\u5730\u53D6\u6D88\uFF0C\u6CA1\u6709\u5411 Loop \u6D3E\u53D1\u5DE5\u4F5C\u3002",
      "collab.notice.alreadyTerminal": "Loop \u5DE5\u4F5C\u5DF2\u7ECF\u7ED3\u675F\uFF0C\u539F\u6709\u7ED3\u679C\u4FDD\u6301\u4E0D\u53D8\u3002",
      "collab.notice.cancelUnknown": "\u53D6\u6D88\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5148\u6838\u5BF9\u518D\u91CD\u8BD5\u3002",
      "collab.notice.reconciled": "\u5DF2\u6838\u5BF9\u7684 Loop \u5DE5\u4F5C\u72B6\u6001\u3002",
      "collab.notice.continuationLinked": "\u56DE\u590D\u5DF2\u5173\u8054\u5230\u4EFB\u52A1\u3002",
      "collab.notice.continuationNeedsTarget": "\u6709\u591A\u4E2A\u534F\u4F5C\u4EFB\u52A1\uFF0C\u7EE7\u7EED\u65F6\u8BF7\u8BF4\u660E\u4EFB\u52A1\u540D\u79F0\u3002",
      "collab.notice.continuationUnavailable": "\u8BF7\u66F4\u65B0 Loop \u63D2\u4EF6\u540E\u7EE7\u7EED\u6B64\u4EFB\u52A1\u3002",
      "collab.notice.continuationFailed": "\u56DE\u590D\u672A\u5173\u8054\u5230\u8FDB\u884C\u4E2D\u7684 Loop \u5DE5\u4F5C\uFF0C\u666E\u901A\u804A\u5929\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002",
      "collab.error.notBound": "\u63D0\u53CA\u534F\u4F5C\u8005\u524D\u8BF7\u5148\u9009\u62E9 Loop \u770B\u677F\u3002",
      "collab.error.humanDisabled": "\u8BF7\u9009\u62E9 Loop \u667A\u80FD\u4F53\uFF0C\u6682\u4E0D\u652F\u6301 @ \u4EBA\u7C7B\u6210\u5458\u3002",
      "collab.error.permission": "Loop \u672A\u6388\u6743\u672C\u6B21\u64CD\u4F5C\u3002\u8BF7\u68C0\u67E5\u52A9\u624B\u5728\u5F53\u524D\u5DE5\u4F5C\u533A\u7684\u6743\u9650\u3002",
      "collab.error.needsAccess": "\u8BE5\u534F\u4F5C\u8005\u53EF\u89C1\uFF0C\u4F46\u9700\u8981\u51C6\u5165\u6216\u5F53\u524D\u4E0D\u63A5\u53D7\u6B64\u64CD\u4F5C\u3002",
      "collab.error.auth": "\u4F7F\u7528\u534F\u4F5C\u8005\u524D\u8BF7\u5148\u767B\u5F55 Loop\u3002",
      "collab.error.bindingStale": "Loop \u770B\u677F\u6216\u6743\u9650\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5220\u9664\u5931\u6548\u5F15\u7528\u5E76\u91CD\u65B0\u9009\u62E9\u534F\u4F5C\u8005\u3002",
      "collab.error.intentExpired": "\u5C1A\u672A\u53D1\u9001\u7684 Loop \u5F15\u7528\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u534F\u4F5C\u8005\u3002",
      "collab.error.intentConflict": "\u6D88\u606F\u5DF2\u5173\u8054\u5230\u5176\u4ED6\u4EFB\u52A1\uFF0C\u8BF7\u68C0\u67E5\u540E\u91CD\u8BD5\u3002",
      "collab.error.payloadMismatch": "\u6D88\u606F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u534F\u4F5C\u8005\u540E\u53D1\u9001\u3002",
      "collab.error.unsupported": "\u6B64\u667A\u80FD\u4F53\u6682\u4E0D\u652F\u6301\u534F\u4F5C\u3002",
      "collab.error.bindFailed": "\u65E0\u6CD5\u4F7F\u7528\u6B64\u770B\u677F\uFF1A\u6240\u9009\u770B\u677F\u6216\u5173\u8054\u667A\u80FD\u4F53\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u770B\u677F\u540E\u518D\u9009\u62E9\u3002",
      "collab.error.resultUnknown": "\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5148\u4E0E Loop \u6838\u5BF9\u518D\u91CD\u8BD5\u3002",
      "collab.error.queue": "Loop \u6295\u9012\u6216\u64CD\u4F5C\u961F\u5217\u5DF2\u6EE1\uFF0C\u8BF7\u7B49\u5F85\u73B0\u6709\u5DE5\u4F5C\u7ED3\u675F\u3002",
      "collab.error.storage": "\u672C\u5730 Loop \u6295\u9012\u5B58\u50A8\u5DF2\u6EE1\uFF0C\u8BF7\u91CA\u653E\u7A7A\u95F4\u540E\u91CD\u8BD5\u3002",
      "collab.error.offline": "Loop \u5F53\u524D\u79BB\u7EBF\uFF0C\u64CD\u4F5C\u672A\u83B7\u786E\u8BA4\u3002",
      "collab.error.session": "\u6B64\u4F1A\u8BDD\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u540E\u91CD\u8BD5\u3002",
      "collab.error.internal": "Loop \u534F\u4F5C\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
      "collab.worksite.title": "\u4ECE Loop \u7F51\u9875\u8BBF\u95EE\u6B64\u8BBE\u5907",
      "collab.worksite.stopped": "\u8FDC\u7A0B\u8BBF\u95EE\u672A\u542F\u52A8\u3002",
      "collab.worksite.connecting": "\u6B63\u5728\u8FDE\u63A5\u8FDC\u7A0B\u8BBF\u95EE\u2026",
      "collab.worksite.connected": "\u6B64\u8BBE\u5907\u7684\u8FDC\u7A0B\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D\u5DF2\u8FDE\u63A5\u3002",
      "collab.worksite.needsEnable": "\u5982\u9700\u4ECE Loop \u7F51\u9875\u8BBF\u95EE\u6B64\u8BBE\u5907\uFF0C\u8BF7\u5728\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D\u4E2D\u542F\u7528\u3002",
      "collab.worksite.registrationConflict": "\u6B64\u5B89\u88C5\u5C5E\u4E8E\u53E6\u4E00\u4E2A Loop \u8D26\u53F7\u3002\u8BF7\u5148\u7528\u539F\u8D26\u53F7\u65AD\u5F00\u8FDE\u63A5\u3002",
      "collab.worksite.stateChanged": "\u8BBE\u5907\u8FDE\u63A5\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5728\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D\u4E2D\u5237\u65B0\u3002",
      "collab.worksite.blocked": "\u8FDC\u7A0B\u8BBF\u95EE\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5728\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D\u4E2D\u68C0\u67E5\u8BBE\u5907\u3002",
      "collab.worksite.offline": "\u8BBE\u5907\u6682\u65F6\u79BB\u7EBF\uFF0C\u6B63\u5728\u91CD\u8FDE\u3002",
      "collab.worksite.openStartWork": "\u6253\u5F00 Loop\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D",
      "collab.worksite.openFailed": "\u65E0\u6CD5\u6253\u5F00 Loop\u201C\u5F00\u59CB\u5DE5\u4F5C\u201D\uFF0C\u8BF7\u68C0\u67E5 Loop \u670D\u52A1\u4E0E Workspace \u8FDE\u63A5\u3002"
    };
    var zhTW = {
      ...zh,
      "module.inbox": "\u6536\u4EF6\u7BB1",
      "module.contacts": "\u901A\u8A0A\u9304",
      "module.tasks": "\u4EFB\u52D9",
      "module.projects": "\u5C08\u6848",
      "module.workflows": "\u5DE5\u4F5C\u6D41",
      "module.knowledge": "\u77E5\u8B58\u5EAB",
      "module.drive": "\u96F2\u7AEF\u786C\u789F",
      "module.dataspaces": "\u8CC7\u6599\u7A7A\u9593",
      "module.capabilities": "\u5C08\u5BB6 \xB7 \u6280\u80FD",
      "module.connectors": "\u9023\u63A5\u5668",
      "human.title": "\u4EE5\u6211\u7684\u540D\u7FA9\u8FA6\u7406",
      "human.pickProject": "\u5728 Loop \u9078\u64C7\u5C08\u6848",
      "human.pickKB": "\u5728 Loop \u9078\u64C7\u77E5\u8B58\u5EAB",
      "human.pasteLink": "\u8CBC\u4E0A\u6240\u9078\u8CC7\u6E90\u7684\u9023\u7D50",
      "human.shareLink": "\u4F7F\u7528\u6B64\u8CC7\u6E90",
      "human.invalidLink": "\u8ACB\u9078\u64C7\u76EE\u524D\u5DE5\u4F5C\u5340\u7684\u8CC7\u6E90\u9023\u7D50\u3002",
      "human.agentDenied": "\u52A9\u624B\u7684\u6B0A\u9650\u4E0D\u8DB3\uFF0C\u7E7C\u7E8C\u8FA6\u7406\u9019\u4E00\u6B65\u9700\u8981\u4F60\u6388\u6B0A\u3002",
      "human.all": "\u6B64\u5DE5\u4F5C\u5340\u5167\u4F60\u53EF\u5B58\u53D6\u7684\u6240\u6709\u8CC7\u6E90",
      "human.reusable": "\u6388\u6B0A\u53EF\u91CD\u8907\u4F7F\u7528\u3002Loop \u5C07\u5728\u78BA\u8A8D\u524D\u986F\u793A\u5230\u671F\u6642\u9593\uFF0C\u4E26\u53EF\u96A8\u6642\u5728 Loop \u5E33\u865F\u8A2D\u5B9A\u4E2D\u64A4\u92B7\u3002",
      "human.expires": "\u6388\u6B0A\u53EF\u91CD\u8907\u4F7F\u7528\uFF0C\u6709\u6548\u81F3 {date}\uFF0C\u53EF\u5728 Loop \u5E33\u865F\u8A2D\u5B9A\u4E2D\u64A4\u92B7\u3002",
      "human.open": "\u524D\u5F80 Loop \u78BA\u8A8D",
      "human.reuse": "\u4F7F\u7528\u73FE\u6709\u6388\u6B0A",
      "human.cancel": "\u53D6\u6D88",
      "human.manage": "\u5305\u542B\u7BA1\u7406\u6B0A\u9650",
      "human.failed": "\u8ACB\u8FD4\u56DE\u539F\u5C0D\u8A71\u518D\u8A66\u4E00\u6B21\u3002",
      "collab.management.active": "\u7BA1\u7406\u59D4\u8A17\uFF1A\u6709\u6548",
      "collab.management.unavailable": "\u7BA1\u7406\u59D4\u8A17\uFF1A\u7121\u6CD5\u4F7F\u7528",
      "collab.management.closed": "\u7BA1\u7406\u59D4\u8A17\uFF1A\u5DF2\u7D50\u675F",
      "collab.task.todo": "\u4EFB\u52D9\uFF1A\u5F85\u8FA6",
      "collab.task.inProgress": "\u4EFB\u52D9\uFF1A\u9032\u884C\u4E2D",
      "collab.task.inReview": "\u4EFB\u52D9\uFF1A\u5F85\u9A57\u6536",
      "collab.task.done": "\u4EFB\u52D9\uFF1A\u5DF2\u5B8C\u6210",
      "collab.task.unavailable": "\u4EFB\u52D9\u7121\u6CD5\u5B58\u53D6",
      "collab.task.accepted": "\u64CD\u4F5C\u5DF2\u53D7\u7406",
      "collab.task.execution": "\u57F7\u884C\uFF1A{status}",
      "collab.task.deliveryGap": "\u90E8\u5206\u8F03\u65E9\u7684\u4EFB\u52D9\u8A0A\u606F\u5DF2\u904E\u671F\u3002\u8ACB\u5728 Loop \u4E2D\u67E5\u770B\u4EFB\u52D9\u3002",
      "login.title": "Loop \u5E33\u865F",
      "login.personalPage": "\u52A9\u7406\u5DF2\u9023\u7DDA\u3002\u6388\u6B0A\u6B64\u88DD\u7F6E\u5F8C\uFF0C\u5373\u53EF\u5728\u9019\u88E1\u958B\u555F\u4F60\u7684 Loop \u500B\u4EBA\u9801\u9762\u3002",
      "login.authorizePages": "\u6388\u6B0A\u500B\u4EBA\u9801\u9762",
      "login.method": "\u767B\u5165\u65B9\u5F0F",
      "login.browser": "\u700F\u89BD\u5668\u767B\u5165",
      "login.tokenHint": "\u4F7F\u7528 Loop \u8A2D\u5B9A\u4E2D\u9810\u8A2D\u500B\u4EBA\u52A9\u624B\u7C3D\u767C\u7684 DSH \u6B0A\u6756\u3002\u958B\u555F\u500B\u4EBA Loop \u9801\u9762\u9700\u8981\u700F\u89BD\u5668\u767B\u5165\u3002",
      "login.description": "\u9078\u64C7 Loop \u4F3A\u670D\u5668\uFF0C\u767B\u5165\u5F8C\u5373\u53EF\u9023\u63A5\u6B64\u88DD\u7F6E\u3002",
      "login.rememberServer": "\u9023\u63A5\u6210\u529F\u5F8C\uFF0C\u6B64\u88DD\u7F6E\u6703\u8A18\u4F4F\u4F3A\u670D\u5668\u4F4D\u5740\u3002",
      "login.checking": "\u6B63\u5728\u6AA2\u67E5\u767B\u5165\u72C0\u614B\u2026",
      "login.signedIn": "\u5DF2\u767B\u5165",
      "login.signedOut": "\u5C1A\u672A\u767B\u5165",
      "login.expired": "\u767B\u5165\u5DF2\u904E\u671F\uFF0C\u8ACB\u91CD\u65B0\u767B\u5165",
      "login.statusUnavailable": "\u66AB\u6642\u7121\u6CD5\u53D6\u5F97\u767B\u5165\u72C0\u614B",
      "login.signingIn": "\u6B63\u5728\u767B\u5165",
      "login.signingOut": "\u6B63\u5728\u767B\u51FA",
      "login.logout": "\u767B\u51FA",
      "login.logoutHint": "\u767B\u51FA\u5F8C\uFF0C\u6B64\u88DD\u7F6E\u5C07\u4E2D\u65B7 Loop \u6A21\u578B\u3001Agent \u548C\u5C0D\u8A71\u540C\u6B65\u9023\u7DDA\uFF0C\u5DF2\u6709\u5C0D\u8A71\u4FDD\u7559\u3002",
      "login.logoutPending": "\u8ACB\u524D\u5F80 Loop \u5B8C\u6210\u767B\u51FA\u78BA\u8A8D\u3002\u9023\u63A5\u5931\u6557\u6642\u53EF\u91CD\u8A66\u3002",
      "settings.disconnect": "\u767B\u51FA Loop",
      "settings.disconnectFinish": "\u5B8C\u6210\u767B\u51FA",
      "settings.disconnectConfirm": "\u524D\u5F80 Loop \u78BA\u8A8D\u767B\u51FA",
      "settings.disconnectCheck": "\u6AA2\u67E5\u767B\u51FA\u7D50\u679C",
      "settings.disconnectPending": "\u5DF2\u505C\u6B62\u4E0A\u50B3\uFF0C\u8ACB\u5B8C\u6210\u767B\u51FA\u4EE5\u4E2D\u65B7\u6B64\u88DD\u7F6E\u7684\u9023\u7DDA\u3002",
      "settings.disconnectDescription": "\u4E2D\u65B7\u76EE\u524D Loop \u9023\u7DDA\u7684\u4E0A\u50B3\u3001\u667A\u6167\u9AD4\u548C\u6A21\u578B\u6388\u6B0A\uFF0C\u804A\u5929\u8A18\u9304\u6703\u4FDD\u7559\u3002",
      "error.credentialUnavailable": "\u7121\u6CD5\u8B80\u53D6\u672C\u6A5F\u5132\u5B58\u7684 Loop \u767B\u5165\u6191\u8B49\u3002\u8ACB\u6062\u5FA9\u6191\u8B49\u5B58\u53D6\u5F8C\u91CD\u65B0\u9023\u7DDA\uFF0C\u672C\u6A5F\u804A\u5929\u4ECD\u53EF\u4F7F\u7528\u3002",
      "settings.uploadConnected": "\u5DF2\u9023\u7DDA\uFF0C\u804A\u5929\u8A18\u9304\u6703\u81EA\u52D5\u4E0A\u50B3\u3002",
      "launcher.loopNeedsConnection": "\u5B8C\u6210 Loop \u9023\u7DDA",
      "upload.label": "Loop \u4E0A\u50B3\u72C0\u614B",
      "upload.uploading": "\u6B63\u5728\u4E0A\u50B3\u4E2D",
      "upload.uploaded": "\u5DF2\u4E0A\u50B3",
      "upload.failed": "\u4E0A\u50B3\u5931\u6557",
      "upload.off": "\u5C1A\u672A\u767B\u5165 Loop",
      "collab.dialog.task": "\u5354\u4F5C\u4EFB\u52D9",
      "collab.candidate.delegate": "\u53EF\u4F5C\u70BA\u4EFB\u52D9\u4EBA\u9078",
      "collab.candidate.notify": "\u53EF\u63D0\u53CA",
      "collab.candidate.needsAccess": "\u53EF\u63D0\u53CA \xB7 \u6307\u6D3E\u4EFB\u52D9\u9700\u8981\u6B0A\u9650",
      "collab.error.humanDisabled": "\u6B64\u8F38\u5165\u6846\u50C5\u652F\u63F4 Loop \u667A\u6167\u9AD4\u3002\u8ACB\u79FB\u9664\u820A\u7684\u4EBA\u985E\u5F15\u7528\u4E26\u91CD\u65B0\u9078\u64C7 Loop \u667A\u6167\u9AD4\u3002",
      "slash.loopSkills": "Loop \xB7 \u6280\u80FD",
      "slash.loopKnowledge": "Loop \xB7 \u77E5\u8B58\u5EAB",
      "knowledge.error.unavailable": "Loop \u77E5\u8B58\u5EAB\u66AB\u4E0D\u53EF\u7528\u3002\u8ACB\u6AA2\u67E5\u9023\u7DDA\u8207\u5B58\u53D6\u6B0A\u9650\uFF0C\u518D\u958B\u555F / \u91CD\u65B0\u9078\u64C7\u3002",
      "error.loopSkills": "Loop \u6280\u80FD\u8F09\u5165\u5931\u6557\uFF0C\u8ACB\u91CD\u65B0\u9078\u64C7\u3002",
      "skill.error.auth": "\u4F7F\u7528 Loop \u6280\u80FD\u524D\u8ACB\u5148\u767B\u5165 Loop\u3002",
      "skill.error.hostUpdate": "\u8ACB\u66F4\u65B0 Loop \u5916\u639B\u5F8C\u4F7F\u7528\u6280\u80FD\u3002",
      "skill.error.session": "\u8ACB\u5148\u5F9E\u6B64 Session \u6240\u5728\u7684 Loop \u5DE5\u4F5C\u5340\u958B\u555F Loop \u6280\u80FD\u3002",
      "skill.error.reference": "\u6B64 Loop \u6280\u80FD\u9078\u64C7\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u9078\u64C7\u3002",
      "skill.error.path": "\u6B64 Loop \u6280\u80FD\u8DEF\u5F91\u4E0D\u53D7\u652F\u63F4\uFF0C\u8ACB\u91CD\u65B0\u9078\u64C7\u6280\u80FD\u3002",
      "skill.error.offline": "Loop \u76EE\u524D\u7121\u6CD5\u4F7F\u7528\uFF0C\u8349\u7A3F\u672A\u8B8A\u66F4\u3002",
      "skill.error.busy": "Loop \u6280\u80FD\u66F4\u65B0\u66AB\u6642\u53D7\u9650\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002",
      "skill.error.cancelled": "Loop \u6280\u80FD\u8F09\u5165\u5DF2\u53D6\u6D88\u3002",
      "skill.error.bindingStale": "\u6B64 Loop \u6280\u80FD\u7248\u672C\u5DF2\u8B8A\u66F4\u6216\u4E0D\u518D\u53D7\u6B0A\uFF0C\u8ACB\u91CD\u65B0\u9078\u64C7\u3002",
      "skill.error.tooLarge": "\u6B64 Loop \u6280\u80FD\u904E\u5927\uFF0C\u7121\u6CD5\u5B89\u5168\u8F09\u5165\u3002",
      "skill.error.unavailable": "\u6B64 Loop \u6280\u80FD\u76EE\u524D\u7121\u6CD5\u4F7F\u7528\uFF0C\u8ACB\u91CD\u65B0\u9078\u64C7\u3002",
      "launcher.loopAccount": "Loop \u5E33\u865F",
      "launcher.feedback": "\u610F\u898B\u56DE\u994B",
      "launcher.signIn": "\u767B\u5165",
      "launcher.loopConnected": "\u5DF2\u767B\u5165 Loop",
      "launcher.loopConnecting": "\u6B63\u5728\u9023\u7DDA Loop",
      "launcher.loopNeedsSetup": "\u5C1A\u672A\u767B\u5165 Loop",
      "launcher.loopNeedsAttention": "Loop \u9023\u7DDA\u4E2D\u65B7",
      "launcher.connectLoop": "\u767B\u5165 Loop",
      "launcher.modelSelected": "\u672C\u6B21\u5C0D\u8A71\uFF1A{model}",
      "launcher.modelSessionDefault": "\u672C\u6B21\u5C0D\u8A71\u9810\u8A2D\uFF1A{model}",
      "launcher.modelSelectedUnavailable": "\u6A21\u578B\u7121\u6CD5\u4F7F\u7528\uFF1A{model}",
      "launcher.modelNewSessionDefault": "\u65B0\u5C0D\u8A71\u9810\u8A2D\uFF1A{model}",
      "launcher.modelNewSessionDefaultUnavailable": "\u9810\u8A2D\u6A21\u578B\u7121\u6CD5\u4F7F\u7528\uFF1A{model}",
      "launcher.modelLoading": "\u67E5\u770B\u6A21\u578B\u8A2D\u5B9A",
      "launcher.modelUnavailable": "\u6A21\u578B\u7121\u6CD5\u4F7F\u7528\uFF0C\u958B\u555F\u8A2D\u5B9A",
      "launcher.modelSourceExternal": "\u5916\u90E8\u4F9B\u61C9\u5546",
      "launcher.modelSourceUnknown": "\u4F86\u6E90\u5F85\u78BA\u8A8D",
      "launcher.modelBillingPersonal": "\u500B\u4EBA\u4F9B\u61C9\u5546\u8A08\u8CBB",
      "launcher.modelBillingOrganization": "\u7D44\u7E54\u6A21\u578B\u6B0A\u9650",
      "launcher.modelBillingLoopHosted": "Loop \u8A17\u7BA1\u7528\u91CF",
      "launcher.modelBillingProvider": "\u4F9B\u61C9\u5546\u8A08\u8CBB",
      "launcher.modelBillingUnknown": "\u8CBB\u7528\u4F86\u6E90\u5F85\u78BA\u8A8D",
      "launcher.settings": "\u8A2D\u5B9A",
      "onboarding.loginLoop": "\u767B\u5165 Loop",
      "onboarding.openKeySettings": "\u8F38\u5165 API Key",
      "onboarding.authorizeModels": "\u9023\u63A5 Loop \u6A21\u578B",
      "onboarding.openModelsAuth": "\u524D\u5F80\u6388\u6B0A",
      "onboarding.continueModels": "\u6211\u5DF2\u6388\u6B0A\uFF0C\u7E7C\u7E8C",
      "onboarding.configureLoop": "\u8A2D\u5B9A Loop \u4F3A\u670D\u5668",
      "onboarding.resume": "\u7E7C\u7E8C Loop \u8A2D\u5B9A",
      "onboarding.cancelledBody": "Loop \u8A2D\u5B9A\u5C1A\u672A\u5B8C\u6210\u3002\u6E96\u5099\u597D\u5F8C\u53EF\u4EE5\u7E7C\u7E8C\uFF0C\u4E5F\u53EF\u4EE5\u4F7F\u7528 Harness \u73FE\u6709\u6A21\u578B\u8A2D\u5B9A\u4E2D\u7684\u771F\u5BE6 API Key\u3002",
      "onboarding.workspaceTitle": "\u767B\u5165 Loop",
      "onboarding.workspaceBody": "\u767B\u5165\u5F8C\u9078\u64C7\u5DE5\u4F5C\u5340\uFF0C\u5373\u53EF\u7E7C\u7E8C\u3002",
      "onboarding.modelsTitle": "\u6388\u6B0A Loop \u6A21\u578B",
      "onboarding.modelsBody": "\u9023\u63A5 Loop \u6A21\u578B\u5F8C\uFF0C\u9078\u64C7\u8981\u4F7F\u7528\u7684\u6A21\u578B\u3002",
      "onboarding.openLoopPage": "\u958B\u555F Loop \u6AA2\u67E5",
      "onboarding.continueSetup": "\u7E7C\u7E8C\u8A2D\u5B9A",
      "onboarding.checkingModels": "\u6B63\u5728\u6AA2\u67E5\u6A21\u578B\u2026",
      "onboarding.recoverLogin": "\u6062\u5FA9\u767B\u5165",
      "error.credentialRecoveryDisabled": "\u555F\u52D5\u5668\u7981\u6B62\u7CFB\u7D71\u6388\u6B0A\u8996\u7A97\u3002\u8ACB\u79FB\u9664 LOOP_KEYCHAIN_NO_UI \u8A2D\u5B9A\u4E26\u91CD\u65B0\u555F\u52D5\uFF0C\u518D\u6062\u5FA9\u767B\u5165\u3002",
      "onboarding.recoveringLogin": "\u8ACB\u5728\u7CFB\u7D71\u8996\u7A97\u4E2D\u6388\u6B0A\u5B58\u53D6\u6191\u8B49\u3002\u9078\u64C7\u300C\u6C38\u9060\u5141\u8A31\u300D\uFF0C\u91CD\u65B0\u555F\u52D5\u5F8C\u5373\u53EF\u7E7C\u7E8C\u4F7F\u7528\u3002",
      "onboarding.retryModels": "\u91CD\u65B0\u6AA2\u67E5",
      "onboarding.stopWaiting": "\u53D6\u6D88\u6388\u6B0A",
      "onboarding.modelNeedsAuth": "\u8ACB\u5141\u8A31 Super Agent \u4F7F\u7528\u4F60\u7684 Loop \u6A21\u578B\u3002",
      "onboarding.modelRateLimited": "Loop \u76EE\u524D\u6536\u5230\u7684\u6A21\u578B\u8ACB\u6C42\u904E\u591A\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002",
      "onboarding.noModels": "\u5C1A\u7121\u53EF\u7528\u6A21\u578B\u3002\u8ACB\u5728 Loop \u6AA2\u67E5\u6A21\u578B\u8A2D\u5B9A\u3001\u6B0A\u9650\u6216\u9918\u984D\u3002",
      "onboarding.catalogUnavailable": "\u66AB\u6642\u7121\u6CD5\u8B80\u53D6\u6A21\u578B\uFF0C\u8ACB\u91CD\u8A66\u3002",
      "onboarding.routeMissing": "\u6A21\u578B\u9023\u7DDA\u5C1A\u672A\u5C31\u7DD2\uFF0C\u8ACB\u91CD\u65B0\u6AA2\u67E5\u3002",
      "onboarding.selectionRequired": "\u8ACB\u9078\u64C7\u8981\u4F7F\u7528\u7684\u6A21\u578B\u3002",
      "onboarding.scopeRequired": "\u8ACB\u5148\u767B\u5165 Loop \u4E26\u9078\u64C7\u5DE5\u4F5C\u5340\u3002",
      "onboarding.chooseModelHint": "\u53EF\u5728\u5C0D\u8A71\u8F38\u5165\u6846\u65C1\u96A8\u6642\u5207\u63DB\u3002",
      "onboarding.chooseModel": "\u9078\u64C7\u6A21\u578B",
      "onboarding.useModel": "\u4F7F\u7528\u6B64\u6A21\u578B",
      "onboarding.savingModel": "\u6B63\u5728\u5132\u5B58\u6A21\u578B\u9078\u64C7\u2026",
      "onboarding.selectionSaveFailed": "\u6A21\u578B\u9078\u64C7\u672A\u5132\u5B58\uFF0C\u8ACB\u91CD\u8A66\u3002",
      "onboarding.selectionSaveUnknown": "\u5C1A\u672A\u78BA\u8A8D\u5132\u5B58\uFF0C\u8ACB\u518D\u9078\u4E00\u6B21\u3002",
      "onboarding.modelError": "\u6A21\u578B\u9023\u7DDA\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66\u6216\u4F7F\u7528 API Key\u3002",
      "onboarding.externalReady": "API Key \u6A21\u578B\u5DF2\u5C31\u7DD2\u3002",
      "onboarding.keyTitle": "\u5B8C\u6210\u6A21\u578B\u8A2D\u5B9A",
      "onboarding.keyBody": "\u5728\u300C\u8A2D\u5B9A \u2192 \u6A21\u578B\u300D\u65B0\u589E API Key\uFF0C\u7136\u5F8C\u9078\u64C7\u6A21\u578B\u3002",
      "onboarding.returnLoop": "\u6539\u7528 Loop \u767B\u5165",
      "onboarding.apiKeyHint": "API Key \u7531 Harness \u73FE\u6709\u6A21\u578B\u8A2D\u5B9A\u5132\u5B58\u3002\u767B\u5165 Loop \u4E0D\u6703\u53D6\u4EE3\u6216\u522A\u9664\u65E2\u6709 Key\u3002",
      "onboarding.loopConnecting": "\u6B63\u5728\u6AA2\u67E5 Loop \u9023\u7DDA\u2026",
      "onboarding.loopReady": "Loop \u5DF2\u9023\u7DDA\uFF0C\u6A21\u578B\u53EF\u7528\u3002",
      "onboarding.loopConnectedModelPending": "Loop \u5DF2\u9023\u7DDA\uFF0C\u4F46\u5C1A\u672A\u53D6\u5F97\u53EF\u7528\u6A21\u578B\u3002\u8ACB\u5148\u5728 Loop \u5B8C\u6210\u6A21\u578B\u8A2D\u5B9A\uFF0C\u6216\u4F7F\u7528 API Key\u3002",
      "onboarding.loopNeedsServer": "\u8ACB\u5148\u8A2D\u5B9A Loop \u4F3A\u670D\u5668\uFF0C\u7136\u5F8C\u767B\u5165\u7E7C\u7E8C\u3002",
      "onboarding.loopNeedsAttention": "Loop \u5C1A\u672A\u9023\u7DDA\u3002\u8ACB\u91CD\u8A66\uFF0C\u6216\u4F7F\u7528 API Key\u3002",
      "onboarding.loopUnavailable": "\u7121\u6CD5\u8B80\u53D6 Loop \u9023\u7DDA\uFF0C\u8ACB\u91CD\u8A66\u5F8C\u518D\u767B\u5165\u3002",
      "settings.title": "Loop",
      "settings.uploadDisconnectedHistory": "\u4E0A\u50B3\u672A\u767B\u5165\u671F\u9593\u7684\u804A\u5929",
      "settings.uploadDisconnectedHistoryHint": "\u9810\u8A2D\u95DC\u9589\u3002\u95DC\u9589\u6642\uFF0C\u53EA\u4E0A\u50B3\u767B\u5165 Loop \u671F\u9593\u6536\u5230\u7684\u65B0\u8A0A\u606F\uFF1B\u958B\u555F\u5F8C\uFF0C\u767B\u5165\u6642\u4E5F\u6703\u88DC\u50B3\u53EF\u5B58\u53D6\u7684\u804A\u5929\u6B77\u53F2\u3002",
      "settings.uploadPreferencesError": "\u7121\u6CD5\u8B80\u53D6\u6216\u5132\u5B58\u4E0A\u50B3\u8A2D\u5B9A\uFF0C\u8ACB\u91CD\u8A66\u3002",
      "settings.description": "\u767B\u5165\u4E00\u6B21\uFF0C\u81EA\u52D5\u9023\u7DDA Loop \u4E26\u8A2D\u5B9A\u53EF\u7528\u6A21\u578B\u3002",
      "settings.serverTitle": "Loop \u4F3A\u670D\u5668",
      "settings.serverDescription": "\u6240\u6709 Loop \u6A21\u7D44\u548C\u540C\u6B65\u5C08\u6848\u5171\u7528\u6B64\u4F3A\u670D\u5668\u9023\u7DDA\u3002",
      "settings.serverConnected": "Loop \u4F3A\u670D\u5668\u5DF2\u9023\u7DDA\u3002",
      "settings.account": "\u5E33\u865F",
      "settings.modelsTitle": "Loop \u6A21\u578B",
      "settings.modelsDescription": "\u5728 Harness \u4E2D\u4F7F\u7528\u76EE\u524D Loop \u5E33\u865F\u53EF\u7528\u7684\u500B\u4EBA\u3001\u7D44\u7E54\u53CA Loop \u8A17\u7BA1\u6A21\u578B\u3002\u6388\u6B0A\u6703\u5728\u700F\u89BD\u5668\u4E2D\u5B8C\u6210\uFF0C\u6A21\u578B\u6191\u8B49\u53EA\u4FDD\u5B58\u5728 Loop \u4F3A\u670D\u5668\u3002",
      "settings.modelsLoading": "\u6B63\u5728\u8F09\u5165 Loop \u6A21\u578B\u2026",
      "settings.currentSessionModel": "\u76EE\u524D\u5DE5\u4F5C\u968E\u6BB5\u9078\u64C7",
      "settings.currentSessionDefaultModel": "\u76EE\u524D\u5DE5\u4F5C\u968E\u6BB5\u4F7F\u7528\u65B0\u5DE5\u4F5C\u968E\u6BB5\u9810\u8A2D\u6A21\u578B",
      "settings.newSessionDefaultModel": "\u65B0\u5DE5\u4F5C\u968E\u6BB5\u9810\u8A2D\u6A21\u578B",
      "settings.currentModelUnavailable": "\u76EE\u524D\u9078\u53D6\u7684\u6A21\u578B\u6216\u5176\u8CBB\u7528\u4F86\u6E90\u4E0D\u53EF\u7528\u3002\u958B\u59CB\u5DE5\u4F5C\u524D\u8ACB\u9078\u64C7\u6709\u6548\u6A21\u578B\u3002",
      "settings.currentModelHint": "\u9019\u88E1\u986F\u793A\u76EE\u524D\u5BE6\u969B\u9078\u64C7\u3002\u9023\u7DDA\u8B8A\u66F4\u6642 Harness \u4E0D\u6703\u81EA\u52D5\u5207\u63DB\u6A21\u578B\u3002",
      "settings.modelsCount": "{count} \u500B\u53EF\u7528\u6A21\u578B",
      "settings.modelsNoneAvailable": "\u6C92\u6709\u50B3\u56DE\u53EF\u7528\u6A21\u578B\u3002\u8ACB\u78BA\u8A8D\u6B64\u5E33\u865F\u6709\u5DF2\u9A57\u8B49\u7684\u500B\u4EBA\u6A21\u578B\u8A2D\u5B9A\u3001\u7D44\u7E54\u6A21\u578B\u6B0A\u9650\uFF0C\u6216\u53EF\u7528\u7684 Loop \u8A17\u7BA1\u6A21\u578B\u8207\u9918\u984D\uFF0C\u7136\u5F8C\u91CD\u65B0\u6574\u7406\u3002",
      "settings.modelsEmptyTitle": "\u5728 Harness \u4E2D\u4F7F\u7528 Loop \u6A21\u578B\u670D\u52D9",
      "settings.modelsEmptyBody": "\u9023\u7DDA Loop \u5E33\u865F\u5F8C\uFF0C\u500B\u4EBA\u3001\u7D44\u7E54\u53CA Loop \u8A17\u7BA1\u6A21\u578B\u6703\u986F\u793A\u5728 Harness \u6A21\u578B\u9078\u64C7\u5668\u4E2D\u3002",
      "settings.modelsAuthTitle": "\u6388\u6B0A Loop \u6A21\u578B",
      "settings.modelsAuthBody": "\u8ACB\u5728\u700F\u89BD\u5668\u4E2D\u78BA\u8A8D\u6388\u6B0A\u3002\u62D2\u7D55\u6216\u903E\u6642\u4E0D\u6703\u5F71\u97FF\u65E2\u6709\u9023\u7DDA\uFF0C\u60A8\u53EF\u4EE5\u96A8\u6642\u91CD\u8A66\u3002",
      "settings.modelsAuthOpen": "\u958B\u555F\u700F\u89BD\u5668\u6388\u6B0A",
      "settings.modelsAuthContinue": "\u5B8C\u6210\u6388\u6B0A\u5F8C\u7E7C\u7E8C",
      "settings.modelsChecking": "\u6B63\u5728\u78BA\u8A8D\u6388\u6B0A\u2026",
      "settings.modelsDisconnect": "\u4E2D\u65B7\u9023\u7DDA",
      "settings.modelsDisconnecting": "\u6B63\u5728\u4E2D\u65B7\u9023\u7DDA\u2026",
      "settings.modelsConnect": "\u9023\u7DDA Loop \u6A21\u578B",
      "settings.modelsConnectAnother": "\u9023\u7DDA\u66F4\u591A Loop \u6A21\u578B",
      "settings.modelsAuthorizing": "\u6B63\u5728\u767C\u8D77\u6388\u6B0A\u2026",
      "settings.modelsRefresh": "\u91CD\u65B0\u6574\u7406\u6A21\u578B",
      "settings.modelsRefreshing": "\u6B63\u5728\u91CD\u65B0\u6574\u7406\u2026",
      "settings.modelsSourcePersonal": "\u500B\u4EBA",
      "settings.modelsSourceOrganization": "\u7D44\u7E54",
      "settings.modelsSourceLoopHosted": "Loop \u8A17\u7BA1",
      "settings.modelsPickerHint": "\u53EF\u5728\u804A\u5929\u8F38\u5165\u6846\u65C1\u66F4\u63DB\u5DF2\u9078\u6A21\u578B\u3002",
      "settings.modelsUnavailable": "Loop \u6A21\u578B\u66AB\u6642\u4E0D\u53EF\u7528\u3002\u8ACB\u6AA2\u67E5 Loop \u9023\u7DDA\u5F8C\u91CD\u8A66\u3002",
      "settings.modelsReconnectRequired": "\u6B64\u9023\u7DDA\u9700\u8981\u91CD\u65B0\u6388\u6B0A\u3002\u8ACB\u9078\u64C7\u300C\u9023\u7DDA\u66F4\u591A Loop \u6A21\u578B\u300D\u91CD\u65B0\u9023\u7DDA\uFF0C\u6216\u4E2D\u65B7\u6B64\u689D\u9023\u7DDA\u3002",
      "settings.modelsAuthRequired": "\u8ACB\u5148\u5728\u700F\u89BD\u5668\u5B8C\u6210\u6388\u6B0A\uFF0C\u518D\u7E7C\u7E8C\u3002\u82E5\u6388\u6B0A\u5DF2\u904E\u671F\uFF0C\u8ACB\u91CD\u65B0\u9023\u7DDA\u3002",
      "settings.modelsRateLimited": "Loop \u76EE\u524D\u6536\u5230\u7684\u6A21\u578B\u8ACB\u6C42\u904E\u591A\u3002\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002",
      "settings.modelsFailed": "Loop \u6A21\u578B\u66F4\u65B0\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66\u3002",
      "settings.syncTitle": "\u804A\u5929\u8A18\u9304\u4E0A\u50B3",
      "settings.syncDescription": "\u767B\u5165\u5F8C\uFF0C\u5DE5\u4F5C\u5340\u548C\u6703\u8A71\u6703\u5728\u80CC\u666F\u4E0A\u50B3\u5230\u4F60\u7684\u79C1\u4EBA\u983B\u9053\u3002\u672C\u6A5F\u804A\u5929\u4E0D\u53D7\u5F71\u97FF\u3002",
      "settings.connectionHint": "\u958B\u555F\u4EFB\u4E00 Loop \u6A21\u7D44\uFF0C\u5B8C\u6210\u4E00\u6B21\u767B\u5165\u4E26\u9078\u64C7 Loop \u5DE5\u4F5C\u5340\uFF1B\u804A\u5929\u8A18\u9304\u4E0A\u50B3\u6703\u6CBF\u7528\u6B64\u9023\u7DDA\u3002",
      "settings.connectTitle": "\u9023\u7DDA Loop \u5C08\u6848\u532F\u5165",
      "settings.connectAction": "\u767B\u5165 Loop",
      "settings.cancel": "\u53D6\u6D88",
      "error.title": "\u64CD\u4F5C\u672A\u5B8C\u6210",
      "error.hostUpdate": "\u6B64 Loop \u5916\u639B\u9700\u8981\u8F03\u65B0\u7684\u53EF\u4FE1 Host \u6574\u5408\u3002"
    };
    var ja = {
      ...en,
      "module.inbox": "\u53D7\u4FE1\u30C8\u30EC\u30A4",
      "module.contacts": "\u9023\u7D61\u5148",
      "module.tasks": "\u30BF\u30B9\u30AF",
      "module.projects": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
      "module.workflows": "\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC",
      "module.knowledge": "\u30CA\u30EC\u30C3\u30B8\u30D9\u30FC\u30B9",
      "module.drive": "\u30AF\u30E9\u30A6\u30C9\u30C9\u30E9\u30A4\u30D6",
      "module.dataspaces": "\u30C7\u30FC\u30BF\u30B9\u30DA\u30FC\u30B9",
      "module.capabilities": "\u30A8\u30AD\u30B9\u30D1\u30FC\u30C8\u30FB\u30B9\u30AD\u30EB",
      "module.connectors": "\u30B3\u30CD\u30AF\u30BF\u30FC",
      "human.title": "\u81EA\u5206\u306E\u540D\u7FA9\u3067\u5B9F\u884C",
      "human.pickProject": "Loop \u3067\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u9078\u629E",
      "human.pickKB": "Loop \u3067\u30CA\u30EC\u30C3\u30B8\u30D9\u30FC\u30B9\u3092\u9078\u629E",
      "human.pasteLink": "\u9078\u629E\u3057\u305F\u30EA\u30BD\u30FC\u30B9\u306E\u30EA\u30F3\u30AF",
      "human.shareLink": "\u3053\u306E\u30EA\u30BD\u30FC\u30B9\u3092\u4F7F\u7528",
      "human.invalidLink": "\u73FE\u5728\u306E\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u306E\u30EA\u30F3\u30AF\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002",
      "human.agentDenied": "\u3053\u306E\u64CD\u4F5C\u306B\u306F\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u306E\u6A29\u9650\u304C\u8DB3\u308A\u307E\u305B\u3093\u3002\u7D9A\u3051\u308B\u306B\u306F\u627F\u8A8D\u304C\u5FC5\u8981\u3067\u3059\u3002",
      "human.all": "\u3053\u306E\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u3067\u30A2\u30AF\u30BB\u30B9\u3067\u304D\u308B\u5168\u30EA\u30BD\u30FC\u30B9",
      "human.reusable": "\u6709\u52B9\u671F\u9650\u306F Loop \u306E\u78BA\u8A8D\u753B\u9762\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u627F\u8A8D\u306F\u7E70\u308A\u8FD4\u3057\u5229\u7528\u3067\u304D\u3001Loop \u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u8A2D\u5B9A\u3067\u53D6\u308A\u6D88\u305B\u307E\u3059\u3002",
      "human.expires": "{date} \u307E\u3067\u7E70\u308A\u8FD4\u3057\u5229\u7528\u3067\u304D\u307E\u3059\u3002Loop \u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u8A2D\u5B9A\u3067\u53D6\u308A\u6D88\u305B\u307E\u3059\u3002",
      "human.open": "Loop \u3067\u78BA\u8A8D",
      "human.reuse": "\u65E2\u5B58\u306E\u627F\u8A8D\u3092\u4F7F\u3046",
      "human.cancel": "\u30AD\u30E3\u30F3\u30BB\u30EB",
      "human.manage": "\u7BA1\u7406\u6A29\u9650\u3092\u542B\u3080",
      "human.failed": "\u5143\u306E\u4F1A\u8A71\u306B\u623B\u3063\u3066\u3084\u308A\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "collab.management.active": "\u59D4\u4EFB\uFF1A\u6709\u52B9",
      "collab.management.unavailable": "\u59D4\u4EFB\uFF1A\u5229\u7528\u4E0D\u53EF",
      "collab.management.closed": "\u59D4\u4EFB\uFF1A\u7D42\u4E86",
      "collab.task.todo": "\u30BF\u30B9\u30AF\uFF1A\u672A\u7740\u624B",
      "collab.task.inProgress": "\u30BF\u30B9\u30AF\uFF1A\u9032\u884C\u4E2D",
      "collab.task.inReview": "\u30BF\u30B9\u30AF\uFF1A\u30EC\u30D3\u30E5\u30FC\u5F85\u3061",
      "collab.task.done": "\u30BF\u30B9\u30AF\uFF1A\u5B8C\u4E86",
      "collab.task.unavailable": "\u30BF\u30B9\u30AF\u306B\u30A2\u30AF\u30BB\u30B9\u3067\u304D\u307E\u305B\u3093",
      "collab.task.accepted": "\u64CD\u4F5C\u3092\u53D7\u3051\u4ED8\u3051\u307E\u3057\u305F",
      "collab.task.execution": "\u5B9F\u884C\uFF1A{status}",
      "collab.task.deliveryGap": "\u4EE5\u524D\u306E\u30BF\u30B9\u30AF\u30E1\u30C3\u30BB\u30FC\u30B8\u306E\u4E00\u90E8\u306F\u671F\u9650\u5207\u308C\u3067\u3059\u3002Loop \u3067\u30BF\u30B9\u30AF\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "login.title": "Loop \u30A2\u30AB\u30A6\u30F3\u30C8",
      "login.personalPage": "\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u306F\u63A5\u7D9A\u6E08\u307F\u3067\u3059\u3002\u3053\u306E\u7AEF\u672B\u3067\u500B\u4EBA\u7528\u306E Loop \u30DA\u30FC\u30B8\u3092\u8868\u793A\u3067\u304D\u307E\u3059\u3002",
      "login.authorizePages": "\u500B\u4EBA\u30DA\u30FC\u30B8\u3092\u8A31\u53EF",
      "login.method": "\u30ED\u30B0\u30A4\u30F3\u65B9\u6CD5",
      "login.browser": "\u30D6\u30E9\u30A6\u30B6\u30FC",
      "login.tokenHint": "Loop \u8A2D\u5B9A\u306E\u500B\u4EBA\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u304C\u767A\u884C\u3057\u305F DSH \u30C8\u30FC\u30AF\u30F3\u3092\u4F7F\u7528\u3057\u307E\u3059\u3002\u500B\u4EBA\u7528 Loop \u30DA\u30FC\u30B8\u306B\u306F\u30D6\u30E9\u30A6\u30B6\u30FC\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002",
      "login.description": "Loop \u30B5\u30FC\u30D0\u30FC\u3092\u9078\u629E\u3057\u3001\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u3053\u306E\u7AEF\u672B\u3092\u63A5\u7D9A\u3057\u307E\u3059\u3002",
      "login.rememberServer": "\u63A5\u7D9A\u306B\u6210\u529F\u3059\u308B\u3068\u3001\u3053\u306E\u7AEF\u672B\u306B\u30B5\u30FC\u30D0\u30FC\u306E\u30A2\u30C9\u30EC\u30B9\u304C\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002",
      "login.checking": "\u30ED\u30B0\u30A4\u30F3\u72B6\u614B\u3092\u78BA\u8A8D\u4E2D\u2026",
      "login.signedIn": "\u30ED\u30B0\u30A4\u30F3\u6E08\u307F",
      "login.signedOut": "\u672A\u30ED\u30B0\u30A4\u30F3",
      "login.expired": "\u30ED\u30B0\u30A4\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002\u518D\u5EA6\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "login.statusUnavailable": "\u30ED\u30B0\u30A4\u30F3\u72B6\u614B\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093",
      "login.signingIn": "\u30ED\u30B0\u30A4\u30F3\u4E2D",
      "login.signingOut": "\u30ED\u30B0\u30A2\u30A6\u30C8\u4E2D",
      "login.logout": "\u30ED\u30B0\u30A2\u30A6\u30C8",
      "login.logoutHint": "\u30ED\u30B0\u30A2\u30A6\u30C8\u3059\u308B\u3068\u3001\u3053\u306E\u7AEF\u672B\u306E Loop \u30E2\u30C7\u30EB\u3001Agent\u3001\u4F1A\u8A71\u540C\u671F\u306E\u63A5\u7D9A\u304C\u89E3\u9664\u3055\u308C\u307E\u3059\u3002\u4F1A\u8A71\u306F\u4FDD\u6301\u3055\u308C\u307E\u3059\u3002",
      "login.logoutPending": "Loop \u3067\u78BA\u8A8D\u3057\u3066\u30ED\u30B0\u30A2\u30A6\u30C8\u3092\u5B8C\u4E86\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u63A5\u7D9A\u306B\u5931\u6557\u3057\u305F\u5834\u5408\u306F\u518D\u8A66\u884C\u3067\u304D\u307E\u3059\u3002",
      "settings.disconnect": "Loop \u304B\u3089\u30ED\u30B0\u30A2\u30A6\u30C8",
      "settings.disconnectFinish": "\u30ED\u30B0\u30A2\u30A6\u30C8\u3092\u5B8C\u4E86",
      "settings.disconnectConfirm": "Loop \u3067\u30ED\u30B0\u30A2\u30A6\u30C8\u3092\u78BA\u8A8D",
      "settings.disconnectCheck": "\u30ED\u30B0\u30A2\u30A6\u30C8\u7D50\u679C\u3092\u78BA\u8A8D",
      "settings.disconnectPending": "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u306F\u505C\u6B62\u3057\u307E\u3057\u305F\u3002\u3053\u306E\u7AEF\u672B\u306E\u30ED\u30B0\u30A2\u30A6\u30C8\u3092\u5B8C\u4E86\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.disconnectDescription": "\u73FE\u5728\u306E Loop \u63A5\u7D9A\u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3001\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u3001\u30E2\u30C7\u30EB\u306E\u8A8D\u53EF\u3092\u89E3\u9664\u3057\u307E\u3059\u3002\u30C1\u30E3\u30C3\u30C8\u306F\u4FDD\u6301\u3055\u308C\u307E\u3059\u3002",
      "error.credentialUnavailable": "\u3053\u306E\u7AEF\u672B\u306E Loop \u30ED\u30B0\u30A4\u30F3\u60C5\u5831\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3002\u8A8D\u8A3C\u60C5\u5831\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u3092\u5FA9\u65E7\u3057\u3066\u518D\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u30ED\u30FC\u30AB\u30EB\u30C1\u30E3\u30C3\u30C8\u306F\u5F15\u304D\u7D9A\u304D\u4F7F\u7528\u3067\u304D\u307E\u3059\u3002",
      "settings.uploadConnected": "\u63A5\u7D9A\u6E08\u307F\u3002\u30C1\u30E3\u30C3\u30C8\u306F\u81EA\u52D5\u3067\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3055\u308C\u307E\u3059\u3002",
      "launcher.loopNeedsConnection": "Loop \u306E\u63A5\u7D9A\u3092\u5B8C\u4E86",
      "upload.label": "Loop \u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u72B6\u6CC1",
      "upload.uploading": "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u4E2D",
      "upload.uploaded": "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u6E08\u307F",
      "upload.failed": "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u5931\u6557",
      "upload.off": "Loop \u306B\u672A\u30ED\u30B0\u30A4\u30F3",
      "collab.dialog.task": "\u5171\u540C\u4F5C\u696D\u30BF\u30B9\u30AF",
      "collab.candidate.delegate": "\u30BF\u30B9\u30AF\u306E\u62C5\u5F53\u5019\u88DC",
      "collab.candidate.notify": "\u30E1\u30F3\u30B7\u30E7\u30F3\u3067\u304D\u307E\u3059",
      "collab.candidate.needsAccess": "\u30E1\u30F3\u30B7\u30E7\u30F3\u53EF\u30FB\u4F9D\u983C\u306B\u306F\u6A29\u9650\u304C\u5FC5\u8981\u3067\u3059",
      "collab.error.humanDisabled": "\u3053\u306E\u5165\u529B\u6B04\u306F Loop \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u306E\u307F\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059\u3002\u53E4\u3044\u4EBA\u9593\u3078\u306E\u53C2\u7167\u3092\u524A\u9664\u3057\u3001Loop \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u3092\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "slash.loopSkills": "Loop \xB7 \u30B9\u30AD\u30EB",
      "slash.loopKnowledge": "Loop \xB7 \u30CA\u30EC\u30C3\u30B8",
      "knowledge.error.unavailable": "Loop \u30CA\u30EC\u30C3\u30B8\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002\u63A5\u7D9A\u3068\u6A29\u9650\u3092\u78BA\u8A8D\u3057\u3001/ \u3092\u958B\u3044\u3066\u518D\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "error.loopSkills": "Loop \u30B9\u30AD\u30EB\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.auth": "Loop \u30B9\u30AD\u30EB\u3092\u4F7F\u7528\u3059\u308B\u524D\u306B Loop \u3078\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.hostUpdate": "\u30B9\u30AD\u30EB\u3092\u4F7F\u3046\u306B\u306F Loop \u30D7\u30E9\u30B0\u30A4\u30F3\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.session": "Loop \u30B9\u30AD\u30EB\u3092\u4F7F\u7528\u3059\u308B\u524D\u306B\u3001\u3053\u306E Session \u306E Loop \u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.reference": "\u3053\u306E Loop \u30B9\u30AD\u30EB\u306E\u9078\u629E\u306F\u7121\u52B9\u3067\u3059\u3002\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.path": "\u3053\u306E Loop \u30B9\u30AD\u30EB\u306E\u30D1\u30B9\u306F\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u30B9\u30AD\u30EB\u3092\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.offline": "Loop \u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002\u4E0B\u66F8\u304D\u306F\u5909\u66F4\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
      "skill.error.busy": "Loop \u30B9\u30AD\u30EB\u306E\u66F4\u65B0\u306F\u4E00\u6642\u7684\u306B\u5236\u9650\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
      "skill.error.cancelled": "Loop \u30B9\u30AD\u30EB\u306E\u8AAD\u307F\u8FBC\u307F\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F\u3002",
      "skill.error.bindingStale": "\u3053\u306E Loop \u30B9\u30AD\u30EB\u306E\u7248\u304C\u5909\u66F4\u3055\u308C\u305F\u304B\u3001\u6A29\u9650\u304C\u306A\u304F\u306A\u308A\u307E\u3057\u305F\u3002\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "skill.error.tooLarge": "\u3053\u306E Loop \u30B9\u30AD\u30EB\u306F\u5927\u304D\u3059\u304E\u308B\u305F\u3081\u5B89\u5168\u306B\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002",
      "skill.error.unavailable": "\u3053\u306E Loop \u30B9\u30AD\u30EB\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "launcher.loopAccount": "Loop \u30A2\u30AB\u30A6\u30F3\u30C8",
      "launcher.feedback": "\u30D5\u30A3\u30FC\u30C9\u30D0\u30C3\u30AF",
      "launcher.signIn": "\u30ED\u30B0\u30A4\u30F3",
      "launcher.loopConnected": "Loop \u306B\u30ED\u30B0\u30A4\u30F3\u6E08\u307F",
      "launcher.loopConnecting": "Loop \u306B\u63A5\u7D9A\u3057\u3066\u3044\u307E\u3059",
      "launcher.loopNeedsSetup": "Loop \u306B\u672A\u30ED\u30B0\u30A4\u30F3",
      "launcher.loopNeedsAttention": "Loop \u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093",
      "launcher.connectLoop": "Loop \u306B\u30ED\u30B0\u30A4\u30F3",
      "launcher.modelSelected": "\u3053\u306E\u30C1\u30E3\u30C3\u30C8\uFF1A{model}",
      "launcher.modelSessionDefault": "\u3053\u306E\u30C1\u30E3\u30C3\u30C8\u306E\u65E2\u5B9A\uFF1A{model}",
      "launcher.modelSelectedUnavailable": "\u30E2\u30C7\u30EB\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\uFF1A{model}",
      "launcher.modelNewSessionDefault": "\u65B0\u898F\u30C1\u30E3\u30C3\u30C8\u306E\u65E2\u5B9A\uFF1A{model}",
      "launcher.modelNewSessionDefaultUnavailable": "\u65E2\u5B9A\u30E2\u30C7\u30EB\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\uFF1A{model}",
      "launcher.modelLoading": "\u30E2\u30C7\u30EB\u8A2D\u5B9A",
      "launcher.modelUnavailable": "\u30E2\u30C7\u30EB\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093 \xB7 \u8A2D\u5B9A\u3092\u958B\u304F",
      "launcher.modelSourceExternal": "\u5916\u90E8\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC",
      "launcher.modelSourceUnknown": "\u63D0\u4F9B\u5143\u306E\u78BA\u8A8D\u304C\u5FC5\u8981",
      "launcher.modelBillingPersonal": "\u500B\u4EBA\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u8AB2\u91D1",
      "launcher.modelBillingOrganization": "\u7D44\u7E54\u30E2\u30C7\u30EB\u6A29\u9650",
      "launcher.modelBillingLoopHosted": "Loop \u30DB\u30B9\u30C8\u578B\u5229\u7528",
      "launcher.modelBillingProvider": "\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u8AB2\u91D1",
      "launcher.modelBillingUnknown": "\u8AB2\u91D1\u5143\u306E\u78BA\u8A8D\u304C\u5FC5\u8981",
      "launcher.settings": "\u8A2D\u5B9A",
      "onboarding.loginLoop": "Loop \u306B\u30B5\u30A4\u30F3\u30A4\u30F3",
      "onboarding.openKeySettings": "API \u30AD\u30FC\u3092\u5165\u529B",
      "onboarding.authorizeModels": "Loop \u30E2\u30C7\u30EB\u306B\u63A5\u7D9A",
      "onboarding.openModelsAuth": "\u8A8D\u53EF\u30DA\u30FC\u30B8\u3092\u958B\u304F",
      "onboarding.continueModels": "\u8A8D\u53EF\u3092\u5B8C\u4E86\u3057\u3066\u7D9A\u884C",
      "onboarding.configureLoop": "Loop \u30B5\u30FC\u30D0\u30FC\u3092\u8A2D\u5B9A",
      "onboarding.resume": "Loop \u8A2D\u5B9A\u3092\u518D\u958B",
      "onboarding.cancelledBody": "Loop \u8A2D\u5B9A\u306F\u307E\u3060\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002\u6E96\u5099\u304C\u3067\u304D\u305F\u3089\u518D\u958B\u3059\u308B\u304B\u3001Harness \u306E\u65E2\u5B58\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3067\u5B9F\u969B\u306E API \u30AD\u30FC\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.workspaceTitle": "Loop \u306B\u30ED\u30B0\u30A4\u30F3",
      "onboarding.workspaceBody": "\u30ED\u30B0\u30A4\u30F3\u5F8C\u3001\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.modelsTitle": "Loop \u30E2\u30C7\u30EB\u3092\u8A8D\u53EF",
      "onboarding.modelsBody": "Loop \u30E2\u30C7\u30EB\u3092\u63A5\u7D9A\u3057\u3001\u4F7F\u7528\u3059\u308B\u30E2\u30C7\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.openLoopPage": "Loop \u3067\u78BA\u8A8D",
      "onboarding.continueSetup": "\u8A2D\u5B9A\u3092\u7D9A\u884C",
      "onboarding.checkingModels": "\u30E2\u30C7\u30EB\u3092\u78BA\u8A8D\u4E2D\u2026",
      "onboarding.recoverLogin": "\u30ED\u30B0\u30A4\u30F3\u3092\u5FA9\u65E7",
      "error.credentialRecoveryDisabled": "\u8D77\u52D5\u8A2D\u5B9A\u3067\u30B7\u30B9\u30C6\u30E0\u306E\u8A8D\u8A3C\u753B\u9762\u304C\u7121\u52B9\u3067\u3059\u3002LOOP_KEYCHAIN_NO_UI \u3092\u524A\u9664\u3057\u3066\u518D\u8D77\u52D5\u3057\u3001\u5FA9\u65E7\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.recoveringLogin": "\u30B7\u30B9\u30C6\u30E0\u753B\u9762\u3067\u8A8D\u8A3C\u60C5\u5831\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u300C\u5E38\u306B\u8A31\u53EF\u300D\u3067\u518D\u8D77\u52D5\u5F8C\u3082\u5229\u7528\u3067\u304D\u307E\u3059\u3002",
      "onboarding.retryModels": "\u518D\u78BA\u8A8D",
      "onboarding.stopWaiting": "\u8A8D\u53EF\u3092\u30AD\u30E3\u30F3\u30BB\u30EB",
      "onboarding.modelNeedsAuth": "Super Agent \u306B Loop \u30E2\u30C7\u30EB\u306E\u4F7F\u7528\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.modelRateLimited": "Loop \u3078\u306E\u30E2\u30C7\u30EB\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u591A\u3059\u304E\u307E\u3059\u3002\u5C11\u3057\u5F85\u3063\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.noModels": "\u5229\u7528\u3067\u304D\u308B\u30E2\u30C7\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3002Loop \u3067\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3001\u6A29\u9650\u3001\u6B8B\u9AD8\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.catalogUnavailable": "\u30E2\u30C7\u30EB\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.routeMissing": "\u30E2\u30C7\u30EB\u63A5\u7D9A\u306E\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u307E\u305B\u3093\u3002\u518D\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.selectionRequired": "\u4F7F\u7528\u3059\u308B\u30E2\u30C7\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.scopeRequired": "Loop \u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.chooseModelHint": "\u30C1\u30E3\u30C3\u30C8\u5165\u529B\u6B04\u306E\u6A2A\u3067\u3044\u3064\u3067\u3082\u5909\u66F4\u3067\u304D\u307E\u3059\u3002",
      "onboarding.chooseModel": "\u30E2\u30C7\u30EB\u3092\u9078\u629E",
      "onboarding.useModel": "\u3053\u306E\u30E2\u30C7\u30EB\u3092\u4F7F\u7528",
      "onboarding.savingModel": "\u30E2\u30C7\u30EB\u9078\u629E\u3092\u4FDD\u5B58\u3057\u3066\u3044\u307E\u3059\u2026",
      "onboarding.selectionSaveFailed": "\u30E2\u30C7\u30EB\u306E\u9078\u629E\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.selectionSaveUnknown": "\u4FDD\u5B58\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002\u3082\u3046\u4E00\u5EA6\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.modelError": "\u30E2\u30C7\u30EB\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002\u518D\u8A66\u884C\u3059\u308B\u304B API \u30AD\u30FC\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.externalReady": "API \u30AD\u30FC\u306E\u30E2\u30C7\u30EB\u3092\u5229\u7528\u3067\u304D\u307E\u3059\u3002",
      "onboarding.keyTitle": "\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u5B8C\u4E86",
      "onboarding.keyBody": "\u300C\u8A2D\u5B9A \u2192 \u30E2\u30C7\u30EB\u300D\u3067 API \u30AD\u30FC\u3092\u8FFD\u52A0\u3057\u3001\u30E2\u30C7\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.returnLoop": "Loop \u30ED\u30B0\u30A4\u30F3\u3092\u4F7F\u3046",
      "onboarding.apiKeyHint": "API \u30AD\u30FC\u306F Harness \u306E\u65E2\u5B58\u30E2\u30C7\u30EB\u8A2D\u5B9A\u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002Loop \u3078\u306E\u30B5\u30A4\u30F3\u30A4\u30F3\u3067\u65E2\u5B58\u30AD\u30FC\u304C\u7F6E\u63DB\u307E\u305F\u306F\u524A\u9664\u3055\u308C\u308B\u3053\u3068\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
      "onboarding.loopConnecting": "Loop \u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u2026",
      "onboarding.loopReady": "Loop \u306B\u63A5\u7D9A\u3055\u308C\u3001\u30E2\u30C7\u30EB\u3092\u5229\u7528\u3067\u304D\u307E\u3059\u3002",
      "onboarding.loopConnectedModelPending": "Loop \u306B\u63A5\u7D9A\u3055\u308C\u3066\u3044\u307E\u3059\u304C\u3001\u5229\u7528\u53EF\u80FD\u306A\u30E2\u30C7\u30EB\u304C\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002Loop \u3067\u8A2D\u5B9A\u3092\u5B8C\u4E86\u3059\u308B\u304B\u3001API \u30AD\u30FC\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.loopNeedsServer": "Loop \u30B5\u30FC\u30D0\u30FC\u3092\u8A2D\u5B9A\u3057\u3066\u304B\u3089\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.loopNeedsAttention": "Loop \u306B\u63A5\u7D9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u518D\u8A66\u884C\u3059\u308B\u304B\u3001API \u30AD\u30FC\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "onboarding.loopUnavailable": "Loop \u63A5\u7D9A\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304B\u3089\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.title": "Loop",
      "settings.uploadDisconnectedHistory": "\u672A\u30ED\u30B0\u30A4\u30F3\u4E2D\u306E\u30C1\u30E3\u30C3\u30C8\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9",
      "settings.uploadDisconnectedHistoryHint": "\u65E2\u5B9A\u3067\u306F\u30AA\u30D5\u3067\u3059\u3002\u30AA\u30D5\u306E\u5834\u5408\u3001Loop \u306B\u30ED\u30B0\u30A4\u30F3\u4E2D\u306E\u65B0\u3057\u3044\u30E1\u30C3\u30BB\u30FC\u30B8\u306E\u307F\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002\u30AA\u30F3\u306E\u5834\u5408\u3001\u30ED\u30B0\u30A4\u30F3\u5F8C\u306B\u30A2\u30AF\u30BB\u30B9\u53EF\u80FD\u306A\u5C65\u6B74\u3082\u9001\u4FE1\u3057\u307E\u3059\u3002",
      "settings.uploadPreferencesError": "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u307F\u30FB\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.description": "\u4E00\u5EA6\u30ED\u30B0\u30A4\u30F3\u3059\u308B\u3068\u3001Loop \u3068\u5229\u7528\u53EF\u80FD\u306A\u30E2\u30C7\u30EB\u304C\u81EA\u52D5\u8A2D\u5B9A\u3055\u308C\u307E\u3059\u3002",
      "settings.serverTitle": "Loop \u30B5\u30FC\u30D0\u30FC",
      "settings.serverDescription": "Loop \u30E2\u30B8\u30E5\u30FC\u30EB\u3068\u540C\u671F\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306F\u3053\u306E\u30B5\u30FC\u30D0\u30FC\u63A5\u7D9A\u3092\u4F7F\u7528\u3057\u307E\u3059\u3002",
      "settings.serverConnected": "Loop \u30B5\u30FC\u30D0\u30FC\u306B\u63A5\u7D9A\u3057\u307E\u3057\u305F\u3002",
      "settings.account": "\u30A2\u30AB\u30A6\u30F3\u30C8",
      "settings.modelsTitle": "Loop \u30E2\u30C7\u30EB",
      "settings.modelsDescription": "\u73FE\u5728\u306E Loop \u30A2\u30AB\u30A6\u30F3\u30C8\u3067\u5229\u7528\u3067\u304D\u308B\u500B\u4EBA\u3001\u7D44\u7E54\u3001Loop \u30DB\u30B9\u30C8\u578B\u30E2\u30C7\u30EB\u3092 Harness \u3067\u4F7F\u7528\u3057\u307E\u3059\u3002\u8A8D\u53EF\u306F\u30D6\u30E9\u30A6\u30B6\u30FC\u3067\u884C\u3044\u3001\u30E2\u30C7\u30EB\u8CC7\u683C\u60C5\u5831\u306F Loop \u30B5\u30FC\u30D0\u30FC\u306B\u4FDD\u6301\u3055\u308C\u307E\u3059\u3002",
      "settings.modelsLoading": "Loop \u30E2\u30C7\u30EB\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059\u2026",
      "settings.currentSessionModel": "\u73FE\u5728\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u9078\u629E",
      "settings.currentSessionDefaultModel": "\u73FE\u5728\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u306F\u65B0\u3057\u3044\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u65E2\u5B9A\u30E2\u30C7\u30EB\u3092\u4F7F\u7528",
      "settings.newSessionDefaultModel": "\u65B0\u3057\u3044\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u65E2\u5B9A\u30E2\u30C7\u30EB",
      "settings.currentModelUnavailable": "\u9078\u629E\u4E2D\u306E\u30E2\u30C7\u30EB\u307E\u305F\u306F\u8AB2\u91D1\u5143\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002\u4F5C\u696D\u3092\u59CB\u3081\u308B\u524D\u306B\u6709\u52B9\u306A\u30E2\u30C7\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.currentModelHint": "\u3053\u3053\u306B\u306F\u73FE\u5728\u306E\u5B9F\u969B\u306E\u9078\u629E\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u63A5\u7D9A\u304C\u5909\u308F\u3063\u3066\u3082 Harness \u304C\u81EA\u52D5\u3067\u5207\u308A\u66FF\u3048\u308B\u3053\u3068\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
      "settings.modelsCount": "\u5229\u7528\u53EF\u80FD\u306A\u30E2\u30C7\u30EB {count} \u4EF6",
      "settings.modelsNoneAvailable": "\u4F7F\u7528\u53EF\u80FD\u306A\u30E2\u30C7\u30EB\u304C\u8FD4\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3053\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u691C\u8A3C\u6E08\u307F\u500B\u4EBA\u30E2\u30C7\u30EB\u3001\u7D44\u7E54\u30E2\u30C7\u30EB\u6A29\u9650\u3001Loop \u30DB\u30B9\u30C8\u578B\u30E2\u30C7\u30EB\u306E\u53EF\u7528\u6027\u3068\u6B8B\u9AD8\u3092\u78BA\u8A8D\u3057\u3066\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.modelsEmptyTitle": "Harness \u3067 Loop \u30E2\u30C7\u30EB\u30B5\u30FC\u30D3\u30B9\u3092\u4F7F\u7528",
      "settings.modelsEmptyBody": "Loop \u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u63A5\u7D9A\u3059\u308B\u3068\u3001\u500B\u4EBA\u3001\u7D44\u7E54\u3001Loop \u30DB\u30B9\u30C8\u578B\u30E2\u30C7\u30EB\u304C Harness \u306E\u30E2\u30C7\u30EB\u9078\u629E\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002",
      "settings.modelsAuthTitle": "Loop \u30E2\u30C7\u30EB\u3092\u8A8D\u53EF",
      "settings.modelsAuthBody": "\u30D6\u30E9\u30A6\u30B6\u30FC\u3067\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u62D2\u5426\u307E\u305F\u306F\u671F\u9650\u5207\u308C\u306E\u5834\u5408\u3001\u65E2\u5B58\u306E\u63A5\u7D9A\u306F\u5909\u66F4\u3055\u308C\u305A\u3001\u518D\u8A66\u884C\u3067\u304D\u307E\u3059\u3002",
      "settings.modelsAuthOpen": "\u30D6\u30E9\u30A6\u30B6\u30FC\u306E\u8A8D\u53EF\u3092\u958B\u304F",
      "settings.modelsAuthContinue": "\u8A8D\u53EF\u5F8C\u306B\u7D9A\u884C",
      "settings.modelsChecking": "\u8A8D\u53EF\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u2026",
      "settings.modelsDisconnect": "\u5207\u65AD",
      "settings.modelsDisconnecting": "\u5207\u65AD\u3057\u3066\u3044\u307E\u3059\u2026",
      "settings.modelsConnect": "Loop \u30E2\u30C7\u30EB\u3092\u63A5\u7D9A",
      "settings.modelsConnectAnother": "\u3055\u3089\u306B Loop \u30E2\u30C7\u30EB\u3092\u63A5\u7D9A",
      "settings.modelsAuthorizing": "\u8A8D\u53EF\u3092\u958B\u59CB\u3057\u3066\u3044\u307E\u3059\u2026",
      "settings.modelsRefresh": "\u30E2\u30C7\u30EB\u3092\u66F4\u65B0",
      "settings.modelsRefreshing": "\u66F4\u65B0\u3057\u3066\u3044\u307E\u3059\u2026",
      "settings.modelsSourcePersonal": "\u500B\u4EBA",
      "settings.modelsSourceOrganization": "\u7D44\u7E54",
      "settings.modelsSourceLoopHosted": "Loop \u30DB\u30B9\u30C8\u578B",
      "settings.modelsPickerHint": "\u30C1\u30E3\u30C3\u30C8\u5165\u529B\u6B04\u306E\u6A2A\u3067\u9078\u629E\u6E08\u307F\u306E\u30E2\u30C7\u30EB\u3092\u5909\u66F4\u3067\u304D\u307E\u3059\u3002",
      "settings.modelsUnavailable": "Loop \u30E2\u30C7\u30EB\u3092\u4E00\u6642\u7684\u306B\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002Loop \u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.modelsReconnectRequired": "\u3053\u306E\u63A5\u7D9A\u306F\u518D\u8A8D\u53EF\u304C\u5FC5\u8981\u3067\u3059\u3002\u300C\u3055\u3089\u306B Loop \u30E2\u30C7\u30EB\u3092\u63A5\u7D9A\u300D\u3092\u9078\u3076\u304B\u3001\u3053\u306E\u63A5\u7D9A\u3092\u5207\u65AD\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.modelsAuthRequired": "\u30D6\u30E9\u30A6\u30B6\u30FC\u3067\u8A8D\u53EF\u3092\u5B8C\u4E86\u3057\u3066\u304B\u3089\u7D9A\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u671F\u9650\u5207\u308C\u306E\u5834\u5408\u306F\u518D\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.modelsRateLimited": "Loop \u3078\u306E\u30E2\u30C7\u30EB\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u591A\u3059\u304E\u307E\u3059\u3002\u5C11\u3057\u5F85\u3063\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.modelsFailed": "Loop \u30E2\u30C7\u30EB\u3092\u66F4\u65B0\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "settings.syncTitle": "\u30C1\u30E3\u30C3\u30C8\u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9",
      "settings.syncDescription": "\u30ED\u30B0\u30A4\u30F3\u5F8C\u3001\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u3068\u30C1\u30E3\u30C3\u30C8\u3092\u81EA\u5206\u306E\u975E\u516C\u958B\u30C1\u30E3\u30F3\u30CD\u30EB\u306B\u30D0\u30C3\u30AF\u30B0\u30E9\u30A6\u30F3\u30C9\u3067\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002\u30ED\u30FC\u30AB\u30EB\u306E\u64CD\u4F5C\u306B\u306F\u5F71\u97FF\u3057\u307E\u305B\u3093\u3002",
      "settings.connectionHint": "\u3044\u305A\u308C\u304B\u306E Loop \u30E2\u30B8\u30E5\u30FC\u30EB\u3092\u958B\u304D\u3001\u4E00\u5EA6\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u3066 Loop \u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u540C\u671F\u306F\u3053\u306E\u63A5\u7D9A\u3092\u518D\u5229\u7528\u3057\u307E\u3059\u3002",
      "settings.connectTitle": "Loop \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u30A4\u30F3\u30DD\u30FC\u30C8\u3092\u63A5\u7D9A",
      "settings.connectAction": "Loop \u306B\u30ED\u30B0\u30A4\u30F3",
      "settings.cancel": "\u30AD\u30E3\u30F3\u30BB\u30EB",
      "error.title": "\u64CD\u4F5C\u3092\u5B8C\u4E86\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
      "error.hostUpdate": "\u3053\u306E Loop \u30D7\u30E9\u30B0\u30A4\u30F3\u306B\u306F\u65B0\u3057\u3044\u4FE1\u983C\u6E08\u307F Host \u7D71\u5408\u304C\u5FC5\u8981\u3067\u3059\u3002"
    };

    // client/ui/loop-global-panel.tsx
    var import_react2 = require("react");
    var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
    var import_jsx_runtime2 = require("react/jsx-runtime");
    function LoopGlobalPanel(_props) {
      return null;
    }
    function findCenterColumn(frame) {
      const mainSlot = frame.querySelector('[data-slot="main"]');
      let candidate = mainSlot;
      while (candidate !== null && candidate.parentElement !== frame) {
        candidate = candidate.parentElement;
      }
      return candidate ?? Array.from(frame.children).find((child, index) => index === 1 && child instanceof HTMLElement) ?? null;
    }
    function LoopPageFrame({
      state,
      attachWorkspacePage,
      title,
      active = true
    }) {
      const frame = (0, import_react2.useRef)(null);
      const attach = () => {
        if (!active || state.screen !== "ready" || state.page === null) return;
        const contentWindow = frame.current?.contentWindow;
        if (contentWindow !== null && contentWindow !== void 0) {
          attachWorkspacePage(contentWindow, state.page.url);
        }
      };
      (0, import_react2.useEffect)(() => {
        if (!active || state.screen !== "ready" || state.page === null) return;
        const contentWindow = frame.current?.contentWindow;
        if (contentWindow !== null && contentWindow !== void 0) {
          attachWorkspacePage(contentWindow, state.page.url);
        }
      }, [active, state.frameKey, state.page, attachWorkspacePage]);
      if (state.screen !== "ready" || state.page === null) return null;
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "iframe",
        {
          ref: frame,
          className: loop_ui_default.globalFrame,
          src: state.page.url,
          title,
          referrerPolicy: "no-referrer",
          allow: "clipboard-read 'src'; clipboard-write 'src'; fullscreen 'src'; autoplay 'src'; picture-in-picture 'src'; web-share 'src'",
          sandbox: "allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-storage-access-by-user-activation",
          onLoad: attach
        },
        `${state.frameKey}:${state.page.url}`
      );
    }
    function LoopGlobalHost({
      useAccountConnection,
      authorizePages,
      retryLogin,
      recoverLogin,
      cancelRecovery,
      useGlobalPage,
      useSharedData,
      usePanelInfo,
      actions,
      attachWorkspacePage,
      t
    }) {
      const connection = useAccountConnection((value) => value);
      const host = (0, import_react2.useRef)(null);
      const state = useGlobalPage((value) => value);
      const sharedData = useSharedData((value) => value);
      const activePanelId = usePanelInfo((info) => info.activePanelId);
      const active = loopModuleForPanel(activePanelId) !== null;
      const [bounds, setBounds] = (0, import_react2.useState)(null);
      (0, import_react2.useEffect)(() => {
        if (active && activePanelId !== null) actions.openModule(activePanelId);
      }, [active, activePanelId, actions]);
      (0, import_react2.useLayoutEffect)(() => {
        if (!active) host.current?.setAttribute("inert", "");
        else host.current?.removeAttribute("inert");
      }, [active]);
      (0, import_react2.useLayoutEffect)(() => {
        const root = host.current;
        const overlay = root?.closest("[data-shell-overlay]");
        if (root === null || overlay === null || overlay === void 0) return;
        const layer = overlay;
        const frameCandidate = layer.parentElement;
        if (frameCandidate === null) return;
        const frame = frameCandidate;
        const measure = () => {
          const center2 = findCenterColumn(frame);
          if (center2 === null) return;
          const overlayRect = layer.getBoundingClientRect();
          const centerRect = center2.getBoundingClientRect();
          const next = {
            left: centerRect.left - overlayRect.left,
            top: centerRect.top - overlayRect.top,
            width: centerRect.width,
            height: centerRect.height
          };
          setBounds((current) => current !== null && current.left === next.left && current.top === next.top && current.width === next.width && current.height === next.height ? current : next);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        const center = findCenterColumn(frame);
        if (center !== null) observer.observe(center);
        window.addEventListener("resize", measure);
        return () => {
          observer.disconnect();
          window.removeEventListener("resize", measure);
        };
      }, []);
      const style = bounds === null ? void 0 : {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      };
      const sharedDataMessage = !active || state.screen !== "ready" || state.page === null ? null : sharedData.phase === "waiting" ? t("global.dataWaiting") : sharedData.phase === "resyncing" ? t("global.dataReconnecting") : sharedData.phase === "unavailable" ? t("global.dataUnavailable") : sharedData.data?.connection.phase === "reconnecting" ? t("global.connectionReconnecting") : sharedData.data?.connection.phase === "disconnected" ? t("global.connectionDisconnected") : null;
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          ref: host,
          className: loop_ui_default.globalHost,
          style,
          "data-loop-global-host": "",
          "data-active": active ? "true" : void 0,
          "aria-hidden": active ? void 0 : true,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              LoopPageFrame,
              {
                state,
                attachWorkspacePage,
                title: t("global.aria"),
                active
              }
            ),
            state.workspaceError !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: loop_ui_default.globalWorkspaceNotice, role: "alert", children: t("global.workspaceError") }),
            active && connection.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: loop_ui_default.globalConnectionStatus, role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: connection.error?.code === "loop/no-models" ? t("onboarding.noModels") : failureText(t, connection.error ?? { code: "loop/transport", message: "" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: connection.error?.code === "loop-host/credential-unavailable" ? recoverLogin : retryLogin, children: t(connection.error?.code === "loop-host/credential-unavailable" ? "onboarding.recoverLogin" : "global.retry") })
            ] }),
            active && connection.phase === "recovering" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: loop_ui_default.globalConnectionStatus, role: "status", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("onboarding.recoveringLogin") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: cancelRecovery, children: t("dialog.cancel") })
            ] }),
            sharedDataMessage !== null && connection.phase === "idle" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: loop_ui_default.globalConnectionStatus, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { role: "status", children: sharedDataMessage }),
              sharedData.phase === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Button,
                {
                  className: loop_ui_default.globalConnectionAction,
                  variant: "outline",
                  onClick: actions.reconnect,
                  children: t("global.reconnect")
                }
              )
            ] }),
            active && state.connection?.state === "signing_out" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: loop_ui_default.globalStatus, role: "status", children: t("login.signingOut") }),
            active && state.connection?.deviceOnly && state.connection.state === "signed_in" && state.serverUrl && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: loop_ui_default.globalStatus, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("login.personalPage") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", disabled: connection.phase === "waiting", onClick: authorizePages ?? retryLogin, children: t(connection.phase === "connecting" ? "settings.modelsAuthOpen" : "login.authorizePages") })
            ] }),
            active && !state.connection?.deviceOnly && state.connection?.state !== "signing_out" && (state.screen === "setup" || state.screen === "ready" && state.page === null) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: loop_ui_default.globalError, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: t("onboarding.loginLoop") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: loop_ui_default.hint, children: t("login.description") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", onClick: retryLogin, children: t("onboarding.loginLoop") })
            ] }),
            active && (state.screen === "idle" || state.screen === "loading") && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: loop_ui_default.globalStatus, role: "status", "aria-label": t("global.loading"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconLoadingOutlineRegular, { className: loop_ui_default.spinner, size: 20 }) }),
            active && state.screen === "error" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: loop_ui_default.globalError, role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("global.error") }),
              state.error !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: loop_ui_default.hint, children: failureText(t, state.error) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: loop_ui_default.serverActions, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: actions.reconnect, children: t("global.retry") }) })
            ] })
          ]
        }
      );
    }

    // client/ui/loop-bottom-menu.tsx
    var import_react3 = require("react");
    var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
    var import_jsx_runtime3 = require("react/jsx-runtime");
    function LoopBottomMenu({
      signIn,
      contactUs,
      wide,
      settingsOpen,
      settingsShortcut,
      openSettings,
      settingsAccess,
      t
    }) {
      const [open, setOpen] = (0, import_react3.useState)(false);
      const trigger = (0, import_react3.useRef)(null);
      (0, import_react3.useEffect)(() => {
        settingsAccess.setSettingsOpen(settingsOpen);
        if (settingsOpen) setOpen(false);
      }, [settingsAccess, settingsOpen]);
      (0, import_react3.useEffect)(() => {
        const unbind = settingsAccess.bind(openSettings);
        return () => {
          unbind();
          settingsAccess.setSettingsOpen(false);
        };
      }, [openSettings, settingsAccess]);
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: loop_ui_default.launcherRoot, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives3.Menu,
        {
          open,
          side: "top",
          portal: true,
          autoFocus: true,
          className: loop_ui_default.launcherAnchor,
          listClassName: loop_ui_default.launcherMenu,
          onClose: () => {
            setOpen(false);
          },
          anchor: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              ref: trigger,
              type: "button",
              className: loop_ui_default.launcherTrigger,
              "data-collapsed": !wide,
              "aria-label": t("launcher.open"),
              "aria-haspopup": "menu",
              "aria-expanded": open,
              onClick: () => {
                setOpen((value) => !value);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconEllipsisOutlineMedium, { size: 14 }),
                wide && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: loop_ui_default.launcherLabel, children: t("launcher.more") })
              ]
            }
          ),
          items: [
            {
              id: "settings",
              label: t("launcher.settings"),
              icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconSettingsOutlineMedium, { size: 16 }),
              ...settingsShortcut === void 0 ? {} : { shortcut: settingsShortcut }
            },
            { id: "feedback", label: t("launcher.feedback"), icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconPaperPlaneOutlineMedium, { size: 16 }) },
            { id: "signin", label: t("launcher.signIn"), icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconUserOutlineMedium, { size: 16 }) }
          ],
          onSelect: (id2) => {
            setOpen(false);
            if (id2 === "settings") {
              trigger.current?.focus();
              openSettings();
            } else if (id2 === "feedback") contactUs();
            else if (id2 === "signin") signIn();
          }
        }
      ) });
    }

    // client/ui/loop-launcher.ts
    var LOOP_LAUNCHER_PRIORITY = -1e3;

    // client/ui/host-feedback.ts
    var DEFAULT_CONTACT_FORM = "https://trtgsjkv6r.feishu.cn/share/base/form/shrcnlCoGElW7MQznGy9r3YYXcg?hide_uid=1&hide_device_info=1&hide_harness_version=1";
    function hostFeedbackUrl(config) {
      const configured = typeof config === "object" && config !== null && "contactFormUrl" in config && typeof config.contactFormUrl === "string" ? config.contactFormUrl : DEFAULT_CONTACT_FORM;
      let url;
      try {
        url = new URL(configured);
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
          url = new URL(DEFAULT_CONTACT_FORM);
        }
      } catch {
        url = new URL(DEFAULT_CONTACT_FORM);
      }
      url.searchParams.delete("prefill_uid");
      url.searchParams.set("hide_uid", "1");
      return url.href;
    }
    function openHostFeedback() {
      const host = window;
      window.open(hostFeedbackUrl(host.__DSH_CONTACT_CONFIG__), "_blank", "noopener,noreferrer");
    }

    // client/ui/loop-onboarding.tsx
    var import_react4 = require("react");
    var LOGIN_OFFERED_KEY = "loop-proxy.login-offered.v1";
    var offeredInRenderer = false;
    function claimFirstLoginOffer() {
      if (offeredInRenderer) return false;
      offeredInRenderer = true;
      try {
        if (globalThis.localStorage.getItem(LOGIN_OFFERED_KEY) === "1") return false;
        globalThis.localStorage.setItem(LOGIN_OFFERED_KEY, "1");
      } catch {
      }
      return true;
    }
    function useFirstLoginOffer({ useGlobalPage, openLoopModule }, complete) {
      const page = useGlobalPage((value) => value);
      const completed = (0, import_react4.useRef)(false);
      (0, import_react4.useEffect)(() => {
        if (completed.current || page.screen === "idle" || page.screen === "loading") return;
        completed.current = true;
        const first = claimFirstLoginOffer();
        complete?.();
        if (first && page.connection?.state !== "signed_in") openLoopModule();
      }, [page.screen, page.connection?.state, complete, openLoopModule]);
    }
    function LoopOnboardingGate(props) {
      useFirstLoginOffer(props, props.complete);
      return null;
    }
    function LoopDesktopOnboarding(props) {
      useFirstLoginOffer(props);
      return null;
    }
    function LoopWelcomeNoticeSuppressor({ complete }) {
      (0, import_react4.useEffect)(() => {
        complete();
      }, [complete]);
      return null;
    }
    var LOOP_ONBOARDING_ID = "deepseek-official";
    var LOOP_ONBOARDING_PRIORITY = LOOP_LAUNCHER_PRIORITY;
    var LOOP_DESKTOP_ONBOARDING_ID = "desktop-onboarding";
    var LOOP_DESKTOP_ONBOARDING_PRIORITY = LOOP_LAUNCHER_PRIORITY;

    // client/ui/loop-panels.tsx
    var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
    var import_jsx_runtime4 = require("react/jsx-runtime");
    function loopModuleIcon(moduleId, size = 16) {
      switch (moduleId) {
        case "loop-inbox":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconNewChatOutlineRegular, { size });
        case "loop-connectors":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconLinkOutlineRegular, { size });
        case "loop-projects":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconFolderCloseRegular, { size });
        case "loop-tasks":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconChecklistOutlineRegular, { size });
        case "loop-knowledge":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconDataOutlineRegular, { size });
        case "loop-drive":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconFolderOpenOutlineRegular, { size });
        case "loop-dataspaces":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconDatabaseOutlineRegular, { size });
        case "loop-capabilities":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSkillOutlineRegular, { size });
        case "loop-contacts":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconUsersOutlineRegular, { size });
        case "loop-workflows":
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconBranchOutlineRegular, { size });
        default:
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconDataOutlineRegular, { size });
      }
    }
    function LoopPanelIcon({ size, moduleId }) {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "span",
        {
          style: { width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" },
          "aria-hidden": "true",
          children: loopModuleIcon(moduleId, size)
        }
      );
    }
    function loopPanelIconComponent(moduleId) {
      return function BoundLoopPanelIcon(props) {
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(LoopPanelIcon, { ...props, moduleId });
      };
    }
    function LoopMoreMenu({
      usePanelInfo,
      openModule,
      onDismiss,
      t
    }) {
      const activePanelId = usePanelInfo((info) => info.activePanelId);
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, { children: LOOP_MODULES.filter((module2) => module2.placement === "more").map((module2) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.MenuItemButton,
        {
          icon: loopModuleIcon(module2.id),
          current: activePanelId === module2.id,
          onSelect: () => {
            onDismiss();
            openModule(module2.id);
          },
          children: t(module2.label)
        },
        module2.id
      )) });
    }

    // client/ui/human-task-panel.tsx
    var import_react5 = require("react");
    var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
    var import_jsx_runtime5 = require("react/jsx-runtime");
    function watchHumanTask(selected, remote, publish) {
      let session;
      let stream;
      let remove;
      const clear = () => {
        const off2 = remove;
        remove = void 0;
        off2?.();
      };
      const update = () => {
        const id2 = selected.getSnapshot().key;
        if (session === id2) return;
        session = id2;
        stream?.abort();
        clear();
        if (!id2 || !remote.humanTaskEvents) return;
        const controller = new AbortController();
        stream = controller;
        const events = remote.humanTaskEvents.bind(remote);
        void (async () => {
          while (!controller.signal.aborted) {
            try {
              for await (const frame of events({ sessionId: id2 }, controller.signal)) {
                if (controller.signal.aborted) return;
                clear();
                if (frame.state !== "idle") {
                  remove = publish({ kind: "loop-personal-task", key: frame.requestId, sessionId: id2, frame }, async () => {
                  });
                }
              }
            } catch {
            }
            if (!controller.signal.aborted) {
              clear();
              await new Promise((resolve) => setTimeout(resolve, 2e3));
            }
          }
        })();
      };
      const off = selected.subscribe(update);
      update();
      return () => {
        off();
        stream?.abort();
        clear();
      };
    }
    function HumanTaskPanel({ matched, remote, t }) {
      const { sessionId, frame } = matched;
      const [failure2, setFailure] = (0, import_react5.useState)("");
      const [resourceUrl, setResourceUrl] = (0, import_react5.useState)("");
      const decide = async (decision) => {
        try {
          const result = await remote.decideHumanTask?.({ sessionId, requestId: frame.requestId, ...decision === "select" ? { decision, resourceUrl } : { decision } });
          if (!result?.ok) setFailure(frame.requestId);
        } catch {
          setFailure(frame.requestId);
        }
      };
      if (frame.state === "pick") return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: loop_ui_default.taskConsent, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { onClick: () => openExternal(frame.browseUrl, { protocol: window.location.protocol, open: window.open.bind(window) }), children: t(frame.family === "project" ? "human.pickProject" : "human.pickKB") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
          t("human.pasteLink"),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "url", value: resourceUrl, onChange: (event) => setResourceUrl(event.target.value) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "primary", disabled: !resourceUrl.trim(), onClick: () => void decide("select"), children: t("human.shareLink") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { onClick: () => void decide("cancel"), children: t("human.cancel") }),
        failure2 === frame.requestId && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: t("human.invalidLink") })
      ] });
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: loop_ui_default.taskConsent, "aria-label": t("human.title"), children: [
        frame.agentDenied && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("human.agentDenied") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: frame.summary }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { children: [
          t("human.title"),
          " \xB7 ",
          frame.action,
          frame.manage && " \xB7 " + t("human.manage")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: frame.resources.length ? frame.resources.join(" \xB7 ") : t("human.all") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: frame.state === "browser" ? t("human.reusable") : t("human.expires", { date: new Date(frame.expiresAt).toLocaleString() }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "primary", onClick: () => {
            if (frame.state === "reuse") void decide("reuse");
            else if (!openExternal(frame.loginUrl, { protocol: window.location.protocol, open: window.open.bind(window) })) setFailure(frame.requestId);
          }, children: t(frame.state === "reuse" ? "human.reuse" : "human.open") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { onClick: () => {
            void decide("cancel");
          }, children: t("human.cancel") })
        ] }),
        failure2 === frame.requestId && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: t("human.failed") })
      ] });
    }

    // client/ui/loop-settings.tsx
    var import_react6 = require("react");
    var import_jsx_runtime6 = require("react/jsx-runtime");
    function LoopSettings({ remote, t }) {
      const [enabled, setEnabled] = (0, import_react6.useState)(false);
      const [busy, setBusy] = (0, import_react6.useState)(true);
      const [failed, setFailed] = (0, import_react6.useState)(false);
      (0, import_react6.useEffect)(() => {
        const controller = new AbortController();
        void remote.getSyncPreferences({}, controller.signal).then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok) {
            setFailed(true);
            return;
          }
          setEnabled(result.value.uploadDisconnectedHistory);
        }).catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        }).finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
        return () => controller.abort();
      }, [remote]);
      const save = async (value) => {
        setBusy(true);
        setFailed(false);
        try {
          const result = await remote.setSyncPreferences({ uploadDisconnectedHistory: value });
          if (!result.ok) {
            setFailed(true);
            return;
          }
          setEnabled(result.value.uploadDisconnectedHistory);
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      };
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              type: "checkbox",
              checked: enabled,
              disabled: busy,
              onChange: (event) => {
                void save(event.target.checked);
              }
            }
          ),
          " ",
          t("settings.uploadDisconnectedHistory")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("settings.uploadDisconnectedHistoryHint") }),
        failed && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "alert", children: t("settings.uploadPreferencesError") })
      ] });
    }

    // client/ui/login-dialog-controller.ts
    var LoginDialogController = class {
      constructor(page, account, sync, models, openLoop, prepareExternal = () => null) {
        this.page = page;
        this.account = account;
        this.sync = sync;
        this.models = models;
        this.openLoop = openLoop;
        this.prepareExternal = prepareExternal;
        this.serverRevision = page.store.getSnapshot().serverRevision;
        this.unsubscribe = page.store.subscribe(() => {
          const state = page.store.getSnapshot();
          if (state.serverBusy || state.screen === "loading" || this.serverRevision === state.serverRevision) return;
          this.serverRevision = state.serverRevision;
          sync.dispose();
          if (this.store.getSnapshot().open) void sync.open();
        });
      }
      page;
      account;
      sync;
      models;
      openLoop;
      prepareExternal;
      store = createSnapshotStore({ open: false, busy: false });
      generation = 0;
      serverRevision;
      unsubscribe;
      open = () => {
        if (this.store.getSnapshot().open) return;
        this.page.changeServerUrl(this.page.store.getSnapshot().serverUrl ?? "");
        this.store.set({ open: true, busy: false });
        if (this.page.store.getSnapshot().screen === "ready") void this.page.refreshConnection();
        else void this.page.open();
        void this.sync.open();
        void this.models.open();
      };
      close = () => {
        this.generation += 1;
        this.store.set({ open: false, busy: false });
      };
      login = async (accessToken) => {
        const dialog = this.store.getSnapshot();
        const sync = this.sync.store.getSnapshot();
        if (!dialog.open || dialog.busy || sync.disconnecting || sync.busy !== null) return;
        const external = accessToken ? null : this.prepareExternal();
        const generation = ++this.generation;
        this.store.set({ open: true, busy: true });
        const before = this.page.store.getSnapshot();
        const normalize = (value) => normalizedLoopServerUrl(value)?.replace(/\/+$/u, "");
        const changingServer = !before.serverUrl || normalize(before.serverDraft) !== normalize(before.serverUrl);
        const recovering = !accessToken && !changingServer && this.account.store.getSnapshot().error?.code === "loop-host/credential-unavailable";
        if (!recovering) this.account.reset();
        if (changingServer) {
          await this.page.saveServer();
        }
        if (generation !== this.generation) {
          external?.close();
          return;
        }
        this.store.set({ open: true, busy: false });
        const page = this.page.store.getSnapshot();
        if (page.serverError !== null || page.serverUrl === null || page.serverRevision === "" || accessToken && normalize(page.serverUrl) !== normalize(before.serverDraft)) {
          external?.close();
          return;
        }
        if (recovering) this.account.recover(external);
        else this.account.start(external, accessToken);
      };
      authorizePages = () => {
        this.account.start(this.prepareExternal());
      };
      logout = () => {
        if (this.store.getSnapshot().busy || this.page.store.getSnapshot().serverBusy || this.sync.store.getSnapshot().busy !== null) return;
        this.account.reset();
        this.page.suspend();
        const state = this.sync.store.getSnapshot();
        if (state.disconnecting && state.challenge !== null) {
          if (state.challengeOpened) this.sync.actions.continueAfterAuth();
          else this.sync.actions.openChallenge();
        } else {
          this.sync.actions.disconnect();
        }
      };
      dispose() {
        this.close();
        this.unsubscribe();
      }
    };

    // client/ui/loop-login-dialog.tsx
    var import_react8 = require("react");
    var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");

    // client/ui/loop-brand.ts
    var import_react7 = require("react");

    // client/ui/loop-brand-assets.ts
    var LOOP_LOGO_BLACK_SVG = String.raw`<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="180" height="180" rx="40" fill="#1A1A1A"/>
    <path d="M128.977 69.1527C126.195 61.7596 115.429 53.3345 108.371 49.3291C113.915 52.0303 136.663 65.8381 138.841 67.1794C141.563 68.856 149.563 72.8863 151.031 84.6004C153.231 102.147 144.319 109.721 135.939 118.167C132.485 121.649 120.448 129.907 109.966 137.919C107.429 140.278 105.62 141.393 104.684 142.055C104.489 142.213 104.294 142.37 104.102 142.527C104.223 142.394 104.419 142.243 104.684 142.055C106.362 140.701 108.14 139.314 109.966 137.919C113.268 134.847 117.802 129.669 123.248 120.639C133.85 103.058 133.814 82.0064 128.977 69.1527Z" fill="url(#paint0_linear_40_55)"/>
    <path d="M92.7332 65.7261C114.222 67.1654 119.667 59.2454 141.456 68.8617L131.122 61.1056L121.274 53.1861C114.393 48.2637 105.211 45.741 101.389 45.396C77.0057 43.1953 78.3943 41.3603 64.7323 37.809C55.042 35.2902 49.3924 37.5869 44.6888 46.5394C41.7219 53.8012 33.1562 75.458 33.1562 75.458C33.1562 75.458 39.68 62.9574 51.6728 59.9624C63.6656 56.9674 75.3029 64.5586 92.7332 65.7261Z" fill="url(#paint1_linear_40_55)"/>
    <path d="M33.0699 75.343L44.8795 46.1377C41.3283 56.6302 37.4934 63.9775 45.3607 85.801C49.7702 98.0327 54.7711 104.221 64.5163 113.896C74.2616 123.571 89.7194 125.975 103.951 127.069C118.183 128.162 127.763 124.115 140.155 113.896L137.084 117.277C137.084 117.277 128.65 125.976 123.487 130.375C118.324 134.774 113.086 138.49 113.086 138.49C103.951 143.824 94.1747 146.006 80.9754 144.261C61.0439 141.625 51.3586 135.353 40.5212 120.384C30.5554 106.62 29.8839 93.2873 33.0699 75.343Z" fill="url(#paint2_linear_40_55)"/>
    <defs>
    <linearGradient id="paint0_linear_40_55" x1="126.703" y1="50.3211" x2="126.703" y2="142.527" gradientUnits="userSpaceOnUse">
    <stop stop-color="#888888"/>
    <stop offset="1" stop-color="white"/>
    </linearGradient>
    <linearGradient id="paint1_linear_40_55" x1="31.7171" y1="61.5004" x2="137.7" y2="59.7862" gradientUnits="userSpaceOnUse">
    <stop stop-color="#888888"/>
    <stop offset="0.639423" stop-color="white"/>
    </linearGradient>
    <linearGradient id="paint2_linear_40_55" x1="31.3711" y1="114.97" x2="86.6876" y2="138.08" gradientUnits="userSpaceOnUse">
    <stop offset="0.264423" stop-color="white"/>
    <stop offset="1" stop-color="#888888"/>
    </linearGradient>
    </defs>
    </svg>
    `;
    var LOOP_LOGO_WHITE_SVG = String.raw`<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="180" height="180" rx="40" fill="white"/>
    <path d="M128.977 69.1527C126.195 61.7596 115.429 53.3345 108.371 49.3291C113.915 52.0303 136.663 65.8381 138.841 67.1794C141.563 68.856 149.563 72.8863 151.031 84.6004C153.231 102.147 144.319 109.721 135.939 118.167C132.485 121.649 120.448 129.907 109.966 137.919C107.429 140.278 105.62 141.393 104.684 142.055C104.489 142.213 104.294 142.37 104.102 142.527C104.223 142.394 104.419 142.243 104.684 142.055C106.362 140.701 108.14 139.314 109.966 137.919C113.268 134.847 117.802 129.669 123.248 120.639C133.85 103.058 133.814 82.0064 128.977 69.1527Z" fill="url(#paint0_linear_24_100)"/>
    <path d="M92.7332 65.7261C114.222 67.1654 119.667 59.2454 141.456 68.8617L131.122 61.1056L121.274 53.1861C114.393 48.2637 105.211 45.741 101.389 45.396C77.0057 43.1953 78.3943 41.3603 64.7323 37.809C55.042 35.2902 49.3924 37.5869 44.6888 46.5394C41.7219 53.8012 33.1562 75.458 33.1562 75.458C33.1562 75.458 39.68 62.9574 51.6728 59.9624C63.6656 56.9674 75.3029 64.5586 92.7332 65.7261Z" fill="url(#paint1_linear_24_100)"/>
    <path d="M33.0699 75.343L44.8795 46.1377C41.3283 56.6302 37.4934 63.9775 45.3607 85.801C49.7702 98.0327 54.7711 104.221 64.5163 113.896C74.2616 123.571 89.7194 125.975 103.951 127.069C118.183 128.162 127.763 124.115 140.155 113.896L137.084 117.277C137.084 117.277 128.65 125.976 123.487 130.375C118.324 134.774 113.086 138.49 113.086 138.49C103.951 143.824 94.1747 146.006 80.9753 144.261C61.0439 141.625 51.3586 135.353 40.5212 120.384C30.5554 106.62 29.8839 93.2873 33.0699 75.343Z" fill="url(#paint2_linear_24_100)"/>
    <defs>
    <linearGradient id="paint0_linear_24_100" x1="126.703" y1="50.3211" x2="126.703" y2="142.527" gradientUnits="userSpaceOnUse">
    <stop stop-color="#666666"/>
    <stop offset="1" stop-color="#DDDDDD"/>
    </linearGradient>
    <linearGradient id="paint1_linear_24_100" x1="31.7171" y1="61.5004" x2="137.7" y2="59.7862" gradientUnits="userSpaceOnUse">
    <stop stop-color="#666666"/>
    <stop offset="1" stop-color="#DDDDDD"/>
    </linearGradient>
    <linearGradient id="paint2_linear_24_100" x1="35.2998" y1="110.216" x2="103.092" y2="136.916" gradientUnits="userSpaceOnUse">
    <stop stop-color="#CCCCCC"/>
    <stop offset="1" stop-color="#888888"/>
    </linearGradient>
    </defs>
    </svg>
    `;
    var dataURL = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    var LOOP_LOGO_BLACK_DATA_URL = dataURL(LOOP_LOGO_BLACK_SVG);
    var LOOP_LOGO_WHITE_DATA_URL = dataURL(LOOP_LOGO_WHITE_SVG);
    function loopLogoDataURL(darkTheme) {
      return darkTheme ? LOOP_LOGO_WHITE_DATA_URL : LOOP_LOGO_BLACK_DATA_URL;
    }

    // client/ui/loop-brand.ts
    var DARK_THEME_ATTRIBUTE = "data-ds-dark-theme";
    function isDarkTheme() {
      return typeof document !== "undefined" && document.body?.hasAttribute(DARK_THEME_ATTRIBUTE) === true;
    }
    function subscribeTheme(listener) {
      if (typeof MutationObserver === "undefined" || typeof document === "undefined" || document.body === null) {
        return () => {
        };
      }
      const observer = new MutationObserver(listener);
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: [DARK_THEME_ATTRIBUTE]
      });
      return () => {
        observer.disconnect();
      };
    }
    function LoopBrandMark({ size, className }) {
      const darkTheme = (0, import_react7.useSyncExternalStore)(subscribeTheme, isDarkTheme, () => false);
      return (0, import_react7.createElement)("img", {
        alt: "Loop",
        className,
        "data-loop-brand-mark": "",
        "data-loop-brand-theme": darkTheme ? "dark" : "light",
        draggable: false,
        height: size,
        src: loopLogoDataURL(darkTheme),
        style: { height: size, width: size },
        width: size
      });
    }

    // client/ui/loop-login-dialog.tsx
    var import_jsx_runtime7 = require("react/jsx-runtime");
    function LoopLoginDialog({
      useLoginDialog,
      useGlobalPage,
      useProjectSync,
      useAccountConnection,
      useModels,
      useSharedData,
      dialog,
      pageActions,
      t
    }) {
      const state = useLoginDialog((value) => value);
      const page = useGlobalPage((value) => value);
      const sync = useProjectSync((value) => value);
      const connection = useAccountConnection((value) => value);
      const serverId = (0, import_react8.useId)();
      const hintId = (0, import_react8.useId)();
      const [method2, setMethod] = (0, import_react8.useState)("browser");
      const [token, setToken] = (0, import_react8.useState)("");
      const tokenId = (0, import_react8.useId)();
      (0, import_react8.useEffect)(() => {
        if (!state.open) {
          setToken("");
          setMethod("browser");
        }
      }, [state.open]);
      if (!state.open) return null;
      const loading = page.serverUrl === null && (page.screen === "idle" || page.screen === "loading");
      const busy = state.busy || page.serverBusy || sync.busy !== null;
      const signedIn = page.connection?.state === "signed_in";
      const canSignOut = signedIn || Boolean(page.connection?.accountPrincipal) || sync.disconnecting;
      const authenticating = ["waiting", "connecting", "recovering"].includes(connection.phase);
      const canRecover = connection.error?.code === "loop-host/credential-unavailable" && page.serverUrl !== null && normalizedLoopServerUrl(page.serverDraft)?.replace(/\/+$/u, "") === normalizedLoopServerUrl(page.serverUrl)?.replace(/\/+$/u, "");
      const error = page.serverError ?? (sync.disconnecting ? sync.error : null) ?? connection.error;
      const status = sync.disconnecting ? "login.signingOut" : loading ? "login.checking" : authenticating ? "login.signingIn" : page.connection?.state === "unavailable" ? "login.statusUnavailable" : signedIn ? "login.signedIn" : page.connection?.state === "needs_auth" ? "login.expired" : "login.signedOut";
      const logoutLabel = sync.disconnecting ? sync.challenge !== null ? sync.challengeOpened ? "settings.disconnectCheck" : "settings.disconnectConfirm" : "settings.disconnectFinish" : "login.logout";
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives6.Modal, { open: true, title: t("login.title"), closeLabel: t("dialog.close"), className: loop_ui_default.loginDialog, onClose: dialog.close, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("form", { className: loop_ui_default.loginForm, noValidate: true, onSubmit: (event) => {
        event.preventDefault();
        if (method2 === "token") {
          void dialog.login(token.trim());
          setToken("");
        } else {
          void dialog.login();
        }
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: loop_ui_default.loginIntro, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: loop_ui_default.loginBrand, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(LoopBrandMark, { size: 32 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("login.description") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "tablist", "aria-label": t("login.method"), className: loop_ui_default.loginTabs, children: ["browser", "token"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            role: "tab",
            type: "button",
            id: tokenId + item,
            "aria-selected": method2 === item,
            "aria-controls": tokenId + "panel",
            disabled: busy || authenticating || sync.disconnecting,
            onKeyDown: (event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next = event.key === "Home" ? "browser" : event.key === "End" ? "token" : item === "browser" ? "token" : "browser";
                setToken("");
                setMethod(next);
                document.getElementById(tokenId + next)?.focus();
              }
            },
            tabIndex: method2 === item ? 0 : -1,
            onClick: () => {
              setToken("");
              setMethod(item);
            },
            children: item === "browser" ? t("login.browser") : "Access Token"
          },
          item
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "tabpanel", id: tokenId + "panel", "aria-labelledby": tokenId + method2, className: loop_ui_default.loginField, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: serverId, children: t("global.serverLabel") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            import_dsh_client_ui_primitives6.Input,
            {
              id: serverId,
              type: "url",
              autoComplete: "url",
              spellCheck: false,
              value: page.serverDraft,
              placeholder: t("global.serverPlaceholder"),
              disabled: busy || loading || sync.disconnecting,
              "aria-describedby": hintId,
              "aria-invalid": page.serverError?.code === "loop/server-url-invalid",
              onChange: (event) => {
                setToken("");
                pageActions.changeServerUrl(event.currentTarget.value);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { id: hintId, className: loop_ui_default.hint, children: t("login.rememberServer") }),
          method2 === "token" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: tokenId, children: "Access Token" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              import_dsh_client_ui_primitives6.Input,
              {
                id: tokenId,
                type: "password",
                autoComplete: "off",
                spellCheck: false,
                value: token,
                disabled: busy || signedIn || authenticating || sync.disconnecting,
                onChange: (event) => setToken(event.currentTarget.value)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: loop_ui_default.hint, children: t("login.tokenHint") })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
          "div",
          {
            className: loop_ui_default.loginStatus,
            role: "status",
            "aria-live": "polite",
            "data-connected": status === "login.signedIn",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: loop_ui_default.loginStatusDot, "aria-hidden": "true" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: t(status) }),
                signedIn && page.connection?.deviceOnly && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("login.personalPage") }),
                signedIn && page.serverUrl !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: loop_ui_default.loginCurrentServer, children: page.serverUrl })
              ] })
            ]
          }
        ),
        sync.disconnecting && sync.challenge !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: loop_ui_default.hint, children: t("login.logoutPending") }),
        error !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: error.code === "loop/no-models" ? loop_ui_default.warning : loop_ui_default.error, role: "alert", children: error.code === "loop/no-models" ? t("onboarding.noModels") : failureText(t, error) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: loop_ui_default.loginActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", disabled: busy || loading || !canSignOut, onClick: dialog.logout, children: t(logoutLabel) }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives6.Button, { type: "submit", variant: "primary", disabled: busy || loading || sync.disconnecting || method2 === "token" && (signedIn || authenticating || !token.trim()) || page.serverDraft.trim() === "", children: t(state.busy || page.serverBusy ? "global.serverSaving" : canRecover ? "onboarding.recoverLogin" : signedIn && page.connection?.deviceOnly && method2 === "browser" ? "login.authorizePages" : "launcher.signIn") })
        ] }),
        signedIn && !sync.disconnecting && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: loop_ui_default.hint, children: t("login.logoutHint") })
      ] }) });
    }

    // client/ui/model-controller.ts
    var INITIAL_MODEL_STATE = Object.freeze({
      screen: "idle",
      status: null,
      readiness: { kind: "loading" },
      busy: null,
      error: null,
      disconnectConnectionId: "",
      selection: null,
      selectionLoading: false,
      selectionError: null
    });
    function failure(result) {
      return { code: result.error.code, message: result.error.message };
    }
    async function loopProviderRoute(workspaceId, connectionId) {
      const bytes = new TextEncoder().encode(loopModelRouteInput(workspaceId, connectionId));
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      return loopModelRouteFromDigest(hex);
    }
    function catalogHasModel(catalog, providerId, modelId) {
      if (!catalog.routableProviders.includes(providerId)) return false;
      return catalog.groups.some((group) => group.id === providerId && group.models.some((model) => model.id === modelId));
    }
    function modelChoiceKey(choice) {
      return `${choice.providerId}\0${choice.modelId}`;
    }
    function modelScopeKey(scope) {
      return JSON.stringify([
        scope.serverUrl,
        scope.serverRevision,
        scope.workspaceId,
        scope.sharedWorkspaceId,
        scope.sharedPrincipalId,
        scope.authEpoch
      ]);
    }
    function loopAuthority(scope, status) {
      const sharedAbsent = scope.sharedWorkspaceId === null && scope.sharedPrincipalId === null && scope.authEpoch === null;
      if (sharedAbsent) return "host-fallback";
      if (scope.workspaceId === null || scope.sharedWorkspaceId === null || scope.sharedWorkspaceId !== scope.workspaceId) {
        return "workspace-mismatch";
      }
      const principal = status?.accountPrincipal?.trim() ?? "";
      if (principal === "" || scope.sharedPrincipalId === null || scope.authEpoch === null || scope.sharedPrincipalId !== principal) {
        return "account-mismatch";
      }
      return "ready";
    }
    function completeLoopScope(scope, status) {
      const principal = status?.accountPrincipal?.trim() ?? "";
      const authority = loopAuthority(scope, status);
      return authority !== "workspace-mismatch" && authority !== "account-mismatch" && principal !== "" && scope.serverUrl !== null && scope.serverRevision !== "" && scope.workspaceId !== null;
    }
    function modelReadinessScopeKey(scope, status) {
      return JSON.stringify([modelScopeKey(scope), status?.accountPrincipal ?? null]);
    }
    async function availableModelChoices(status, catalog, scope, routeForConnection) {
      const choices = [];
      const seen = /* @__PURE__ */ new Set();
      const push = (choice) => {
        const key = modelChoiceKey(choice);
        if (seen.has(key)) return;
        seen.add(key);
        choices.push(choice);
      };
      for (const group of catalog.groups) {
        if (group.id.startsWith(LOOP_MODEL_ROUTE_PREFIX) || !catalog.routableProviders.includes(group.id)) continue;
        for (const model of group.models) {
          push({
            kind: "external",
            providerId: group.id,
            providerName: group.name,
            modelId: model.id,
            modelName: model.name
          });
        }
      }
      const authority = loopAuthority(scope, status);
      if (status?.state !== "active" || scope.workspaceId === null || (status.accountPrincipal?.trim() ?? "") === "" || authority === "workspace-mismatch" || authority === "account-mismatch") return choices;
      for (const connection of status.connections) {
        if (connection.status !== "active" || connection.workspaceId !== scope.workspaceId || connection.models.length === 0) continue;
        let providerId;
        try {
          providerId = await routeForConnection(connection.workspaceId, connection.connectionId);
        } catch {
          continue;
        }
        const group = catalog.groups.find((item) => item.id === providerId && catalog.routableProviders.includes(item.id));
        if (group === void 0) continue;
        for (const descriptor of connection.models) {
          const modelId = loopModelPickerID(descriptor);
          const model = group.models.find((item) => item.id === modelId);
          if (model === void 0) continue;
          push({
            kind: "loop",
            connectionId: connection.connectionId,
            workspaceId: connection.workspaceId,
            providerId,
            providerName: group.name,
            modelId,
            modelName: model.name
          });
        }
      }
      return choices;
    }
    async function resolveModelReadiness(input) {
      const { status, catalog, requested, scope, routeForConnection, statusFailure } = input;
      const scopeKey = modelReadinessScopeKey(scope, status);
      if (catalog === null) return { kind: "catalog-unavailable", error: null };
      if (requested === null || !requested.projectionReady) return { kind: "loading" };
      const selection = requested.selection;
      const exact = catalogHasModel(catalog, selection.provider, selection.model);
      const loopSelection = selection.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX);
      if (!loopSelection && exact) {
        return {
          kind: "external-ready",
          scopeKey,
          sessionId: requested.sessionId,
          selectionScope: requested.scope,
          selectionBasis: requested.basis,
          providerId: selection.provider,
          modelId: selection.model
        };
      }
      const choices = await availableModelChoices(status, catalog, scope, routeForConnection);
      if (!loopSelection) {
        if (choices.length > 0) {
          return {
            kind: "selection-required",
            scopeKey,
            sessionId: requested.sessionId,
            selectionScope: requested.scope,
            selectionBasis: requested.basis,
            reason: "invalid-selection",
            providerId: selection.provider,
            modelId: selection.model,
            choices
          };
        }
      } else if (status?.state === "active" && !completeLoopScope(scope, status)) {
        return {
          kind: "scope-required",
          scopeKey,
          reason: scope.workspaceId === null ? "workspace" : "account",
          choices
        };
      } else if (status?.state === "active") {
        const currentChoice = choices.find((choice) => choice.kind === "loop" && choice.providerId === selection.provider && choice.modelId === selection.model);
        if (exact && currentChoice !== void 0) {
          return {
            kind: "loop-ready",
            scopeKey,
            sessionId: requested.sessionId,
            selectionScope: requested.scope,
            selectionBasis: requested.basis,
            connectionId: currentChoice.connectionId,
            workspaceId: currentChoice.workspaceId,
            providerId: selection.provider,
            modelId: selection.model
          };
        }
        if (choices.length > 0) {
          return {
            kind: "selection-required",
            scopeKey,
            sessionId: requested.sessionId,
            selectionScope: requested.scope,
            selectionBasis: requested.basis,
            reason: exact ? "workspace-mismatch" : "invalid-selection",
            providerId: selection.provider,
            modelId: selection.model,
            choices
          };
        }
      }
      if (choices.length > 0) {
        return {
          kind: "selection-required",
          scopeKey,
          sessionId: requested.sessionId,
          selectionScope: requested.scope,
          selectionBasis: requested.basis,
          reason: "invalid-selection",
          providerId: selection.provider,
          modelId: selection.model,
          choices
        };
      }
      if (status === null) return { kind: "error", error: statusFailure };
      if (status.state === "needs_auth") {
        return { kind: "needs-auth", reason: status.reason ?? "" };
      }
      if (status.state === "error" || status.state === "unavailable") {
        return {
          kind: "error",
          error: { code: "loop/model-state", message: status.reason ?? "" }
        };
      }
      const active = status.connections.filter((connection) => connection.status === "active");
      if (active.length > 0 && active.every((connection) => connection.models.length === 0)) {
        return { kind: "no-models", reason: status.reason ?? "" };
      }
      return {
        kind: "route-missing",
        reason: status.reason ?? ""
      };
    }
    async function resolveSelectedModel(catalog, loopStatus, requested, routeForConnection = loopProviderRoute) {
      const provider = catalog.groups.find((group) => group.id === requested.selection.provider);
      const model = provider?.models.find((item) => item.id === requested.selection.model);
      const available = provider !== void 0 && model !== void 0 && catalog.routableProviders.includes(provider.id);
      const base = {
        sessionId: requested.sessionId,
        scope: requested.scope,
        basis: requested.basis,
        providerId: requested.selection.provider,
        providerName: provider?.name ?? requested.selection.provider,
        modelId: requested.selection.model,
        modelName: model?.name ?? requested.selection.model,
        available
      };
      if (!requested.selection.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)) {
        return {
          ...base,
          source: "external",
          billing: "provider-account"
        };
      }
      const parsed = parseLoopModelPickerID(requested.selection.model);
      if (parsed === null || loopStatus === null) {
        return { ...base, source: "unknown", billing: "unknown" };
      }
      const routes = /* @__PURE__ */ new Map();
      await Promise.all(loopStatus.connections.map(async (connection2) => {
        routes.set(
          connection2.connectionId,
          await routeForConnection(connection2.workspaceId, connection2.connectionId)
        );
      }));
      const connection = loopStatus.connections.find((item) => routes.get(item.connectionId) === requested.selection.provider);
      if (connection === void 0) {
        return { ...base, source: "unknown", billing: "unknown" };
      }
      const matches = connection.models.filter((item) => loopModelPickerID(item) === requested.selection.model && item.wireApi === parsed.wireApi && item.source === parsed.source && (item.providerId ?? "") === parsed.providerId && item.id === parsed.modelId);
      if (matches.length !== 1) {
        return { ...base, source: "unknown", billing: "unknown" };
      }
      const source = matches[0].source;
      return {
        ...base,
        source,
        billing: source === "loop_personal" ? "personal-provider" : source === "loop_proxy" ? "organization" : "loop-hosted"
      };
    }
    var LoopModelController = class {
      store;
      actions;
      remote;
      loadModelCatalog;
      subscribeCatalogEvents;
      routeForConnection;
      scopeSources;
      selectModelAction;
      autoSelectAfterLogin;
      automaticSelectionAttempt = "";
      automaticSelectionScheduled = false;
      catalogReadTimeoutMs;
      generation = 0;
      readinessRevision = 0;
      request = null;
      activeSession = null;
      unsubscribeActive;
      unsubscribeProjection;
      unsubscribeScopePage;
      unsubscribeScopeIdentity;
      unsubscribeCatalogEvents;
      binding = null;
      catalog = null;
      catalogFailure = null;
      loopStatus = null;
      statusFailure = null;
      bindingRevision = 0;
      catalogGeneration = 0;
      catalogEventPending = false;
      catalogEventReset = false;
      catalogEventRunning = false;
      catalogEventDrainScheduled = false;
      catalogEventRequest = null;
      selectionRevision = 0;
      // A cancelled/failed write may already have changed the Host's live default.
      // A catalog read alone cannot prove that change reached its profile file.
      defaultSaveUnknown = false;
      scope = {
        serverUrl: null,
        serverRevision: "",
        workspaceId: null,
        sharedWorkspaceId: null,
        sharedPrincipalId: null,
        authEpoch: null
      };
      constructor(options) {
        this.autoSelectAfterLogin = options.autoSelectAfterLogin ?? false;
        this.remote = options.remote;
        this.loadModelCatalog = options.loadModelCatalog;
        this.subscribeCatalogEvents = options.subscribeCatalogEvents;
        this.routeForConnection = options.routeForConnection ?? loopProviderRoute;
        this.scopeSources = options.scopeSources;
        this.selectModelAction = options.selectModel;
        this.catalogReadTimeoutMs = options.catalogReadTimeoutMs ?? 15e3;
        this.scope = this.readScope();
        this.store = createSnapshotStore(INITIAL_MODEL_STATE);
        this.actions = {
          open: () => {
            void this.open();
          },
          select: (choice) => {
            void this.select(choice);
          },
          suspend: () => {
            this.suspend();
          },
          refresh: () => {
            void this.refresh();
          },
          disconnect: (connectionId) => {
            void this.disconnect(connectionId);
          }
        };
      }
      start(activeSession) {
        this.unsubscribeActive?.();
        this.activeSession = activeSession;
        this.unsubscribeActive = activeSession.subscribe(() => {
          this.trackActiveSession();
        });
        this.unsubscribeCatalogEvents?.();
        this.unsubscribeCatalogEvents = this.subscribeCatalogEvents?.((change) => {
          this.onCatalogEvent(change);
        });
        this.subscribeScope();
        this.trackActiveSession();
        if (this.autoSelectAfterLogin) void this.open(true);
      }
      async open(forceStatus = false) {
        if (this.store.getSnapshot().busy !== null) return;
        const external = await this.probeExternalSelection();
        if (external === "stale") return;
        if (!forceStatus && this.defaultSaveUnknown && this.catalog !== null && !this.catalog.default.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)) return;
        if (external === "ready") {
          void this.read("read", this.remote.modelStatus, {});
          return;
        }
        await this.read("read", this.remote.modelStatus, {});
      }
      dispose() {
        this.generation += 1;
        this.readinessRevision += 1;
        this.selectionRevision += 1;
        this.request?.abort();
        this.request = null;
        this.unsubscribeActive?.();
        this.unsubscribeProjection?.();
        this.unsubscribeScopePage?.();
        this.unsubscribeScopeIdentity?.();
        this.unsubscribeCatalogEvents?.();
        this.unsubscribeActive = void 0;
        this.unsubscribeProjection = void 0;
        this.unsubscribeScopePage = void 0;
        this.unsubscribeScopeIdentity = void 0;
        this.unsubscribeCatalogEvents = void 0;
        this.activeSession = null;
        this.binding = null;
        this.catalog = null;
        this.catalogFailure = null;
        this.loopStatus = null;
        this.statusFailure = null;
        this.catalogEventPending = false;
        this.catalogEventReset = false;
        this.catalogEventRequest?.abort();
        this.catalogEventRequest = null;
        this.store.set(INITIAL_MODEL_STATE);
      }
      readScope() {
        const page = this.scopeSources?.globalPage.getSnapshot();
        const shared = this.scopeSources?.sharedData.getSnapshot();
        const connection = page?.connection;
        const workspaceId = connection === void 0 ? page?.loopWorkspaceId ?? null : connection.workspaceId ?? null;
        const identity = connection === void 0 ? shared?.identity ?? null : connection.state === "signed_in" && connection.workspaceId && connection.accountPrincipal ? {
          workspaceId: connection.workspaceId,
          principalId: connection.accountPrincipal,
          authEpoch: connection.grantId ?? page.serverRevision
        } : null;
        return {
          serverUrl: page?.serverUrl ?? null,
          serverRevision: page?.serverRevision ?? "",
          workspaceId,
          // Preserve a present identity even while its workspace persistence is
          // lagging behind page.loopWorkspaceId. The mismatch itself is authority.
          sharedWorkspaceId: identity?.workspaceId ?? null,
          sharedPrincipalId: identity?.principalId ?? null,
          authEpoch: identity?.authEpoch ?? null
        };
      }
      subscribeScope() {
        if (this.scopeSources === void 0) return;
        this.unsubscribeScopePage?.();
        this.unsubscribeScopeIdentity?.();
        const update = () => {
          this.updateScope();
        };
        this.unsubscribeScopePage = this.scopeSources.globalPage.subscribe(update);
        this.unsubscribeScopeIdentity = this.scopeSources.sharedData.subscribe(update);
        this.updateScope();
      }
      updateScope() {
        const next = this.readScope();
        if (modelScopeKey(next) === modelScopeKey(this.scope)) return;
        this.scope = next;
        this.generation += 1;
        this.catalogGeneration += 1;
        this.readinessRevision += 1;
        this.selectionRevision += 1;
        this.request?.abort();
        this.catalogEventRequest?.abort();
        this.request = null;
        this.catalogEventRequest = null;
        this.catalogEventPending = false;
        this.catalogEventReset = false;
        this.catalog = null;
        this.catalogFailure = null;
        this.loopStatus = null;
        this.statusFailure = null;
        this.automaticSelectionAttempt = "";
        this.store.set(INITIAL_MODEL_STATE);
        if (this.autoSelectAfterLogin) void this.open(true);
      }
      trackActiveSession() {
        const binding = this.activeSession?.getSnapshot();
        if (binding?.key !== this.binding?.key) this.bindingRevision += 1;
        this.binding = binding ?? null;
        this.unsubscribeProjection?.();
        this.unsubscribeProjection = void 0;
        const projection = binding?.keyedHooks.projection?.("modelSelection");
        if (projection !== void 0) {
          this.unsubscribeProjection = projection.subscribe(() => {
            this.refreshSelection();
            this.refreshCachedReadiness();
          });
        }
        this.refreshSelection();
        this.refreshCachedReadiness();
      }
      refreshSelection() {
        const revision = ++this.selectionRevision;
        const catalog = this.catalog;
        if (catalog === null) {
          this.patch({
            selection: null,
            selectionLoading: this.catalogFailure === null,
            selectionError: this.catalogFailure
          });
          return;
        }
        const requested = this.requestedSelection(catalog);
        this.patch({ selection: null, selectionLoading: true, selectionError: null });
        void resolveSelectedModel(catalog, this.loopStatus, requested, this.routeForConnection).then(
          (selection) => {
            if (revision !== this.selectionRevision) return;
            this.patch({ selection, selectionLoading: false, selectionError: null });
          },
          () => {
            if (revision !== this.selectionRevision) return;
            this.patch({
              selection: null,
              selectionLoading: false,
              selectionError: { code: "loop/model-selection", message: "" }
            });
          }
        );
      }
      requestedSelection(catalog) {
        const sessionId = this.binding?.key;
        const projectionSource = this.binding?.keyedHooks.projection?.("modelSelection");
        const projection = projectionSource?.getSnapshot();
        if (sessionId !== void 0) {
          if (projection === void 0) {
            return {
              sessionId,
              scope: "active-session",
              basis: "default",
              selection: catalog.default,
              projectionReady: false
            };
          }
          if (projection.next !== null) {
            return {
              sessionId,
              scope: "active-session",
              basis: "next",
              selection: projection.next,
              projectionReady: true
            };
          }
          if (projection.lastUsed !== null) {
            return {
              sessionId,
              scope: "active-session",
              basis: "lastUsed",
              selection: projection.lastUsed,
              projectionReady: true
            };
          }
          return {
            sessionId,
            scope: "active-session",
            basis: "default",
            selection: catalog.default,
            projectionReady: true
          };
        }
        return {
          sessionId: null,
          scope: "new-session",
          basis: "default",
          selection: catalog.default,
          projectionReady: true
        };
      }
      suspend() {
        this.nextGeneration();
        this.catalogGeneration += 1;
        this.readinessRevision += 1;
        this.selectionRevision += 1;
        this.catalogEventRequest?.abort();
        this.catalogEventRequest = null;
        this.catalogEventPending = false;
        this.catalogEventReset = false;
        this.catalog = null;
        this.catalogFailure = null;
        this.loopStatus = null;
        this.statusFailure = null;
        this.store.set(INITIAL_MODEL_STATE);
      }
      /** Use the native selection owner; never maintain a separate selected model. */
      ensureSelection() {
        const state = this.store.getSnapshot();
        const readiness = state.readiness;
        if (state.busy !== null || state.error !== null || this.defaultSaveUnknown || this.catalog === null || this.loopStatus?.state !== "active" || !completeLoopScope(this.scope, this.loopStatus)) return;
        if (readiness.kind === "loop-ready" || readiness.kind === "external-ready") {
          this.automaticSelectionAttempt = "";
          return;
        }
        if (readiness.kind !== "selection-required") return;
        const requested = this.requestedSelection(this.catalog);
        if (!requested.projectionReady || requested.sessionId !== readiness.sessionId || requested.selection.provider !== readiness.providerId || requested.selection.model !== readiness.modelId) return;
        if (this.catalog.failures.some((provider) => provider.id === readiness.providerId)) return;
        const hasLoopModels = this.loopStatus.connections.some((connection) => connection.status === "active" && connection.workspaceId === this.scope.workspaceId && connection.models.length > 0);
        if (hasLoopModels && !readiness.choices.some((choice2) => choice2.kind === "loop")) return;
        const previousLoopModel = readiness.providerId.startsWith(LOOP_MODEL_ROUTE_PREFIX) ? readiness.choices.filter((choice2) => choice2.kind === "loop" && choice2.modelId === readiness.modelId) : [];
        const choice = (previousLoopModel.length === 1 ? previousLoopModel[0] : void 0) ?? readiness.choices.find((choice2) => choice2.kind === "loop") ?? readiness.choices[0];
        if (choice === void 0) return;
        const attempt = JSON.stringify([
          readiness.scopeKey,
          requested.sessionId,
          readiness.providerId,
          readiness.modelId,
          modelChoiceKey(choice)
        ]);
        if (this.automaticSelectionAttempt === attempt) return;
        this.automaticSelectionAttempt = attempt;
        void this.select(choice);
      }
      async select(choice) {
        const state = this.store.getSnapshot();
        if (state.busy !== null) return;
        const readiness = state.readiness;
        if (readiness.kind !== "selection-required" && readiness.kind !== "scope-required" || !readiness.choices.some((item) => modelChoiceKey(item) === modelChoiceKey(choice))) {
          this.patch({ error: { code: "loop/model-selection-stale", message: "" } });
          return;
        }
        const generation = this.nextGeneration();
        const bindingRevision = this.bindingRevision;
        const catalogGeneration = this.catalogGeneration;
        const request = this.beginRequest();
        this.patch({ busy: "select", error: null });
        const sessionId = this.binding?.key;
        let result;
        let defaultResult = null;
        let defaultSavePrevious = null;
        if (sessionId !== void 0) {
          if (this.selectModelAction === void 0) {
            this.patch({ busy: null, error: { code: "loop/host-update-required", message: "" } });
            return;
          }
          result = await this.call(
            (signal) => this.selectModelAction({ sessionId, choice }, signal),
            request.signal
          );
        } else {
          if (this.remote.setDefaultModel === void 0) {
            this.patch({ busy: null, error: { code: "loop/host-update-required", message: "" } });
            return;
          }
          const expectedAccountPrincipal = state.status?.accountPrincipal?.trim() ?? "";
          const next = choice.kind === "loop" ? {
            kind: "loop",
            provider: choice.providerId,
            model: choice.modelId,
            connectionId: choice.connectionId ?? "",
            workspaceId: choice.workspaceId ?? "",
            expectedServerRevision: this.scope.serverRevision,
            expectedAccountPrincipal
          } : {
            kind: "external",
            provider: choice.providerId,
            model: choice.modelId
          };
          if (next.kind === "loop" && (next.connectionId === "" || next.workspaceId === "" || next.expectedServerRevision === "" || next.expectedAccountPrincipal === "")) {
            this.patch({ busy: null, error: { code: "loop/model-selection-stale", message: "" } });
            return;
          }
          const previouslyUnknown = this.defaultSaveUnknown;
          defaultSavePrevious = previouslyUnknown;
          this.defaultSaveUnknown = true;
          defaultResult = await this.call(
            (signal) => this.remote.setDefaultModel(next, signal),
            request.signal
          );
          result = defaultResult;
        }
        if (!this.current(generation, request)) return;
        if (catalogGeneration !== this.catalogGeneration) {
          this.patch({ busy: null });
          return;
        }
        if (defaultResult !== null) {
          if (defaultResult.ok) this.defaultSaveUnknown = false;
          else if ([
            "loop-host/model-default-scope",
            "loop-host/model-default-unavailable",
            "loop-host/model-default-readonly",
            "loop-host/model-default-save",
            "loop-host/model-default-not-persisted",
            "loop-host/invalid-request"
          ].includes(defaultResult.error.code)) {
            this.defaultSaveUnknown = defaultSavePrevious ?? false;
          }
        }
        if (bindingRevision !== this.bindingRevision) {
          this.patch({ busy: null });
          return;
        }
        if (defaultResult?.ok && (defaultResult.value.selection.provider !== choice.providerId || defaultResult.value.selection.model !== choice.modelId)) {
          this.defaultSaveUnknown = true;
          this.patch({ busy: null, error: { code: "loop-host/model-default-unknown", message: "" } });
          return;
        }
        if (!result.ok) {
          this.patch({ busy: null, error: defaultResult !== null && this.defaultSaveUnknown ? { code: "loop-host/model-default-unknown", message: "" } : failure(result) });
          return;
        }
        if (choice.kind === "external") {
          await this.probeExternalSelection();
        } else {
          await this.read("read", this.remote.modelStatus, {});
        }
      }
      async refresh() {
        if (this.store.getSnapshot().busy !== null) return;
        const refresh = this.remote.refreshModelConnections ?? this.remote.modelStatus;
        if (refresh === void 0) {
          this.patch({ error: { code: "loop/host-update-required", message: "" } });
          return;
        }
        await this.read(
          this.remote.refreshModelConnections === void 0 ? "read" : "refresh",
          refresh,
          {}
        );
      }
      async disconnect(connectionId) {
        if (this.store.getSnapshot().busy !== null) return;
        if (this.remote.disconnectModelConnection === void 0) {
          this.patch({ error: { code: "loop/host-update-required", message: "" } });
          return;
        }
        this.patch({ disconnectConnectionId: connectionId });
        await this.read(
          "disconnect",
          (_input, signal) => this.remote.disconnectModelConnection({ connectionId }, signal),
          {}
        );
        this.patch({ disconnectConnectionId: "" });
      }
      onCatalogEvent(change) {
        this.catalogEventPending = true;
        if (change === "reset") {
          this.catalogEventReset = true;
          this.catalogGeneration += 1;
          this.catalogEventRequest?.abort();
          this.catalogEventRequest = null;
          this.catalog = null;
          this.catalogFailure = null;
          this.loopStatus = null;
          this.statusFailure = null;
          this.readinessRevision += 1;
          this.selectionRevision += 1;
          this.patch({
            selection: null,
            selectionLoading: true,
            selectionError: null,
            readiness: { kind: "loading" }
          });
        }
        this.scheduleCatalogDrain();
      }
      scheduleCatalogDrain() {
        if (this.catalogEventDrainScheduled) return;
        this.catalogEventDrainScheduled = true;
        queueMicrotask(() => {
          this.catalogEventDrainScheduled = false;
          this.drainCatalogEvents();
        });
      }
      drainCatalogEvents() {
        if (this.catalogEventRunning || !this.catalogEventPending || this.store.getSnapshot().busy !== null) return;
        this.catalogEventPending = false;
        const reset = this.catalogEventReset;
        this.catalogEventReset = false;
        if (reset || this.autoSelectAfterLogin) {
          void this.open(true);
          return;
        }
        const generation = this.catalogGeneration;
        const request = new AbortController();
        const scopeKey = modelScopeKey(this.scope);
        this.catalogEventRequest = request;
        this.catalogEventRunning = true;
        void this.readCatalog(request.signal).then((result) => {
          if (generation !== this.catalogGeneration || request.signal.aborted || scopeKey !== modelScopeKey(this.scope) || scopeKey !== modelScopeKey(this.readScope())) return;
          this.applyCatalog(result);
          void this.resolveReadiness(
            result,
            this.loopStatus,
            this.statusFailure,
            scopeKey
          );
        }).finally(() => {
          if (this.catalogEventRequest === request) this.catalogEventRequest = null;
          this.catalogEventRunning = false;
          this.scheduleCatalogDrain();
        });
      }
      async read(busy, invoke, input) {
        if (invoke === void 0) {
          this.patch({ screen: "error", error: { code: "loop/host-update-required", message: "" } });
          return;
        }
        const generation = this.nextGeneration();
        const request = this.beginRequest();
        const scopeKey = modelScopeKey(this.scope);
        const catalogGeneration = this.catalogGeneration;
        this.patch({ screen: this.store.getSnapshot().status === null ? "loading" : "ready", busy, error: null });
        const result = await this.call((signal) => invoke(input, signal), request.signal);
        if (!this.current(generation, request) || scopeKey !== modelScopeKey(this.readScope())) return;
        if (catalogGeneration !== this.catalogGeneration) {
          this.finishStaleStatusRead(result);
          return;
        }
        const catalogResult = await this.readCatalog(request.signal);
        if (!this.current(generation, request) || scopeKey !== modelScopeKey(this.readScope())) return;
        if (catalogGeneration !== this.catalogGeneration) {
          this.finishStaleStatusRead(result);
          return;
        }
        this.applyCatalog(catalogResult);
        if (!result.ok) {
          this.loopStatus = null;
          this.statusFailure = failure(result);
          this.patch({
            screen: this.store.getSnapshot().status === null ? "error" : "ready",
            busy: null,
            error: failure(result),
            selection: null,
            selectionLoading: false
          });
          void this.resolveReadiness(catalogResult, null, this.statusFailure, scopeKey);
          return;
        }
        this.statusFailure = null;
        this.applyStatus(result.value);
        void this.resolveReadiness(catalogResult, result.value, null, scopeKey);
      }
      finishStaleStatusRead(result) {
        this.patch({
          busy: null,
          error: result.ok ? null : failure(result),
          ...result.ok ? {
            screen: "ready",
            status: result.value
          } : {}
        });
      }
      async probeExternalSelection() {
        const generation = this.nextGeneration();
        const request = this.beginRequest();
        const scopeKey = modelScopeKey(this.scope);
        const catalogGeneration = this.catalogGeneration;
        this.patch({
          screen: this.store.getSnapshot().status === null ? "loading" : "ready",
          busy: "read",
          error: null
        });
        const catalogResult = await this.readCatalog(request.signal);
        if (!this.current(generation, request) || scopeKey !== modelScopeKey(this.readScope())) return "stale";
        if (catalogGeneration !== this.catalogGeneration) {
          this.patch({ busy: null });
          return "stale";
        }
        if (!catalogResult.ok) {
          this.applyCatalog(catalogResult);
          void this.resolveReadiness(
            catalogResult,
            this.loopStatus,
            this.statusFailure,
            scopeKey
          );
          this.patch({ busy: null });
          return "continue";
        }
        const requested = this.requestedSelection(catalogResult.value);
        const externalReady = requested.projectionReady && !requested.selection.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX) && catalogHasModel(catalogResult.value, requested.selection.provider, requested.selection.model);
        this.applyCatalog(catalogResult);
        if (!externalReady) {
          this.patch({ busy: null });
          if (this.defaultSaveUnknown) await this.resolveReadiness(catalogResult, null, null, scopeKey);
          return "continue";
        }
        this.patch({ busy: null });
        await this.resolveReadiness(catalogResult, null, null, scopeKey);
        return this.store.getSnapshot().readiness.kind === "external-ready" ? "ready" : "continue";
      }
      applyStatus(status) {
        this.loopStatus = status;
        this.statusFailure = null;
        this.patch({
          screen: "ready",
          status,
          busy: null,
          error: null
        });
        this.refreshSelection();
      }
      async readCatalog(signal) {
        if (this.loadModelCatalog === void 0) {
          return { ok: false, error: { code: "loop/host-update-required", message: "" } };
        }
        return await new Promise((resolve) => {
          let settled = false;
          const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            resolve(result);
          };
          const onAbort = () => {
            finish({ ok: false, error: { code: "loop/transport", message: "" } });
          };
          const timer = setTimeout(() => {
            finish({ ok: false, error: { code: "loop/catalog-timeout", message: "" } });
          }, this.catalogReadTimeoutMs);
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) {
            onAbort();
            return;
          }
          Promise.resolve().then(() => {
            if (settled || signal.aborted) {
              return { ok: false, error: { code: "loop/transport", message: "" } };
            }
            return this.loadModelCatalog(signal);
          }).then(finish, () => {
            finish({ ok: false, error: { code: "loop/transport", message: "" } });
          });
        });
      }
      applyCatalog(result) {
        if (!result.ok) {
          this.catalog = null;
          this.catalogFailure = failure(result);
          this.selectionRevision += 1;
          this.patch({
            selection: null,
            selectionLoading: false,
            selectionError: this.catalogFailure
          });
          return;
        }
        this.catalog = result.value;
        this.catalogFailure = null;
        this.patch({ selectionError: null });
        this.refreshSelection();
      }
      refreshCachedReadiness() {
        if (this.catalog === null) return;
        void this.resolveReadiness(
          { ok: true, value: this.catalog },
          this.loopStatus,
          this.statusFailure,
          modelScopeKey(this.scope)
        );
      }
      async resolveReadiness(catalogResult, status, statusFailure, scopeKey) {
        const revision = ++this.readinessRevision;
        const catalog = catalogResult.ok ? catalogResult.value : null;
        const requested = catalog === null ? null : this.requestedSelection(catalog);
        let readiness = await resolveModelReadiness({
          status,
          catalog,
          requested,
          scope: this.scope,
          routeForConnection: this.routeForConnection,
          statusFailure
        });
        if (revision !== this.readinessRevision || scopeKey !== modelScopeKey(this.scope) || scopeKey !== modelScopeKey(this.readScope())) return;
        if (this.defaultSaveUnknown && requested?.scope === "new-session" && catalog !== null) {
          const choices = await availableModelChoices(status, catalog, this.scope, this.routeForConnection);
          if (revision !== this.readinessRevision || scopeKey !== modelScopeKey(this.readScope())) return;
          readiness = {
            kind: "selection-required",
            scopeKey: modelReadinessScopeKey(this.scope, status),
            sessionId: null,
            selectionScope: "new-session",
            selectionBasis: "default",
            reason: "invalid-selection",
            providerId: requested.selection.provider,
            modelId: requested.selection.model,
            choices
          };
          this.patch({ error: { code: "loop-host/model-default-unknown", message: "" } });
        }
        this.patch({ readiness });
      }
      nextGeneration() {
        this.generation += 1;
        this.request?.abort();
        return this.generation;
      }
      beginRequest() {
        this.request = new AbortController();
        return this.request;
      }
      current(generation, request) {
        return generation === this.generation && !request.signal.aborted;
      }
      patch(patch) {
        const previous = this.store.getSnapshot();
        const next = { ...previous, ...patch };
        this.store.set(next);
        if (this.autoSelectAfterLogin && !this.automaticSelectionScheduled) {
          this.automaticSelectionScheduled = true;
          queueMicrotask(() => {
            this.automaticSelectionScheduled = false;
            this.ensureSelection();
          });
        }
        if (previous.busy !== null && next.busy === null) this.scheduleCatalogDrain();
      }
      async call(invoke, signal) {
        try {
          return await invoke(signal);
        } catch {
          return { ok: false, error: { code: "loop/transport", message: "" } };
        }
      }
    };

    // client/ui/session-model-selection.ts
    function retainModelSelectionObservation(sessions, sessionId, signal) {
      const reference = sessions.retain(sessionId, {
        source: "controllerOperation",
        signal
      });
      try {
        const projection = reference.binding.session.projections.faceOf("modelSelection");
        return {
          getSnapshot: () => projection.getSnapshot(),
          subscribe: (listener) => projection.subscribe(listener),
          release: () => {
            reference.release();
          }
        };
      } catch (error) {
        reference.release();
        throw error;
      }
    }
    function exactProjectedSelection(value, choice) {
      const projection = value;
      return projection?.next?.provider === choice.providerId && projection.next.model === choice.modelId;
    }
    var SessionModelSelectionAdapter = class {
      ports;
      constructor(ports) {
        this.ports = ports;
      }
      async select(input, signal) {
        if (signal?.aborted) {
          return { ok: false, error: { code: "loop/transport", message: "" } };
        }
        const selected = await this.ports.selectModel({
          sessionId: input.sessionId,
          provider: input.choice.providerId,
          model: input.choice.modelId
        }, signal);
        if (!selected.ok) return selected;
        if (signal?.aborted) {
          return { ok: false, error: { code: "loop/transport", message: "" } };
        }
        if (selected.value.selected.provider !== input.choice.providerId || selected.value.selected.model !== input.choice.modelId) {
          return { ok: false, error: { code: "loop/model-selection-mismatch", message: "" } };
        }
        return await this.awaitProjection(input.sessionId, input.choice, signal);
      }
      async awaitProjection(sessionId, choice, signal) {
        let observation;
        try {
          observation = this.ports.observeModelSelection(sessionId, signal);
        } catch {
          return { ok: false, error: { code: "loop/transport", message: "" } };
        }
        return await new Promise((resolve) => {
          let settled = false;
          let unsubscribe = () => {
          };
          const timeout = this.ports.projectionTimeoutMs ?? 15e3;
          const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            try {
              unsubscribe();
            } catch {
            }
            try {
              observation.release();
            } catch {
            }
            resolve(result);
          };
          const check = () => {
            let snapshot;
            try {
              snapshot = observation.getSnapshot();
            } catch {
              finish({ ok: false, error: { code: "loop/transport", message: "" } });
              return;
            }
            if (exactProjectedSelection(snapshot, choice)) {
              finish({ ok: true, value: void 0 });
            }
          };
          const onAbort = () => {
            finish({ ok: false, error: { code: "loop/transport", message: "" } });
          };
          const timer = setTimeout(() => {
            finish({
              ok: false,
              error: { code: "loop/model-selection-not-saved", message: "" }
            });
          }, timeout);
          try {
            unsubscribe = observation.subscribe(check);
          } catch {
            finish({ ok: false, error: { code: "loop/transport", message: "" } });
            return;
          }
          signal?.addEventListener("abort", onAbort, { once: true });
          if (signal?.aborted) {
            onAbort();
            return;
          }
          check();
        });
      }
    };

    // client/ui/project-sync-controller.ts
    var INITIAL_PROJECT_SYNC_STATE = Object.freeze({
      screen: "idle",
      settings: null,
      busy: null,
      error: null,
      challenge: null,
      challengeOpened: false,
      disconnecting: false
    });
    function failureOf2(result) {
      return { code: result.error.code, message: result.error.message };
    }
    function transportFailure2() {
      return { code: "loop/transport", message: "" };
    }
    function capabilityFailure2() {
      return { code: "loop/host-update-required", message: "" };
    }
    var LoopProjectSyncController = class {
      store;
      actions;
      remote;
      onAuthorized;
      onDisconnected;
      openExternal;
      generation = 0;
      request = null;
      authorizationTimer = null;
      constructor(options) {
        this.onAuthorized = options.onAuthorized;
        this.onDisconnected = options.onDisconnected;
        this.remote = options.remote;
        this.openExternal = options.openExternal;
        this.store = createSnapshotStore(INITIAL_PROJECT_SYNC_STATE);
        this.actions = {
          open: () => {
            void this.open();
          },
          connect: () => {
            void this.syncProjects();
          },
          refresh: () => {
            void this.syncProjects();
          },
          disconnect: () => {
            void this.disconnect();
          },
          openChallenge: () => {
            this.openChallenge();
          },
          continueAfterAuth: () => {
            void this.checkAuthorization();
          }
        };
      }
      async open() {
        const state = this.store.getSnapshot();
        if (state.busy !== null) return;
        if (state.challenge !== null && Date.parse(state.challenge.expiresAt) > Date.now()) return;
        if (this.remote.projectSyncSettings === void 0) {
          this.patch({ screen: "error", error: capabilityFailure2() });
          return;
        }
        const generation = this.nextGeneration();
        const request = this.beginRequest();
        this.patch({ screen: "loading", busy: "read", error: null });
        const result = await this.call(
          (signal) => this.remote.projectSyncSettings({}, signal),
          request.signal
        );
        if (!this.current(generation, request)) return;
        if (!result.ok) {
          this.patch({ screen: "error", busy: null, error: failureOf2(result) });
          return;
        }
        this.applySettings(result.value, null);
      }
      dispose() {
        this.generation += 1;
        this.clearAuthorizationTimer();
        this.request?.abort();
        this.request = null;
        this.store.set(INITIAL_PROJECT_SYNC_STATE);
      }
      async syncProjects() {
        const state = this.store.getSnapshot();
        if (state.busy !== null) return;
        if (this.remote.syncProjects === void 0) {
          this.patch({ error: capabilityFailure2() });
          return;
        }
        const generation = this.generation;
        const request = this.beginRequest();
        this.patch({ busy: "sync", error: null });
        const result = await this.call(
          (signal) => this.remote.syncProjects({}, signal),
          request.signal
        );
        if (!this.current(generation, request)) return;
        if (!result.ok) {
          this.patch({ busy: null, error: failureOf2(result) });
          this.clearAuthorizationTimer();
          return;
        }
        this.applySettings(result.value, result.value);
        if ((state.challenge !== null || state.settings?.state === "needs_auth") && (result.value.state === "ready" || result.value.state === "partial")) {
          this.onAuthorized?.();
        }
      }
      checkAuthorization() {
        if (this.store.getSnapshot().disconnecting) void this.disconnect();
        else void this.syncProjects();
      }
      async disconnect() {
        const state = this.store.getSnapshot();
        if (state.busy !== null) return;
        if (this.remote.disconnectAccount === void 0) {
          this.patch({ error: capabilityFailure2() });
          return;
        }
        const generation = this.generation;
        const request = this.beginRequest();
        this.clearAuthorizationTimer();
        this.patch({ busy: "disconnect", disconnecting: true, error: null });
        const result = await this.call((signal) => this.remote.disconnectAccount(state.challengeOpened && state.challenge?.recoveryMode ? { recoveryMode: state.challenge.recoveryMode } : {}, signal), request.signal);
        if (!this.current(generation, request)) return;
        if (!result.ok) {
          this.patch({ busy: null, error: failureOf2(result) });
          return;
        }
        if (result.value.state === "signed_out") {
          this.patch({ busy: null, challenge: null, challengeOpened: false, disconnecting: false, settings: null });
          this.onDisconnected?.();
          await this.open();
          return;
        }
        const challenge = result.value.challenge ?? null;
        this.patch({
          busy: null,
          challenge,
          challengeOpened: challenge !== null && challenge.id === state.challenge?.id && challenge.loginUrl === state.challenge.loginUrl && state.challengeOpened
        });
        this.scheduleAuthorizationCheck();
      }
      openChallenge() {
        const challenge = this.store.getSnapshot().challenge;
        if (challenge === null) return;
        if (!(Date.parse(challenge.expiresAt) > Date.now())) {
          this.patch({ challenge: null, challengeOpened: false, error: { code: "loop-host/challenge-expired", message: "" } });
          return;
        }
        const opened = this.openExternal(challenge.loginUrl);
        this.patch(opened ? { challengeOpened: true, error: null } : { error: { code: "loop/popup-blocked", message: "" } });
        if (opened) this.scheduleAuthorizationCheck();
      }
      applySettings(settings, synced) {
        const previous = this.store.getSnapshot();
        const challenge = synced?.challenge ?? null;
        this.patch({
          screen: "ready",
          settings,
          busy: null,
          error: null,
          challenge,
          disconnecting: settings.disconnectPending === true,
          challengeOpened: challenge !== null && challenge.id === previous.challenge?.id && challenge.loginUrl === previous.challenge.loginUrl && previous.challengeOpened
        });
        this.scheduleAuthorizationCheck();
      }
      clearAuthorizationTimer() {
        if (this.authorizationTimer !== null) clearTimeout(this.authorizationTimer);
        this.authorizationTimer = null;
      }
      scheduleAuthorizationCheck() {
        this.clearAuthorizationTimer();
        const state = this.store.getSnapshot();
        if (!state.challengeOpened || state.challenge === null) return;
        const remaining = Date.parse(state.challenge.expiresAt) - Date.now();
        if (!Number.isFinite(remaining) || remaining <= 0) {
          this.patch({ challenge: null, challengeOpened: false, error: { code: "loop-host/challenge-expired", message: "" } });
          return;
        }
        this.authorizationTimer = setTimeout(() => {
          this.authorizationTimer = null;
          this.checkAuthorization();
        }, Math.min(1500, remaining));
      }
      nextGeneration() {
        this.generation += 1;
        this.request?.abort();
        return this.generation;
      }
      beginRequest() {
        this.request?.abort();
        this.request = new AbortController();
        return this.request;
      }
      current(generation, request) {
        return generation === this.generation && !request.signal.aborted;
      }
      patch(patch) {
        this.store.set({ ...this.store.getSnapshot(), ...patch });
      }
      async call(invoke, signal) {
        try {
          return await invoke(signal);
        } catch {
          return { ok: false, error: transportFailure2() };
        }
      }
    };

    // client/ui/loop-skill-runtime.ts
    function resultValue2(result) {
      if (!result.ok) throw new LoopSkillRuntimeError(result.error.code, result.error.message);
      return result.value;
    }
    function scopeIdentity(value) {
      return {
        serverBaseUrl: value.scope.serverBaseUrl,
        accountId: value.scope.accountId,
        installationId: value.scope.installationId,
        workspaceId: value.scope.workspaceId,
        hostWorkspaceId: value.scope.hostWorkspaceId,
        bindingRevision: value.scope.bindingRevision,
        projectId: value.scope.projectId,
        agentId: value.scope.agentId,
        identityFingerprint: value.scope.identityFingerprint
      };
    }
    var LoopSkillSessionRuntime = class {
      sessionId;
      options;
      cache;
      hostWorkspaceId;
      resolvedScope = "";
      seenEventIds = /* @__PURE__ */ new Set();
      warmController = null;
      stream = null;
      disposed = false;
      constructor(sessionId, options) {
        this.sessionId = sessionId;
        this.options = options;
        const workspace = options.workspaceForSession(sessionId);
        if (workspace === void 0) {
          throw loopSkillError(
            "loop-host/workspace-required",
            "Open this Session from a workspace before using Loop Skills."
          );
        }
        this.hostWorkspaceId = workspace.workspaceId;
        this.cache = new InputCatalogCache({
          serverBaseUrl: "",
          accountId: "",
          installationId: "",
          workspaceId: workspace.workspaceId,
          hostWorkspaceId: workspace.workspaceId
        }, async (cursor, signal) => {
          const currentWorkspace = options.workspaceForSession(sessionId);
          if (currentWorkspace === void 0) {
            throw loopSkillError(
              "loop-host/session-unavailable",
              "This Loop Skill Session no longer belongs to a Host workspace."
            );
          }
          if (this.options.remote.skillCatalog === void 0) {
            throw loopSkillError(
              "loop-host/capability-unsupported",
              "This Loop Host needs an update to load Loop Skills."
            );
          }
          const result = resultValue2(await this.options.remote.skillCatalog({
            workspaceId: currentWorkspace.workspaceId,
            sessionId,
            ...cursor === void 0 ? {} : { cursor },
            limit: 50
          }, signal));
          if (result.scope.sessionId !== sessionId || result.scope.hostWorkspaceId !== currentWorkspace.workspaceId) {
            throw loopSkillError(
              "loop-host/backend-invalid",
              "Loop Skills returned a different Session or workspace."
            );
          }
          return { ...result.data, identity: scopeIdentity(result) };
        });
      }
      async warm() {
        if (this.disposed) return;
        this.ensureWorkspaceIdentity();
        this.startStream();
        this.warmController?.abort();
        const controller = new AbortController();
        this.warmController = controller;
        try {
          await this.cache.ensureLoaded(controller.signal);
          this.recordResolvedScope();
        } finally {
          if (this.warmController === controller) this.warmController = null;
        }
      }
      async candidates(request) {
        if (this.disposed) return [];
        this.ensureWorkspaceIdentity();
        this.startStream();
        const entries = await this.cache.find(
          request.query.replace(/^loop(?:\s*[·:]\s*|\s+|$)/iu, ""),
          (entry, query) => loopSkillDisplayName(entry).toLocaleLowerCase().includes(query) || entry.description?.toLocaleLowerCase().includes(query) === true || entry.libraryName.toLocaleLowerCase().includes(query) || entry.librarySlug?.toLocaleLowerCase().includes(query) === true || entry.path.toLocaleLowerCase().includes(query),
          request.signal,
          2
        );
        this.recordResolvedScope();
        const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name) || left.libraryName.localeCompare(right.libraryName) || left.path.localeCompare(right.path));
        const counts = /* @__PURE__ */ new Map();
        for (const entry of sorted) {
          const key = entry.name.toLocaleLowerCase();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return sorted.map((entry) => loopSkillCandidate(this.sessionId, entry, (counts.get(entry.name.toLocaleLowerCase()) ?? 0) > 1));
      }
      pick(pick) {
        return pickedLoopSkill(pick, this.sessionId);
      }
      startStream() {
        if (this.stream !== null || this.options.remote.skillCatalogEvents === void 0) return;
        const controller = new AbortController();
        this.stream = controller;
        void (async () => {
          try {
            for await (const frame of this.options.subscribeCatalogEvents(this.sessionId, controller.signal)) {
              if (controller.signal.aborted) break;
              this.applyFrame(frame);
            }
          } catch {
            if (!controller.signal.aborted) {
              this.cache.reset();
            }
          } finally {
            if (this.stream === controller) {
              this.stream = null;
              if (!controller.signal.aborted && !this.disposed) this.cache.invalidate();
            }
          }
        })();
      }
      applyFrame(frame) {
        if (frame.type === "ready") {
          if (frame.subscription.snapshotRequired || frame.subscription.state === "backoff" || frame.subscription.state === "revoked" || frame.subscription.state === "stopped") this.cache.invalidate();
          return;
        }
        const event = frame.event;
        if (event.sessionId !== this.sessionId) return;
        if (event.eventId !== "" && this.seenEventIds.has(event.eventId)) return;
        if (event.eventId !== "") {
          this.seenEventIds.add(event.eventId);
          if (this.seenEventIds.size > 256) {
            const oldest = this.seenEventIds.values().next().value;
            if (oldest !== void 0) this.seenEventIds.delete(oldest);
          }
        }
        if (event.kind === "subscription.changed") {
          if (event.status?.snapshotRequired === true || event.status?.state === "backoff" || event.status?.state === "revoked" || event.status?.state === "stopped") {
            this.cache.invalidate();
          }
          return;
        }
        if (event.kind !== "catalog.changed") return;
        const eventScope = catalogScopeKey("skills", this.sessionId, {
          serverBaseUrl: event.serverBaseUrl,
          accountId: event.accountId,
          installationId: event.installationId,
          workspaceId: event.workspaceId,
          hostWorkspaceId: this.options.workspaceForSession(this.sessionId)?.workspaceId ?? "",
          bindingRevision: event.bindingRevision,
          projectId: event.projectId,
          agentId: event.agentId,
          identityFingerprint: event.identityFingerprint
        });
        if (this.resolvedScope !== "" && eventScope !== this.resolvedScope) {
          this.cache.reset();
          this.resolvedScope = "";
          return;
        }
        this.cache.invalidate();
      }
      recordResolvedScope() {
        if (!this.cache.state().loaded) return;
        this.resolvedScope = catalogScopeKey("skills", this.sessionId, this.cache.scopeIdentity());
      }
      ensureWorkspaceIdentity() {
        const workspace = this.options.workspaceForSession(this.sessionId);
        const next = workspace?.workspaceId ?? "";
        if (next === this.hostWorkspaceId) return;
        this.hostWorkspaceId = next;
        this.stream?.abort();
        this.stream = null;
        this.cache.setIdentity({
          serverBaseUrl: "",
          accountId: "",
          installationId: "",
          workspaceId: next,
          hostWorkspaceId: next
        });
        this.resolvedScope = "";
      }
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.warmController?.abort();
        this.warmController = null;
        this.stream?.abort();
        this.stream = null;
        this.seenEventIds.clear();
        this.cache.reset();
      }
    };
    var LoopSkillRuntime = class {
      options;
      sessions = /* @__PURE__ */ new Map();
      streams = /* @__PURE__ */ new Map();
      constructor(options) {
        this.options = options;
      }
      forSession(sessionId) {
        const existing = this.sessions.get(sessionId);
        if (existing !== void 0) return existing;
        const created = new LoopSkillSessionRuntime(sessionId, {
          ...this.options,
          subscribeCatalogEvents: (id2, signal) => this.catalogEvents(id2, signal)
        });
        this.sessions.set(sessionId, created);
        if (this.sessions.size > 64) {
          const oldest = this.sessions.keys().next().value;
          if (oldest !== void 0 && oldest !== sessionId) {
            this.sessions.get(oldest)?.dispose();
            this.sessions.delete(oldest);
          }
        }
        return created;
      }
      localizedFailure(error, fallbackCode) {
        return withLocalizedLoopSkillMessage(
          asLoopSkillRuntimeError(error, fallbackCode),
          this.options.formatFailure
        );
      }
      ensureStream(workspaceId, sessionId) {
        const existing = this.streams.get(workspaceId);
        if (existing !== void 0) return existing;
        if (this.streams.size >= 16) {
          throw loopSkillError("loop-host/queue-full", "Too many Loop Skill Host workspaces are active.");
        }
        if (this.options.remote.skillCatalogEvents === void 0) {
          throw loopSkillError(
            "loop-host/capability-unsupported",
            "This Loop Host needs an update to receive Loop Skill updates."
          );
        }
        const controller = new AbortController();
        const entry = {
          controller,
          history: [],
          listeners: /* @__PURE__ */ new Set()
        };
        this.streams.set(workspaceId, entry);
        void (async () => {
          try {
            for await (const frame of this.options.remote.skillCatalogEvents({
              workspaceId,
              sessionId
            }, controller.signal)) {
              if (controller.signal.aborted) break;
              entry.history.push(frame);
              if (entry.history.length > 64) entry.history.shift();
              for (const listener of [...entry.listeners]) listener(frame);
            }
          } catch {
          } finally {
            entry.controller.abort();
            if (this.streams.get(workspaceId) === entry) this.streams.delete(workspaceId);
          }
        })();
        return entry;
      }
      catalogEvents(sessionId, signal) {
        const workspace = this.options.workspaceForSession(sessionId);
        if (workspace === void 0) {
          throw loopSkillError(
            "loop-host/workspace-required",
            "Open this Session from a workspace before using Loop Skill updates."
          );
        }
        return this.workspaceCatalogEvents(workspace.workspaceId, sessionId, signal);
      }
      async *workspaceCatalogEvents(workspaceId, sessionId, signal) {
        const entry = this.ensureStream(workspaceId, sessionId);
        const queue = entry.history.map((frame) => this.forSessionFrame(frame, sessionId));
        let wake;
        const notify = () => {
          const resolve = wake;
          wake = void 0;
          resolve?.();
        };
        const listener = (frame) => {
          queue.push(this.forSessionFrame(frame, sessionId));
          notify();
        };
        const abort = () => notify();
        signal.addEventListener("abort", abort, { once: true });
        entry.controller.signal.addEventListener("abort", abort, { once: true });
        entry.listeners.add(listener);
        try {
          while (!signal.aborted && (queue.length > 0 || !entry.controller.signal.aborted)) {
            if (queue.length === 0) {
              await new Promise((resolve) => {
                wake = resolve;
              });
              continue;
            }
            yield queue.shift();
          }
        } finally {
          signal.removeEventListener("abort", abort);
          entry.controller.signal.removeEventListener("abort", abort);
          entry.listeners.delete(listener);
          if (entry.listeners.size === 0) {
            entry.controller.abort();
            if (this.streams.get(workspaceId) === entry) this.streams.delete(workspaceId);
          }
        }
      }
      forSessionFrame(frame, sessionId) {
        if (frame.type !== "change") return frame;
        return {
          ...frame,
          event: { ...frame.event, sessionId }
        };
      }
      registerSource(inputTriggers, section) {
        const owner = this;
        const source = {
          trigger: "/",
          name: "loop-skills",
          order: 25,
          showGroupTitle: false,
          codec: {
            clipboardText: (value) => {
              const reference = decodeLoopSkillReference(value);
              return reference === null ? "" : `/${reference.name}`;
            },
            serialize: async (value, signal) => {
              const decoded = decodeLoopSkillReferenceResult(value);
              if (decoded instanceof Error) {
                throw owner.localizedFailure(decoded, "loop-skill/invalid-reference");
              }
              if (!owner.options.workspaceForSession(decoded.sessionId)) {
                const error = loopSkillError(
                  "loop-skill/session-inactive",
                  "This Loop Skill reference belongs to an inactive Session."
                );
                throw owner.localizedFailure(error, "loop-skill/internal");
              }
              return await loopSkillCodec(decoded.sessionId, owner.options.formatFailure).serialize(value, signal);
            }
          },
          async candidates(session, request) {
            try {
              const runtime = owner.forSession(session.sessionId);
              const rows = await runtime.candidates(request);
              return rows.map((row) => ({ ...row, section }));
            } catch (error) {
              if (request.signal.aborted) return [];
              const failure2 = owner.localizedFailure(error, "loop-skill/internal");
              owner.options.showFailure(failure2);
              throw failure2;
            }
          },
          warm: (session) => {
            try {
              void owner.forSession(session.sessionId).warm().catch(() => {
              });
            } catch {
            }
          },
          onPick: (pick) => {
            try {
              return owner.forSession(pick.session.sessionId).pick(pick);
            } catch (error) {
              owner.options.showFailure(owner.localizedFailure(error, "loop-skill/internal"));
              return void 0;
            }
          }
        };
        return inputTriggers.registerSource(source);
      }
      dispose() {
        for (const runtime of this.sessions.values()) runtime.dispose();
        this.sessions.clear();
        for (const stream of this.streams.values()) stream.controller.abort();
        this.streams.clear();
      }
    };

    // client/ui/session-action.tsx
    var import_react9 = require("react");
    var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");
    var import_jsx_runtime8 = require("react/jsx-runtime");
    function SessionAction({ readUpload, t }) {
      const tooltipId = (0, import_react9.useId)();
      const [open, setOpen] = (0, import_react9.useState)(false);
      const [status, setStatus] = (0, import_react9.useState)("uploading");
      (0, import_react9.useEffect)(() => {
        if (!open) return;
        const abort = new AbortController();
        let timer;
        const refresh = async () => {
          let next;
          try {
            next = await readUpload(abort.signal);
          } catch {
            next = "failed";
          }
          if (abort.signal.aborted) return;
          setStatus(next);
          timer = setTimeout(() => {
            void refresh();
          }, 1500);
        };
        void refresh();
        return () => {
          abort.abort();
          clearTimeout(timer);
        };
      }, [open, readUpload]);
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
        "span",
        {
          className: loop_ui_default.uploadEntry,
          onMouseEnter: () => {
            setOpen(true);
          },
          onMouseLeave: () => {
            setOpen(false);
          },
          onFocus: () => {
            setOpen(true);
          },
          onBlur: () => {
            setOpen(false);
          },
          onKeyDown: (event) => {
            if (event.key === "Escape") setOpen(false);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              import_dsh_client_ui_primitives7.Button,
              {
                size: "sm",
                variant: "toolbar",
                className: loop_ui_default.sessionAction,
                "aria-describedby": open ? tooltipId : void 0,
                "aria-label": t("upload.label"),
                onClick: () => {
                  setOpen(true);
                },
                children: "Loop"
              }
            ),
            open && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { id: tooltipId, className: loop_ui_default.uploadDetails, role: "tooltip", children: t(`upload.${status}`) })
          ]
        }
      );
    }

    // client/ui/settings-access.ts
    var LoopSettingsAccess = class {
      openSettingsAction = null;
      snapshot = Object.freeze({ settingsOpen: false });
      listeners = /* @__PURE__ */ new Set();
      generation = 0;
      bind(openSettings) {
        const generation = ++this.generation;
        this.openSettingsAction = openSettings;
        return () => {
          if (generation !== this.generation) return;
          this.openSettingsAction = null;
        };
      }
      setSettingsOpen(settingsOpen) {
        if (settingsOpen === this.snapshot.settingsOpen) return;
        this.snapshot = Object.freeze({ settingsOpen });
        for (const listener of this.listeners) listener();
      }
      openApiKey() {
        this.openSettingsAction?.();
      }
      getSnapshot() {
        return this.snapshot;
      }
      subscribe(listener) {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      }
    };

    // client/ui/index.ts
    function workspaceTarget(ctx, sessionId) {
      const workspace = ctx.workspaces.list.getSnapshot().items.find((row) => row.sessionIds.some((id2) => String(id2) === sessionId));
      if (workspace === void 0) return void 0;
      return {
        workspaceId: workspace.workspaceId,
        path: workspace.path,
        displayTitle: workspace.title
      };
    }
    function applyLoopUi(ctx, remote) {
      ctx.effect(
        () => {
          const disposeBase = ctx.locale.register(NS, { zh, en });
          const disposeTraditional = ctx.locale.register(NS, "zh-TW", zhTW);
          const disposeJapanese = ctx.locale.register(NS, "ja", ja);
          return () => {
            disposeJapanese();
            disposeTraditional();
            disposeBase();
          };
        },
        "loop-proxy: client dictionaries"
      );
      ctx.uiConversation.userText.register(loopReferenceDisplayRule);
      const t = ctx.locale.bind(NS);
      const currentLoopLocale = () => normalizedLoopLocale(ctx.locale.getSnapshot().active) ?? "en";
      const openLoopExternal = (url) => {
        const localized = externalUrlWithLocale(url, currentLoopLocale());
        return localized !== null && openExternal(localized, {
          protocol: window.location.protocol,
          open: (target, name2) => window.open(target, name2)
        });
      };
      const selectLoopModule = (panelId) => {
        ctx.layout.selectPanel(panelId);
        void globalPage.openModule(panelId);
      };
      const globalPage = new LoopGlobalPageController(remote, {
        onRoute: (panelId, _path) => {
          const activePanelId = ctx.layout.panelInfo.getSnapshot().activePanelId;
          if (loopModuleForPanel(activePanelId) !== null && activePanelId !== panelId) {
            ctx.layout.selectPanel(panelId);
            return true;
          }
          return false;
        }
      });
      globalPage.setLocale(currentLoopLocale());
      ctx.effect(() => registerLoopResourceLinks(document, (href) => {
        const panelId = globalPage.openResourceLink(href);
        if (panelId === null) return false;
        ctx.layout.selectPanel(panelId);
        return true;
      }), "loop-proxy: resource links");
      ctx.effect(
        () => ctx.locale.subscribe(() => {
          globalPage.setLocale(currentLoopLocale());
        }),
        "loop-proxy: embedded page locale"
      );
      const openLoopModules = () => {
        selectLoopModule(LOOP_PROJECTS_PANEL_ID);
      };
      const skills = new LoopSkillRuntime({
        remote,
        workspaceForSession: (sessionId) => workspaceTarget(ctx, sessionId),
        formatFailure: (failure2) => skillCatalogFailureText(t, failure2),
        showFailure: (error) => {
          ctx.contextMenus.notify(
            skillCatalogFailureText(t, error instanceof LoopSkillRuntimeError ? { code: error.code, message: error.message } : { code: "loop-skill/internal", message: "" }),
            false
          );
        }
      });
      const knowledge = new LoopKnowledgeRuntime({
        remote,
        workspaceForSession: (sessionId) => workspaceTarget(ctx, sessionId),
        catalogEvents: (sessionId, signal) => skills.catalogEvents(sessionId, signal),
        failureText: t("knowledge.error.unavailable"),
        showFailure: (message) => ctx.contextMenus.notify(message, false)
      });
      ctx.effect(() => knowledge.registerSource(ctx.inputTriggers, t("slash.loopKnowledge")), "loop-proxy: knowledge source");
      ctx.effect(() => () => knowledge.dispose(), "loop-proxy: knowledge runtime");
      const openLoopWorksite = async (target) => {
        const opened = await globalPage.openWorksite(target);
        if (opened) {
          ctx.layout.selectPanel(LOOP_PROJECTS_PANEL_ID);
        } else {
          ctx.contextMenus.notify(t("error.projectTarget"), false);
        }
        return opened;
      };
      const collaboration = new CollaborationRuntime({
        remote,
        sessions: ctx.sessions,
        workspaceForSession: (sessionId) => workspaceTarget(ctx, sessionId),
        openBinding: () => {
          settingsAccess.openApiKey();
        },
        openLoopProject: openLoopModules,
        openWorksiteSetup: (scope) => {
          void openLoopWorksite({
            loopWorkspaceId: scope.workspaceId,
            serviceBaseUrl: scope.serverBaseUrl
          });
        },
        openTask: (workspaceId, taskId) => {
          if (globalPage.openTask(workspaceId, taskId)) {
            ctx.layout.selectPanel("loop-tasks");
            return true;
          }
          return false;
        }
      });
      const projectSync = new LoopProjectSyncController({
        remote,
        onAuthorized: globalPage.actions.reconnect,
        onDisconnected: () => {
          accountConnection.reset();
          globalPage.actions.reconnect();
          void models.open(true);
        },
        openExternal: openLoopExternal
      });
      const sessionModelSelection = new SessionModelSelectionAdapter({
        selectModel: (input, signal) => {
          if (signal?.aborted) {
            return Promise.resolve({
              ok: false,
              error: { code: "loop/transport", message: "" }
            });
          }
          return ctx.remote.session.selectModel({
            sessionId: input.sessionId,
            provider: input.provider,
            model: input.model
          });
        },
        observeModelSelection: (sessionId, signal) => retainModelSelectionObservation(ctx.sessions, sessionId, signal)
      });
      const models = new LoopModelController({
        remote,
        autoSelectAfterLogin: true,
        loadModelCatalog: async () => await ctx.remote.session.modelCatalog(),
        subscribeCatalogEvents: (listener) => {
          const disposers = [
            ctx.remote.$on("llm/adapters-updated", () => {
              listener("refresh");
            }),
            ctx.remote.$on("llm/models-updated", () => {
              listener("refresh");
            }),
            ctx.remote.$on("settings/document-updated", () => {
              listener("refresh");
            }),
            ctx.remote.$on("credentials/record-updated", () => {
              listener("refresh");
            }),
            ctx.remote.$on("credentials/reference-updated", () => {
              listener("refresh");
            }),
            ctx.on("connection/reset", () => {
              listener("reset");
            })
          ];
          return () => {
            for (const dispose of disposers) dispose();
          };
        },
        scopeSources: {
          globalPage: globalPage.store,
          sharedData: globalPage.sharedData.store
        },
        selectModel: (input, signal) => sessionModelSelection.select(input, signal)
      });
      const accountConnection = new AccountConnectionController(
        remote,
        globalPage,
        models,
        () => currentLoopLocale().startsWith("zh") ? "zh" : "en",
        openLoopExternal
      );
      const loginDialog = new LoginDialogController(globalPage, accountConnection, projectSync, models, openLoopModules, () => {
        if (window.location.protocol === "dsh-app:") return null;
        const target = window.open("about:blank", "_blank");
        if (target === null) return null;
        target.opener = null;
        let navigated = false;
        return {
          open: (url) => {
            const localized = externalUrlWithLocale(url, currentLoopLocale());
            if (localized === null || target.closed) return false;
            target.location.replace(localized);
            navigated = true;
            return true;
          },
          close: () => {
            if (!navigated && !target.closed) target.close();
          }
        };
      });
      const signInLoop = loginDialog.open;
      ctx.effect(() => () => loginDialog.dispose(), "loop-proxy: login dialog");
      ctx.effect(() => () => accountConnection.dispose(), "loop-proxy: account login");
      const settingsAccess = new LoopSettingsAccess();
      ctx.effect(
        () => collaboration.registerSource(
          ctx.inputTriggers,
          (type) => t(type === "agent" ? "collab.section.agents" : "collab.section.humans"),
          (failure2) => collaborationFailureText(t, failure2),
          {
            delegate: t("collab.candidate.delegate"),
            notify: t("collab.candidate.notify"),
            needsAccess: t("collab.candidate.needsAccess"),
            unavailable: t("collab.candidate.unavailable")
          }
        ),
        "loop-proxy: collaborator @ source"
      );
      ctx.effect(() => () => collaboration.dispose(), "loop-proxy: collaboration runtime");
      ctx.effect(
        () => skills.registerSource(ctx.inputTriggers, t("slash.loopSkills")),
        "loop-proxy: Loop Skill / source"
      );
      ctx.effect(() => () => skills.dispose(), "loop-proxy: Loop Skill runtime");
      ctx.effect(
        () => startLoopGlobalPageRuntime(globalPage),
        "loop-proxy: global page bootstrap"
      );
      ctx.effect(() => () => projectSync.dispose(), "loop-proxy: project sync controller");
      ctx.effect(() => {
        models.start(ctx.uiSession.adapter.current);
        return () => {
          models.dispose();
        };
      }, "loop-proxy: model controller");
      for (const module2 of LOOP_MODULES) {
        ctx.slots.inject("main", () => ctx.slots.register({
          name: "main",
          key: module2.id,
          locale: NS
        }, LoopGlobalPanel));
      }
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "loop-proxy.global-page",
        order: 30,
        locale: NS,
        inject: () => ({
          actions: globalPage.actions,
          retryLogin: signInLoop,
          authorizePages: loginDialog.authorizePages,
          recoverLogin: () => accountConnection.recover(),
          cancelRecovery: () => accountConnection.cancelRecovery(),
          attachWorkspacePage: (frame, pageUrl) => {
            globalPage.attachWorkspacePage(frame, pageUrl);
          },
          hooks: {
            globalPage: globalPage.store,
            sharedData: globalPage.sharedData.store,
            accountConnection: accountConnection.store
          }
        })
      }, LoopGlobalHost));
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "loop-proxy.login",
        order: 40,
        locale: NS,
        inject: () => ({
          dialog: loginDialog,
          pageActions: globalPage.actions,
          hooks: {
            loginDialog: loginDialog.store,
            globalPage: globalPage.store,
            projectSync: projectSync.store,
            accountConnection: accountConnection.store,
            models: models.store,
            sharedData: globalPage.sharedData.store
          }
        })
      }, LoopLoginDialog));
      LOOP_MODULES.forEach((module2, index) => {
        if (module2.placement !== "sidebar") return;
        ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
          name: "sidebar.panellist",
          id: module2.id,
          order: 10 + index,
          locale: NS,
          label: () => t(module2.label)
        }, loopPanelIconComponent(module2.id)));
      });
      ctx.slots.inject("sidebar.panellist.actions", () => ctx.slots.register({
        name: "sidebar.panellist.actions",
        id: "loop-proxy.modules",
        order: -10,
        locale: NS,
        inject: () => ({ openModule: selectLoopModule })
      }, LoopMoreMenu));
      ctx.slots.inject("settings.launcher", () => ctx.slots.register({
        name: "settings.launcher",
        priority: LOOP_LAUNCHER_PRIORITY,
        locale: NS,
        inject: () => ({
          signIn: signInLoop,
          contactUs: openHostFeedback,
          settingsAccess
        })
      }, LoopBottomMenu));
      if (!("dshDesktop" in globalThis)) {
        ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
          name: "settings.onboarding",
          id: LOOP_ONBOARDING_ID,
          priority: LOOP_ONBOARDING_PRIORITY,
          locale: NS,
          inject: () => ({
            openLoopModule: signInLoop,
            hooks: { globalPage: globalPage.store }
          })
        }, LoopOnboardingGate));
      }
      ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
        name: "settings.onboarding",
        id: "welcome-notice",
        priority: LOOP_LAUNCHER_PRIORITY,
        order: -100,
        locale: NS
      }, LoopWelcomeNoticeSuppressor));
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: LOOP_SETTINGS_ID,
        priority: LOOP_LAUNCHER_PRIORITY,
        order: -10,
        locale: NS,
        label: () => t("settings.title"),
        inject: () => ({ remote })
      }, LoopSettings));
      if ("dshDesktop" in globalThis) {
        ctx.slots.inject("shell.overlay", () => ctx.slots.register({
          name: "shell.overlay",
          id: LOOP_DESKTOP_ONBOARDING_ID,
          priority: LOOP_DESKTOP_ONBOARDING_PRIORITY,
          order: 20,
          locale: NS,
          inject: () => ({
            openLoopModule: signInLoop,
            hooks: { globalPage: globalPage.store }
          })
        }, LoopDesktopOnboarding));
      }
      ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
        name: "conversation.session.header.utilities",
        id: "loop-proxy",
        order: -10,
        locale: NS,
        inject: (sessionId) => ({
          readUpload: async (signal) => {
            const workspace = workspaceTarget(ctx, sessionId);
            if (workspace === void 0) return "off";
            const result = await remote.syncStatus({ workspaceId: workspace.workspaceId, sessionId }, signal);
            if (!result.ok) return "failed";
            const sync = result.value;
            if (sync.state === "error" || sync.state === "retrying" || sync.state === "needs_auth") return "failed";
            if (sync.state === "off") return "off";
            return sync.state === "pending" || sync.pending > 0 ? "uploading" : "uploaded";
          }
        })
      }, SessionAction));
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "loop-proxy-collaboration",
        order: 45,
        locale: NS,
        inject: () => ({
          hooks: { sessionBinding: ctx.uiSession.adapter.current },
          forSession: (sessionId) => ({
            runtime: collaboration.forSession(sessionId),
            focusComposer: () => {
              const scope = ctx.sessions.scope(sessionId);
              scope?.get("conversation")?.input.for(scope).focus();
            }
          })
        })
      }, CollaborationOverlayHost));
      const publishTask = ctx.uiSession.registerPendingInteraction(() => 3);
      ctx.effect(() => watchHumanTask(ctx.uiSession.adapter.current, remote, publishTask), "loop-proxy: task consent");
      ctx.slots.inject("conversation.composer", () => ctx.slots.register({
        name: "conversation.composer",
        priority: 3,
        locale: NS,
        select: ({ pendingInteraction }) => pendingInteraction?.kind === "loop-personal-task" ? pendingInteraction : null,
        inject: () => ({ remote })
      }, HumanTaskPanel));
      ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
        name: "conversation.composer.dock",
        id: "loop-proxy-collaboration",
        order: 20,
        locale: NS,
        inject: (sessionId) => {
          const runtime = collaboration.forSession(sessionId);
          return { runtime, hooks: { collaboration: runtime.store } };
        }
      }, CollaborationDock));
    }

    // client/index.ts
    var name = "@pingkai/loop-dsh/client";
    var inject = ["remote"];
    async function apply(ctx) {
      const unmountRemote = await ctx.remote.$mount(remote_default);
      const ui = ctx.inject(
        [
          "remote.loopHost",
          "remote.session",
          "modules",
          "slots",
          "locale",
          "contextMenus",
          "workspaces",
          "layout",
          "sessions",
          "inputTriggers",
          "uiSession",
          "uiConversation"
        ],
        (child) => {
          applyLoopUi(child, child.remote.loopHost);
        }
      );
      try {
        await ui;
      } catch (error) {
        await ui.dispose();
        await unmountRemote();
        throw error;
      }
      return async () => {
        await ui.dispose();
        await unmountRemote();
      };
    }

    return module.exports;
  },
});

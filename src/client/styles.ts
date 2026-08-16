/**
 * Panel stylesheet. Uses only the public DSH design tokens
 * (--dsw-alias-*) so the panel follows the active theme like every official
 * settings section. Injected once as a <style> tag by the Panel component.
 */

export const panelCss = `
.dshpp-root { display: flex; flex-direction: column; gap: 16px; }

.dshpp-banner {
  display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);
  border-radius: 12px; padding: 12px 14px;
}
.dshpp-bannerTitle { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; line-height: 20px; }
.dshpp-bannerDetail { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dshpp-bannerAction { display: flex; align-items: center; gap: 8px; margin-top: 4px; }

.dshpp-card {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  border-radius: 12px; overflow: hidden;
}
.dshpp-cardHeader {
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding: 10px 14px;
  color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 500; line-height: 18px;
}
.dshpp-cardBody { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }

.dshpp-row { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.dshpp-label { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; flex: none; }
.dshpp-value { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; min-width: 0; overflow-wrap: anywhere; }
.dshpp-mono {
  font-family: var(--ds-font-family-code, ui-monospace, "SF Mono", Menlo, Consolas, "Courier New");
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-markdown-code-block, transparent);
  border-radius: 6px; padding: 2px 6px; overflow-wrap: anywhere;
}
.dshpp-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dshpp-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dshpp-ok { color: var(--dsw-alias-state-success-primary); }
.dshpp-warn { color: var(--dsw-alias-state-warn-label); }
.dshpp-muted { color: var(--dsw-alias-label-caption); }

.dshpp-bundleRow { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.dshpp-bundleName { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; min-width: 0; overflow-wrap: anywhere; flex: 1; }
.dshpp-bundleState { display: inline-flex; align-items: center; gap: 5px; flex: none; font-size: 12px; line-height: 18px; }
.dshpp-bundleState[data-state='pending'] { color: var(--dsw-alias-state-warn-label); }
.dshpp-bundleState[data-state='loaded'] { color: var(--dsw-alias-state-success-primary); }

.dshpp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.dshpp-field { display: flex; flex-direction: column; gap: 4px; }
.dshpp-fieldLabel { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dshpp-input {
  box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base); height: 30px; min-width: 0;
  color: var(--dsw-alias-label-primary); border-radius: 6px; outline: none;
  padding: 0 8px; font-size: 13px; line-height: 20px; width: 100%;
}
.dshpp-input:focus { border-color: var(--dsw-alias-state-business-primary); }
.dshpp-input::placeholder { color: var(--dsw-alias-label-caption); }

.dshpp-profileList { display: flex; flex-direction: column; gap: 2px; }
.dshpp-profileRow {
  display: flex; align-items: center; gap: 8px; min-height: 28px;
  border-radius: 6px; padding: 2px 6px; cursor: pointer;
}
.dshpp-profileRow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshpp-profileName { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }
.dshpp-currentTag {
  flex: none; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px;
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
}

.dshpp-resultRow {
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px 10px;
}
.dshpp-resultProfile { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 500; line-height: 18px; flex: none; }
.dshpp-resultDetail { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.dshpp-checkbox {
  width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-state-business-primary);
  flex: none;
}

.dshpp-modeRow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dshpp-mode {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
  font-size: 12px; line-height: 18px; padding: 3px 10px; cursor: pointer;
}
.dshpp-mode:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshpp-mode:disabled { opacity: 0.45; cursor: not-allowed; }
.dshpp-modeActive {
  border-color: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
}

.dshpp-checkRow { display: flex; align-items: center; gap: 8px; min-height: 24px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshpp-preview {
  display: flex; flex-direction: column; gap: 4px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px 10px;
  font-size: 12px; line-height: 18px; overflow-wrap: anywhere;
}

/* F17: market search results inside the install section. */
.dshpp-marketList { display: flex; flex-direction: column; gap: 6px; }
.dshpp-marketRow {
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 10px;
}
.dshpp-marketName { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; min-width: 0; overflow-wrap: anywhere; }
.dshpp-marketBadge {
  flex: none; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-module-platform, rgba(127, 127, 127, 0.14));
}
.dshpp-marketBadge[data-kind='npm'] { color: var(--dsw-alias-state-business-primary); }
.dshpp-marketStars { flex: none; color: var(--dsw-alias-state-warn-label); font-size: 12px; line-height: 20px; }
.dshpp-marketDesc {
  flex-basis: 100%; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px;
  overflow-wrap: anywhere;
}
.dshpp-input:disabled { opacity: 0.55; }
`

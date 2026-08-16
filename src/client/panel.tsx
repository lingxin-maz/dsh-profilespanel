/**
 * The settings-page panel: profile facts, bundle list with loaded/pending
 * badges, the pending-restart banner with one-click restart, and the
 * multi-profile sync-install section. Styled exclusively with DSH design
 * tokens + the official UI primitives so it follows the active theme.
 */

import { createElement as h, Component, Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { usePanelStatus } from './use-status.ts'
import { panelCss } from './styles.ts'
import { consumePendingTarget } from './market-bridge.ts'
import {
  abbreviatePath,
  asArray,
  dualPair,
  fetchAudit,
  fetchBootReport,
  fetchDiff,
  fetchHealth,
  fetchMarketSearch,
  fetchUpdates,
  postAlign,
  postCancelRestart,
  postHotReload,
  postInstall,
  postInstallPreview,
  postRestart,
  postUndo,
  postUpdate,
  summarizeChanges,
  type AuditEntry,
  type AuditPayload,
  type BootReportEntry,
  type BootReportPayload,
  type BundleRow,
  type HealthIssue,
  type HealthPayload,
  type InstallPreviewResponse,
  type InstallResponse,
  type InstallRowResult,
  type MarketHit,
  type PanelStatus,
  type ProfileDiff,
  type ProfileRow,
  type UndoResponse,
  type UpdateRow,
  type UpdatesPayload,
} from './status-data.ts'

export type Translate = (key: string) => string

/** F8: locale key per bundle source. */
const SOURCE_KEYS: Record<'inbox' | 'dependency' | 'patch', string> = {
  inbox: 'sourceInbox',
  dependency: 'sourceDependency',
  patch: 'sourcePatch',
}

const STYLE_ID = 'dsh-profile-panel-styles'

function installStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = panelCss
  document.head.appendChild(tag)
}

function interpolate(text: string, values: Record<string, string | number>): string {
  let out = text
  for (const [key, value] of Object.entries(values)) out = out.replace(`{${key}}`, String(value))
  return out
}

/**
 * Per-card error boundary: a single card's render failure (e.g. a drifted
 * host payload) degrades to one inline error card instead of unmounting the
 * whole settings section.
 */
class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return h('section', { className: 'dshpp-card' },
        h('div', { className: 'dshpp-cardBody' },
          h('div', { className: 'dshpp-error' }, 'card render failed'),
        ),
      )
    }
    return this.props.children
  }
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function ProfileCard(props: { status: PanelStatus; t: Translate }): ReturnType<typeof h> {
  const { status, t } = props
  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('profileCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-row' },
        h('span', { className: 'dshpp-label' }, t('profileName')),
        h('span', { className: 'dshpp-value' }, status.profileName),
      ),
      h('div', { className: 'dshpp-row' },
        h('span', { className: 'dshpp-label' }, t('profileDir')),
        h('span', { className: 'dshpp-mono' }, abbreviatePath(status.profileDir)),
      ),
      status.manifestError !== undefined
        ? h(Fragment, {},
          h('div', { className: 'dshpp-error' }, t('manifestError')),
          h('div', { className: 'dshpp-hint' }, t('manifestErrorHint')),
        )
        : null,
      status.desktopSelection !== undefined
        ? h('div', { className: 'dshpp-row' },
          h('span', { className: 'dshpp-label' }, t('desktopNextBoot')),
          h('span', {
            className: status.desktopSelection.active !== undefined
              && status.desktopSelection.active !== status.profileName
              ? 'dshpp-value dshpp-warn'
              : 'dshpp-value',
          },
            `${status.desktopSelection.active ?? '?'}`
            + (status.desktopSelection.lastKnownGood !== undefined
              ? `（${t('desktopLastKnownGood')}: ${status.desktopSelection.lastKnownGood}）`
              : '')),
        )
        : null,
    ),
  )
}

function BundleCard(props: { status: PanelStatus; t: Translate }): ReturnType<typeof h> {
  const { status, t } = props
  const [hotBusy, setHotBusy] = useState<string | null>(null)
  const [hotError, setHotError] = useState<string | null>(null)

  const hotReload = async (bundle: string): Promise<void> => {
    setHotBusy(bundle)
    setHotError(null)
    try {
      await postHotReload({ bundle })
    } catch (cause) {
      setHotError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHotBusy(null)
    }
  }

  const bundles = asArray<BundleRow>(status.bundles)
  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('bundleCard')),
    h('div', { className: 'dshpp-cardBody' },
      bundles.length === 0
        ? h('div', { className: 'dshpp-hint' }, t('noBundles'))
        : bundles.map(bundle => h('div', { key: bundle.name, className: 'dshpp-bundleRow' },
          h('span', { className: 'dshpp-bundleName' }, bundle.name),
          bundle.source !== undefined
            ? h('span', { className: 'dshpp-currentTag' }, t(SOURCE_KEYS[bundle.source]))
            : null,
          bundle.hotReloadable === true
            ? h('span', { className: 'dshpp-currentTag' }, t('hotTag'))
            : null,
          h('span', { className: 'dshpp-bundleState', 'data-state': bundle.state },
            h(StateDot, { state: bundle.state === 'pending' ? 'warning' : 'done', size: 8 }),
            bundle.state === 'pending' ? t('pending') : t('loaded'),
          ),
          bundle.state === 'pending' && bundle.hotReloadable === true
            ? h(Button, {
              variant: 'outline',
              size: 'sm',
              disabled: hotBusy !== null,
              onClick: () => void hotReload(bundle.name),
            }, hotBusy === bundle.name ? t('hotReloading') : t('hotReloadButton'))
            : null,
        )),
      hotError !== null ? h('div', { className: 'dshpp-error' }, `${t('hotReloadFailed')}: ${hotError}`) : null,
    ),
  )
}

function RestartCard(props: {
  status: PanelStatus
  t: Translate
  busy: boolean
  message: string | null
  onRestart: () => void
}): ReturnType<typeof h> {
  const { status, t, busy, message, onRestart } = props
  const { restart } = status
  const label = restart.restarting || busy ? t('restarting') : t('restartButton')
  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('restartCard')),
    h('div', { className: 'dshpp-cardBody' },
      restart.available
        ? h(Fragment, {},
          h('div', { className: 'dshpp-hint' }, t('restartAvailableHint')),
          h('div', { className: 'dshpp-actions' },
            h(Button, {
              variant: 'primary',
              size: 'sm',
              disabled: restart.restarting || busy,
              onClick: onRestart,
            }, label),
          ),
          message !== null ? h('div', { className: 'dshpp-warn' }, message) : null,
        )
        : h('div', { className: 'dshpp-hint' }, restart.hint || t('unavailableHint')),
    ),
  )
}

type InstallMode = 'single' | 'dual' | 'custom'

function InstallSection(props: {
  status: PanelStatus
  t: Translate
  onInstalled: () => void
}): ReturnType<typeof h> {
  const { status, t, onInstalled } = props
  const profileRows = asArray<ProfileRow>(status.profiles)
  const [pkg, setPkg] = useState('')
  const [spec, setSpec] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<InstallMode>('single')
  const [modeInitialized, setModeInitialized] = useState(false)
  const [previewChecked, setPreviewChecked] = useState(false)
  const [rollbackChecked, setRollbackChecked] = useState(false)
  const [autoRestartChecked, setAutoRestartChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<InstallResponse | null>(null)
  const [preview, setPreview] = useState<InstallPreviewResponse | null>(null)
  const [undoResult, setUndoResult] = useState<UndoResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // F13: pending auto-restart countdown.
  const [autoRestart, setAutoRestart] = useState<{ cancelToken: string; inMs: number } | null>(null)
  const [countdown, setCountdown] = useState(0)

  // F17: market search state + market → panel jump receive side.
  const [marketQ, setMarketQ] = useState('')
  const [marketHits, setMarketHits] = useState<MarketHit[]>([])
  const [marketMeta, setMarketMeta] = useState<{ source: string; updated: string | null; warning?: string } | null>(null)
  const [marketBusy, setMarketBusy] = useState(false)
  const [marketError, setMarketError] = useState<string | null>(null)

  const desktopDetected = status.desktop.detected
  const currentName = profileRows.find(profile => profile.current)?.name
  const otherEnd = status.desktop.profile
  const dualTargets = useMemo(
    () => currentName !== undefined ? dualPair(currentName, otherEnd) : [],
    [currentName, otherEnd],
  )
  const dualUsable = desktopDetected
    && dualTargets.length > 1
    && dualTargets.every(name => profileRows.some(profile => profile.name === name))

  // F13: when the auto-restart would actually fire vs be skipped.
  const restartUsable = status.restart.available && !status.restart.restarting
  const multiTarget = mode === 'dual'
    ? dualTargets.length > 1
    : mode === 'custom'
      ? selected.size > 1
      : false

  // F16: default to dual mode when a usable desktop end exists.
  useEffect(() => {
    if (modeInitialized || currentName === undefined) return
    setMode(dualUsable ? 'dual' : 'single')
    setModeInitialized(true)
  }, [dualUsable, currentName, modeInitialized])

  // Keep the checkbox set in sync with the active mode (custom is manual).
  useEffect(() => {
    if (currentName === undefined) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (mode === 'single') {
        next.clear()
        next.add(currentName)
      } else if (mode === 'dual') {
        next.clear()
        for (const name of dualTargets) {
          if (status.profiles.some(profile => profile.name === name)) next.add(name)
        }
      }
      return next
    })
  }, [mode, currentName, otherEnd, dualTargets, status.profiles])

  const toggle = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
    setMode('custom')
  }

  // F13: tick the auto-restart countdown once per second.
  useEffect(() => {
    if (autoRestart === null) return
    const timer = setInterval(() => {
      setCountdown((previous) => {
        if (previous <= 1) {
          clearInterval(timer)
          return 0
        }
        return previous - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [autoRestart])

  // F17: debounced market search over the curated registry.
  useEffect(() => {
    const q = marketQ.trim()
    if (q === '') {
      setMarketHits([])
      setMarketMeta(null)
      setMarketBusy(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setMarketBusy(true)
      setMarketError(null)
      void fetchMarketSearch(q).then((payload) => {
        if (cancelled) return
        setMarketHits(asArray<MarketHit>(payload.results))
        setMarketMeta({
          source: payload.source,
          updated: payload.updated,
          ...(payload.warning !== undefined ? { warning: payload.warning } : {}),
        })
      }).catch((cause: unknown) => {
        if (cancelled) return
        setMarketError(cause instanceof Error ? cause.message : String(cause))
      }).finally(() => {
        if (!cancelled) setMarketBusy(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [marketQ])

  // F17: consume a parked market → panel jump target (event or hash deep
  // link) the first time this section mounts, then auto-run the preview.
  useEffect(() => {
    const parked = consumePendingTarget()
    if (parked === null) return
    setPkg(parked.package)
    if (parked.spec !== undefined) setSpec(parked.spec)
    setError(null)
    void runPreviewFor(parked.package, parked.spec)
  }, [])

  const runInstall = async (body: {
    profiles?: string[]
    mode?: 'single' | 'dual' | 'all'
    preview?: boolean
    rollback?: boolean
    autoRestart?: boolean
  }): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const response = await postInstall({
        package: pkg,
        ...(spec.trim() !== '' ? { spec: spec.trim() } : {}),
        ...body,
      })
      setResults(response)
      if (response.autoRestart?.scheduled === true) {
        setAutoRestart({ cancelToken: response.autoRestart.cancelToken, inMs: response.autoRestart.inMs })
        setCountdown(Math.max(1, Math.ceil(response.autoRestart.inMs / 1000)))
      }
      onInstalled()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const cancelAutoRestart = async (): Promise<void> => {
    if (autoRestart === null) return
    try {
      await postCancelRestart(autoRestart.cancelToken)
      setAutoRestart(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const submit = (): void => {
    if (pkg.trim() === '') return
    void runInstall({
      ...(mode === 'custom' ? { profiles: [...selected] } : { mode }),
      ...(previewChecked ? { preview: true } : {}),
      ...(rollbackChecked ? { rollback: true } : {}),
      ...(autoRestartChecked ? { autoRestart: true } : {}),
    })
  }

  const retryProfile = (name: string): void => {
    void runInstall({ profiles: [name], ...(rollbackChecked ? { rollback: true } : {}) })
  }

  const runPreviewFor = async (pkgName: string, specName: string | undefined): Promise<void> => {
    if (pkgName.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      setPreview(await postInstallPreview({
        package: pkgName.trim(),
        ...(specName !== undefined && specName.trim() !== '' ? { spec: specName.trim() } : {}),
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const runPreview = (): void => {
    void runPreviewFor(pkg, spec)
  }

  // F17: carry a market hit into the install fields and preview its source.
  const fillFromMarket = (hit: MarketHit): void => {
    setPkg(hit.installTarget)
    setSpec('')
    setPreview(null)
    setResults(null)
    setError(null)
    void runPreviewFor(hit.installTarget, undefined)
  }

  const runUndo = async (): Promise<void> => {
    if (currentName === undefined) return
    const targets = mode === 'custom'
      ? [...selected]
      : mode === 'dual' && otherEnd !== undefined
        ? [currentName, otherEnd]
        : [currentName]
    if (targets.length === 0) return
    setBusy(true)
    setError(null)
    try {
      setUndoResult(await postUndo({ profiles: targets }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const changed = useMemo(() => results !== null && results.overallOk
    ? t('installDone')
    : results !== null
      ? t('installPartial')
      : null, [results, t])

  // F17: github: targets follow the repo HEAD — no version spec applies.
  const githubTarget = pkg.trim().startsWith('github:')

  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('installCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-hint' }, t('installHint')),
      desktopDetected
        ? h(Fragment, {},
          h('div', { className: 'dshpp-modeRow' },
            h('button', {
              type: 'button',
              className: `dshpp-mode${mode === 'single' ? ' dshpp-modeActive' : ''}`,
              onClick: () => setMode('single'),
            }, t('modeSingle')),
            h('button', {
              type: 'button',
              className: `dshpp-mode${mode === 'dual' ? ' dshpp-modeActive' : ''}`,
              disabled: !dualUsable,
              onClick: () => setMode('dual'),
            }, t('modeDual')),
            h('button', {
              type: 'button',
              className: `dshpp-mode${mode === 'custom' ? ' dshpp-modeActive' : ''}`,
              onClick: () => setMode('custom'),
            }, t('modeCustom')),
          ),
          h('div', { className: 'dshpp-hint' }, t('desktopDetectedHint')),
          !dualUsable
            ? h('div', { className: 'dshpp-warn' }, t('dualUnavailable'))
            : null,
        )
        : null,
      h('div', { className: 'dshpp-field' },
        h('label', { className: 'dshpp-fieldLabel' }, t('packageLabel')),
        h('input', {
          className: 'dshpp-input',
          placeholder: t('packagePlaceholder'),
          value: pkg,
          onChange: event => setPkg(event.target.value),
          spellCheck: false,
        }),
      ),
      h('div', { className: 'dshpp-field' },
        h('label', { className: 'dshpp-fieldLabel' }, t('versionLabel')),
        h('input', {
          className: 'dshpp-input',
          placeholder: githubTarget ? t('githubTargetHint') : t('versionPlaceholder'),
          value: spec,
          disabled: githubTarget,
          onChange: event => setSpec(event.target.value),
          spellCheck: false,
        }),
      ),
      // F17: market search — the same catalog dshmarket browses.
      h('div', { className: 'dshpp-field' },
        h('label', { className: 'dshpp-fieldLabel' }, t('marketSearchLabel')),
        h('input', {
          className: 'dshpp-input',
          placeholder: t('marketSearchPlaceholder'),
          value: marketQ,
          onChange: event => setMarketQ(event.target.value),
          spellCheck: false,
        }),
        marketMeta !== null
          ? h('div', { className: 'dshpp-hint' },
            `${t('marketSource')}: ${t(marketMeta.source === 'live' ? 'marketLive' : marketMeta.source === 'cache' ? 'marketCache' : 'marketSnapshot')}`
            + (marketMeta.updated !== null ? ` · ${marketMeta.updated.slice(0, 10)}` : '')
            + (marketMeta.warning !== undefined ? ` — ${marketMeta.warning}` : ''))
          : null,
        marketError !== null ? h('div', { className: 'dshpp-error' }, `${t('marketError')}: ${marketError}`) : null,
        marketBusy && marketQ.trim() !== '' && marketHits.length === 0
          ? h('div', { className: 'dshpp-hint' }, '…')
          : null,
        marketHits.length > 0
          ? h('div', { className: 'dshpp-marketList' },
            marketHits.map(hit => h('div', {
              key: `${hit.name}${hit.installTarget}`,
              className: 'dshpp-marketRow',
            },
              h('span', { className: 'dshpp-marketName' }, hit.name),
              h('span', { className: 'dshpp-marketBadge', 'data-kind': hit.kind },
                hit.kind === 'npm' ? t('marketNpmBadge') : t('marketGitBadge')),
              hit.stars !== null && hit.stars > 0
                ? h('span', { className: 'dshpp-marketStars' }, `★ ${hit.stars}`)
                : null,
              hit.description !== null
                ? h('div', { className: 'dshpp-marketDesc' }, hit.description)
                : null,
              h(Button, {
                variant: 'outline',
                size: 'sm',
                disabled: busy,
                onClick: () => fillFromMarket(hit),
              }, t('marketFill')),
            )),
          )
          : null,
      ),
      h('div', { className: 'dshpp-field' },
        h('span', { className: 'dshpp-fieldLabel' }, t('profilesLabel')),
        profileRows.length === 0
          ? h('div', { className: 'dshpp-hint' }, t('noProfiles'))
          : h('div', { className: 'dshpp-profileList' },
            profileRows.map(profile => h('label', {
              key: profile.name,
              className: 'dshpp-profileRow',
            },
              h('input', {
                type: 'checkbox',
                className: 'dshpp-checkbox',
                checked: selected.has(profile.name),
                onChange: () => toggle(profile.name),
              }),
              h('span', { className: 'dshpp-profileName' }, profile.name),
              profile.current
                ? h('span', { className: 'dshpp-currentTag' }, t('currentBadge'))
                : null,
            )),
          ),
      ),
      h('div', { className: 'dshpp-field' },
        h('label', { className: 'dshpp-checkRow' },
          h('input', {
            type: 'checkbox',
            className: 'dshpp-checkbox',
            checked: previewChecked,
            onChange: () => setPreviewChecked(checked => !checked),
          }),
          h('span', {}, t('previewCheck')),
        ),
        h('label', { className: 'dshpp-checkRow' },
          h('input', {
            type: 'checkbox',
            className: 'dshpp-checkbox',
            checked: rollbackChecked,
            onChange: () => setRollbackChecked(checked => !checked),
          }),
          h('span', {}, t('rollbackCheck')),
        ),
        h('label', { className: 'dshpp-checkRow' },
          h('input', {
            type: 'checkbox',
            className: 'dshpp-checkbox',
            checked: autoRestartChecked,
            disabled: !restartUsable,
            onChange: () => setAutoRestartChecked(checked => !checked),
          }),
          h('span', {}, t('autoRestartCheck')),
        ),
        // F13: surface why the auto-restart would (not) fire.
        !restartUsable
          ? h('div', { className: 'dshpp-hint' },
            `${t('autoRestartUnavailable')}${status.restart.hint !== '' ? ` — ${status.restart.hint}` : ''}`)
          : multiTarget
            ? h('div', { className: 'dshpp-hint' }, t('autoRestartSingleOnly'))
            : null,
      ),
      h('div', { className: 'dshpp-actions' },
        h(Button, {
          variant: 'primary',
          size: 'sm',
          disabled: busy || pkg.trim() === '' || (mode === 'custom' && selected.size === 0),
          onClick: submit,
        }, busy ? t('installing') : t('installButton')),
        h(Button, {
          variant: 'outline',
          size: 'sm',
          disabled: busy || pkg.trim() === '',
          onClick: () => void runPreview(),
        }, t('previewButton')),
        h(Button, {
          variant: 'outline',
          size: 'sm',
          disabled: busy,
          onClick: () => void runUndo(),
        }, busy && undoResult === null ? t('undoing') : t('undoButton')),
      ),
      error !== null ? h('div', { className: 'dshpp-error' }, error) : null,
      changed !== null ? h('div', { className: results?.overallOk ? 'dshpp-ok' : 'dshpp-warn' }, changed) : null,
      results?.warnings !== undefined && results.warnings.length > 0
        ? h('div', { className: 'dshpp-warn' },
          results.warnings.map(warning => `${warning.code}: ${warning.message}`).join(' · '))
        : null,
      results?.rolledBackProfiles !== undefined && results.rolledBackProfiles.length > 0
        ? h('div', { className: 'dshpp-warn' },
          interpolate(t('rolledBack'), { profiles: results.rolledBackProfiles.join(', ') }))
        : null,
      results?.autoRestartSkipped === true
        ? h('div', { className: 'dshpp-hint' }, t('autoRestartSkipped'))
        : null,
      autoRestart !== null
        ? h('div', { className: 'dshpp-preview' },
          h('div', { className: 'dshpp-warn' }, `${t('autoRestartScheduled')} ${countdown}s`),
          h(Button, {
            variant: 'outline',
            size: 'sm',
            onClick: () => void cancelAutoRestart(),
          }, t('cancelRestart')),
        )
        : null,
      preview !== null
        ? h('div', { className: 'dshpp-preview' },
          h('div', { className: 'dshpp-hint' },
            `${t('previewLatest')} ${preview.latest ?? '?'}${preview.releaseAgeDays !== null ? ` · ${t('previewAgeDays')} ${preview.releaseAgeDays}` : ''}`),
          preview.warnings.map(warning => h('div', {
            key: warning.code,
            className: warning.code === 'release-age' ? 'dshpp-warn' : 'dshpp-hint',
          }, warning.message)),
          preview.suggestedPin !== null
            ? h('div', { className: 'dshpp-hint' }, `${t('previewSuggestedPin')} ${preview.suggestedPin}`)
            : null,
        )
        : null,
      undoResult !== null
        ? h('div', { className: 'dshpp-preview' },
          undoResult.results.map(row => h('div', {
            key: row.profile,
            className: row.ok ? 'dshpp-ok' : 'dshpp-error',
          }, row.ok
            ? `${row.profile}: ${t('undoDone')}${row.hint !== undefined ? ` (${row.hint})` : ''}`
            : `${row.profile}: ${row.error ?? 'unknown error'}`)),
          )
        : null,
      results !== null
        ? results.results.map(row => h('div', { key: row.profile, className: 'dshpp-resultRow' },
          h('span', { className: 'dshpp-resultProfile' }, row.profile),
          row.ok
            ? h(Fragment, {},
              h('span', { className: 'dshpp-resultDetail dshpp-ok' },
                `${t('resolvedAs')} ${row.resolvedVersion ?? '?'}`),
              row.installedAs !== undefined && row.installedAs.length > 0
                ? h('span', { className: 'dshpp-resultDetail dshpp-hint' },
                  `${t('installedAs')}: ${row.installedAs.join(', ')}`)
                : null,
              row.downgraded === true
                ? h('span', { className: 'dshpp-resultDetail dshpp-warn' },
                  interpolate(t('downgradedNote'), {
                    requested: row.requestedVersion ?? '?',
                    resolved: row.resolvedVersion ?? '?',
                  }))
                : null,
            )
            : h(Fragment, {},
              h('span', { className: 'dshpp-resultDetail dshpp-error' },
                `${t('failed')}: ${row.error ?? 'unknown error'}`),
              h(Button, {
                variant: 'outline',
                size: 'sm',
                disabled: busy,
                onClick: () => retryProfile(row.profile),
              }, t('retryProfile')),
            ),
        ))
        : null,
    ),
  )
}

/* ------------------------------------------------------------------ */
/* Updates (F3)                                                        */
/* ------------------------------------------------------------------ */

function UpdatesCard(props: {
  status: PanelStatus
  t: Translate
  onInstalled: () => void
}): ReturnType<typeof h> {
  const { status, t, onInstalled } = props
  const [updates, setUpdates] = useState<UpdatesPayload | null>(null)
  const [results, setResults] = useState<InstallRowResult[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setUpdates(await fetchUpdates())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows = asArray<UpdateRow>(updates?.updates)
  const warnings = asArray<{ code: string; message: string }>(updates?.warnings)
  const outdated = rows.filter(row => row.outdated)

  const updateOne = async (row: UpdateRow): Promise<void> => {
    setBusy(row.bundle)
    setError(null)
    try {
      const response = await postUpdate({
        package: row.bundle,
        ...(row.latest !== null ? { spec: row.latest } : {}),
      })
      setResults(response.results)
      onInstalled()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const updateAll = async (): Promise<void> => {
    setBusy('__all__')
    setError(null)
    try {
      const all: InstallRowResult[] = []
      for (const row of outdated) {
        const response = await postUpdate({
          package: row.bundle,
          ...(row.latest !== null ? { spec: row.latest } : {}),
        })
        all.push(...response.results)
      }
      setResults(all)
      onInstalled()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const alignOne = async (row: UpdateRow): Promise<void> => {
    const names = asArray<ProfileRow>(status.profiles).map(profile => profile.name)
    if (names.length === 0) return
    setBusy(row.bundle)
    setError(null)
    try {
      const response = await postAlign({
        package: row.bundle,
        profiles: names,
        ...(row.latest !== null ? { version: row.latest } : {}),
      })
      setResults(response.results)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('updatesCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-hint' }, t('updatesHint')),
      error !== null ? h('div', { className: 'dshpp-error' }, error) : null,
      updates === null && error === null ? h('div', { className: 'dshpp-hint' }, '…') : null,
      updates !== null && outdated.length === 0
        ? h('div', { className: 'dshpp-ok' }, t('allUpToDate'))
        : null,
      updates?.warnings !== undefined
        ? warnings.map(warning => h('div', {
          key: warning.code + warning.message,
          className: 'dshpp-warn',
        }, `${warning.code}: ${warning.message}`))
        : null,
      outdated.length > 0
        ? h('div', { className: 'dshpp-actions' },
          h(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: busy !== null,
            onClick: () => void updateAll(),
          }, busy === '__all__' ? t('updating') : t('updateAllButton')),
        )
        : null,
      outdated.map(row => h('div', { key: row.bundle, className: 'dshpp-resultRow' },
        h('span', { className: 'dshpp-bundleName' }, row.bundle),
        h('span', { className: 'dshpp-resultDetail' },
          `${row.installed ?? '?'} → ${row.latest ?? '?'}${row.releaseAgeDays !== null ? ` (${row.releaseAgeDays}d)` : ''}`),
        h(Button, {
          variant: 'outline',
          size: 'sm',
          disabled: busy !== null,
          onClick: () => void updateOne(row),
        }, busy === row.bundle ? t('updating') : t('updateButton')),
        asArray<ProfileRow>(status.profiles).length > 1
          ? h(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: busy !== null,
            onClick: () => void alignOne(row),
          }, t('alignButton'))
          : null,
      )),
      results.length > 0
        ? results.map(row => h('div', { key: row.profile, className: 'dshpp-resultRow' },
          h('span', { className: 'dshpp-resultProfile' }, row.profile),
          row.ok
            ? h('span', { className: 'dshpp-resultDetail dshpp-ok' },
              `${t('resolvedAs')} ${row.resolvedVersion ?? '?'}`)
            : h('span', { className: 'dshpp-resultDetail dshpp-error' },
              `${t('failed')}: ${row.error ?? 'unknown error'}`),
        ))
        : null,
    ),
  )
}

/* ------------------------------------------------------------------ */
/* Health (F6)                                                         */
/* ------------------------------------------------------------------ */

function HealthCard(props: { status: PanelStatus; t: Translate }): ReturnType<typeof h> {
  const { t } = props
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setHealth(await fetchHealth())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const severityClass = (severity: string): string =>
    severity === 'error' ? 'dshpp-error' : severity === 'warning' ? 'dshpp-warn' : 'dshpp-hint'

  const issues = asArray<HealthIssue>(health?.issues)
  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('healthCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-hint' }, t('healthHint')),
      error !== null ? h('div', { className: 'dshpp-error' }, error) : null,
      health === null && error === null ? h('div', { className: 'dshpp-hint' }, '…') : null,
      health !== null && issues.length === 0
        ? h('div', { className: 'dshpp-ok' }, t('healthOk'))
        : null,
      issues.map((issue, index) => h('div', {
        key: `${issue.code}-${index}`,
        className: severityClass(issue.severity),
      }, issue.message)),
      health !== null
        ? h(Fragment, {},
          h('div', { className: 'dshpp-fieldLabel' }, t('nextBundlesLabel')),
          h('div', { className: 'dshpp-mono' }, asArray<string>(health?.nextBundles).join(' → ')),
        )
        : null,
    ),
  )
}

/* ------------------------------------------------------------------ */
/* Compare (F7)                                                        */
/* ------------------------------------------------------------------ */

function CompareCard(props: { status: PanelStatus; t: Translate }): ReturnType<typeof h> | null {
  const { status, t } = props
  const names = asArray<ProfileRow>(status.profiles).map(profile => profile.name)
  const [left, setLeft] = useState(names[0] ?? '')
  const [right, setRight] = useState(names[1] ?? names[0] ?? '')
  const [diff, setDiff] = useState<ProfileDiff | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (a: string, b: string) => {
    setError(null)
    try {
      setDiff(await fetchDiff([a, b]))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    if (left !== '' && right !== '') void load(left, right)
  }, [left, right, load])

  if (names.length < 2) return null

  const onlyInA = asArray<string>(diff?.onlyInA)
  const onlyInB = asArray<string>(diff?.onlyInB)
  const versionDiffers = asArray<{ bundle: string; a?: string | null; b?: string | null }>(diff?.versionDiffers)
  const diffProfiles = asArray<string>(diff?.profiles)

  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('compareCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-hint' }, t('compareHint')),
      h('div', { className: 'dshpp-modeRow' },
        h('select', {
          className: 'dshpp-input',
          value: left,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => setLeft(event.target.value),
        },
          names.map(name => h('option', { key: name, value: name }, name))),
        h('span', { className: 'dshpp-hint' }, '↔'),
        h('select', {
          className: 'dshpp-input',
          value: right,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => setRight(event.target.value),
        },
          names.map(name => h('option', { key: name, value: name }, name))),
      ),
      error !== null ? h('div', { className: 'dshpp-error' }, error) : null,
      diff !== null
        ? h(Fragment, {},
          onlyInA.length > 0
            ? h('div', { className: 'dshpp-hint' },
              interpolate(t('compareOnlyInA'), { profile: diffProfiles[0] ?? 'A' }) + ': ' + onlyInA.join(', '))
            : null,
          onlyInB.length > 0
            ? h('div', { className: 'dshpp-hint' },
              interpolate(t('compareOnlyInB'), { profile: diffProfiles[1] ?? 'B' }) + ': ' + onlyInB.join(', '))
            : null,
          versionDiffers.map(row => h('div', { key: row.bundle, className: 'dshpp-resultRow' },
            h('span', { className: 'dshpp-bundleName' }, row.bundle),
            h('span', { className: 'dshpp-resultDetail dshpp-warn' }, `${row.a ?? '?'} ↔ ${row.b ?? '?'}`),
          )),
          onlyInA.length === 0 && onlyInB.length === 0 && versionDiffers.length === 0
            ? h('div', { className: 'dshpp-ok' }, t('compareSame'))
            : null,
        )
        : null,
    ),
  )
}

/* ------------------------------------------------------------------ */
/* Boot report (F9) + Audit (F10)                                      */
/* ------------------------------------------------------------------ */

function BootReportCard(props: { status: PanelStatus; t: Translate }): ReturnType<typeof h> {
  const { t } = props
  const [report, setReport] = useState<BootReportPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setReport(await fetchBootReport())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const failed = asArray<BootReportEntry>(report?.entries).filter(entry => entry.phase === 'failed')
  const entryCount = asArray<BootReportEntry>(report?.entries).length

  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('bootReportCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-hint' }, t('bootReportHint')),
      error !== null ? h('div', { className: 'dshpp-error' }, error) : null,
      report === null && error === null ? h('div', { className: 'dshpp-hint' }, '…') : null,
      report !== null && failed.length === 0
        ? h('div', { className: 'dshpp-ok' }, t('bootAllActive'))
        : null,
      failed.map(entry => h('div', { key: entry.id, className: 'dshpp-resultRow' },
        h('span', { className: 'dshpp-resultProfile' }, entry.module ?? entry.id),
        h('span', { className: 'dshpp-resultDetail dshpp-error' }, entry.error ?? t('bootFailedNoError')),
      )),
      report !== null
        ? h('div', { className: 'dshpp-hint' },
          interpolate(t('bootEntryCount'), { total: entryCount }))
        : null,
    ),
  )
}

function AuditCard(props: { status: PanelStatus; t: Translate }): ReturnType<typeof h> {
  const { t } = props
  const [audit, setAudit] = useState<AuditPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setAudit(await fetchAudit())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const auditEntries = asArray<AuditEntry>(audit?.entries)
  return h('section', { className: 'dshpp-card' },
    h('div', { className: 'dshpp-cardHeader' }, t('auditCard')),
    h('div', { className: 'dshpp-cardBody' },
      h('div', { className: 'dshpp-hint' }, t('auditHint')),
      error !== null ? h('div', { className: 'dshpp-error' }, error) : null,
      audit === null && error === null ? h('div', { className: 'dshpp-hint' }, '…') : null,
      audit !== null && auditEntries.length === 0
        ? h('div', { className: 'dshpp-hint' }, t('auditEmpty'))
        : null,
      auditEntries.map(entry => h('div', {
        key: `${entry.ts}-${entry.action}-${entry.profile}`,
        className: entry.ok ? 'dshpp-ok' : 'dshpp-error',
      },
        [
          new Date(entry.ts).toLocaleString(),
          entry.action,
          entry.profile,
          entry.package ?? '',
          entry.spec !== undefined ? `@${entry.spec}` : '',
          entry.resolved !== undefined ? `→ ${entry.resolved}` : '',
        ].filter(part => part !== '').join(' '),
        entry.error !== null && entry.error !== undefined ? ` (${entry.error})` : '',
      )),
    ),
  )
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function Panel(props: { t: Translate }): ReturnType<typeof h> {
  const { t } = props
  const { status, error, refresh } = usePanelStatus()
  const [restartBusy, setRestartBusy] = useState(false)
  const [restartMessage, setRestartMessage] = useState<string | null>(null)

  useEffect(() => {
    installStyles()
  }, [])

  const requestRestart = async (): Promise<void> => {
    setRestartBusy(true)
    setRestartMessage(null)
    try {
      const response = await postRestart()
      if (response.ok) {
        setRestartMessage(t('restartRequested'))
        return
      }
      const payload = response.payload as { hint?: string; error?: string } | null
      setRestartMessage(payload?.hint ?? payload?.error ?? `restart failed: ${response.status}`)
    } catch (cause) {
      setRestartMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRestartBusy(false)
      refresh()
    }
  }

  if (status === null) {
    return h('div', { className: 'dshpp-root' },
      h('section', { className: 'dshpp-card' },
        h('div', { className: 'dshpp-cardHeader' }, t('nav')),
        h('div', { className: 'dshpp-cardBody' },
          h('div', { className: 'dshpp-warn' }, error ? t('unavailable') : '…'),
          error
            ? h(Fragment, {},
              h('div', { className: 'dshpp-hint' }, t('unavailableHint')),
              h(Button, { variant: 'outline', size: 'sm', onClick: () => refresh() }, t('retry')),
            )
            : null,
        ),
      ),
    )
  }

  return h('div', { className: 'dshpp-root' },
    status.pendingRestart
      ? h('section', { className: 'dshpp-banner' },
        h('div', { className: 'dshpp-bannerTitle' }, t('restartBanner')),
        h('div', { className: 'dshpp-bannerDetail' },
          status.changes !== null ? summarizeChanges(status.changes, t) : t('restartBannerHint')),
        status.restart.available
          ? h('div', { className: 'dshpp-bannerAction' },
            h(Button, {
              variant: 'primary',
              size: 'sm',
              disabled: restartBusy || status.restart.restarting,
              onClick: () => void requestRestart(),
            }, restartBusy || status.restart.restarting ? t('restarting') : t('restartButton')),
            restartMessage !== null ? h('span', { className: 'dshpp-warn' }, restartMessage) : null,
          )
          : h('div', { className: 'dshpp-hint' }, status.restart.hint),
      )
      : asArray<{ profile: string }>(status.profilesPending).length > 0
        ? h('section', { className: 'dshpp-banner' },
          h('div', { className: 'dshpp-bannerTitle' }, t('othersPending')),
          h('div', { className: 'dshpp-bannerDetail' },
            asArray<{ profile: string }>(status.profilesPending).map(row => row.profile).join(', ')),
        )
        : null,
    h(ProfileCard, { status, t }),
    h(BundleCard, { status, t }),
    h(CardBoundary, null, h(UpdatesCard, { status, t, onInstalled: refresh })),
    h(CardBoundary, null, h(HealthCard, { status, t })),
    h(CardBoundary, null, h(CompareCard, { status, t })),
    h(CardBoundary, null, h(BootReportCard, { status, t })),
    h(CardBoundary, null, h(AuditCard, { status, t })),
    h(RestartCard, {
      status,
      t,
      busy: restartBusy,
      message: restartMessage,
      onRestart: () => void requestRestart(),
    }),
    h(InstallSection, { status, t, onInstalled: refresh }),
  )
}

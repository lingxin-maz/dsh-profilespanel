/**
 * dsh-profile-panel client: registers the "Profile / Plugins" settings
 * section rendering the status panel. Built by tsdown into the
 * __ModuleLoader__ factory bundle at client/client.js; the only externals
 * are the loader module table's react and ui-primitives entries.
 */

import { createElement as h } from 'react'
import { en, zh } from './locales.ts'
import { Panel, type Translate } from './panel.tsx'
import { installMarketBridge } from './market-bridge.ts'

const NS = 'dsh-profile-panel'

/** The subset of the locale service this plugin touches. */
interface LocaleService {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): unknown
  bind(namespace: string): Translate
}

/** The subset of the slots service this plugin touches. */
interface SlotsService {
  inject(slot: string, register: () => unknown): void
  register(meta: Record<string, unknown>, component: () => unknown): unknown
}

/** The client cordis context shape this plugin relies on (structural). */
interface PanelClientContext {
  effect(callback: () => unknown, label?: string): void
  locale: LocaleService
  slots: SlotsService
}

export const name = 'dsh-profile-panel'
export const inject = ['slots', 'locale']

export function apply(ctx: PanelClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-profile-panel: dictionaries')
  const t = ctx.locale.bind(NS)

  // F17: receive market deep links (window event + #dshpp-install hash).
  ctx.effect(() => installMarketBridge(), 'dsh-profile-panel: market bridge')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'profile-panel',
    order: 35,
    label: () => t('nav'),
    inject: () => ({ t }),
  }, () => h(Panel, { t })))
}

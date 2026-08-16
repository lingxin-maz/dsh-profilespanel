/**
 * Test double for @deepseek-ai/dsh-client-ui-primitives: the panel only
 * consumes Button and StateDot; the host provides the real atoms at runtime.
 */

import { createElement as h, type ReactNode } from 'react'

export function Button(props: {
  variant?: string
  size?: string
  disabled?: boolean
  className?: string
  onClick?: () => void
  children?: ReactNode
}): ReactNode {
  return h('button', {
    'data-variant': props.variant ?? '',
    disabled: props.disabled ?? false,
    onClick: props.onClick,
  }, props.children)
}

export function StateDot(props: { state?: string; size?: number }): ReactNode {
  return h('span', { 'data-statedot': props.state ?? 'done' })
}

export function Input(props: { className?: string; children?: ReactNode }): ReactNode {
  return h('input', props)
}

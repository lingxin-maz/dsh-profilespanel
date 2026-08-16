/**
 * Ambient types for @deepseek-ai/dsh-client-ui-primitives — provided at
 * runtime by the host's frozen platform module table, never bundled or
 * installed, so the package has no published types to import. Only the
 * members this plugin uses are declared; keep signatures in sync with
 * deepseek-harness/packages/client/ui-primitives/src/.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'

  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
  export function Button(props: {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string | undefined
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>): ReactElement

  export interface IconProps {
    size?: number
    className?: string
  }

  export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error'
  export function StateDot(props: {
    state: StateDotState
    size?: number | undefined
    className?: string | undefined
  }): ReactElement
}

/** Ambient declarations for the browser client bundle. */

interface Window {
  /** Boot manifest written by the host page for bundle-layer plugins. */
  __DSH_BOOT__?: {
    entries?: Array<{ id: string }>
  }
}

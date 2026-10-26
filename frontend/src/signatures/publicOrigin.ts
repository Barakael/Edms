declare const __EDMS_LAN_ORIGIN__: string

/**
 * Origin the iPhone must open. Never hand the phone a localhost URL when a
 * LAN address is available (Vite injects __EDMS_LAN_ORIGIN__ at dev startup).
 */
export function publicCaptureOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const lan = typeof __EDMS_LAN_ORIGIN__ === 'string' ? __EDMS_LAN_ORIGIN__.replace(/\/$/, '') : ''
  if (isLoopbackHost() && lan) return lan

  if (!isLoopbackHost()) return window.location.origin

  // Last resort: still on loopback with no injected LAN — keep origin but callers show a hint
  return lan || window.location.origin
}

export function isLoopbackHost(hostname = window.location.hostname): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    return isLoopbackHost(new URL(origin).hostname)
  } catch {
    return false
  }
}

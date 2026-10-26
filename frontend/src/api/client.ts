const ACCESS_KEY = 'edms_access'
const REFRESH_KEY = 'edms_refresh'

export type User = {
  id: number
  name: string
  email: string
  phone?: string | null
  role: string
  can_download?: boolean
  signature_2fa_enabled?: boolean
  has_signature?: boolean
  step_up_verified_at?: string | null
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY)
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

async function refreshAccess(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return null
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  if (!res.ok) {
    clearTokens()
    return null
  }
  const data = await res.json()
  setTokens(data.access_token, data.refresh_token)
  return data.access_token as string
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    const next = await refreshAccess()
    if (next) return api(path, options, false)
  }

  if (!res.ok) {
    let message = res.statusText
    try {
      const err = await res.json()
      message = err.message || Object.values(err.errors || {}).flat().join(' ') || message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function fetchAuthorizedBlob(path: string): Promise<Blob> {
  const headers = new Headers({ Accept: '*/*' })
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res = await fetch(`/api${path}`, { headers })
  if (res.status === 401) {
    const next = await refreshAccess()
    if (next) {
      headers.set('Authorization', `Bearer ${next}`)
      res = await fetch(`/api${path}`, { headers })
    }
  }
  if (!res.ok) throw new Error('Unable to load file preview')
  return res.blob()
}

export async function login(email: string, password: string) {
  const data = await api<{
    access_token: string
    refresh_token: string
    user: User
  }>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false,
  )
  setTokens(data.access_token, data.refresh_token)
  return data.user
}

export async function logout() {
  const refresh = localStorage.getItem(REFRESH_KEY)
  try {
    await api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refresh }),
    })
  } finally {
    clearTokens()
  }
}

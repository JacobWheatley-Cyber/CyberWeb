const SETTINGS_KEY = 'cyberweb-settings'

function getServerApiKey(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return ''
    return JSON.parse(raw)?.serverApiKey || ''
  } catch { return '' }
}

export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const key = getServerApiKey()
  if (!key) return fetch(url, init)
  const headers = new Headers(init.headers)
  headers.set('X-API-Key', key)
  return fetch(url, { ...init, headers })
}

// Returns the URL with the API key appended as a query param (for EventSource).
export function apiUrl(url: string): string {
  const key = getServerApiKey()
  if (!key) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}api_key=${encodeURIComponent(key)}`
}

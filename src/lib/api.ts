const KEY_STORAGE = 'cyberweb-session-secrets'

export function getSessionSecrets(): { serverApiKey: string; apiKeys: Record<string, string> } {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY_STORAGE) || '{}')
    return {
      serverApiKey: typeof value?.serverApiKey === 'string' ? value.serverApiKey : '',
      apiKeys: value?.apiKeys && typeof value.apiKeys === 'object' ? value.apiKeys : {},
    }
  } catch {
    return { serverApiKey: '', apiKeys: {} }
  }
}

export function setSessionSecrets(secrets: { serverApiKey: string; apiKeys: Record<string, string> }) {
  sessionStorage.setItem(KEY_STORAGE, JSON.stringify(secrets))
}

export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const key = getSessionSecrets().serverApiKey || ''
  const headers = new Headers(init.headers)
  if (key) headers.set('X-API-Key', key)
  return fetch(url, { ...init, headers })
}

export class ApiRequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'The API server is running, but the API key is missing or incorrect. Enter the key from .env in Settings → Security.'
    if (error.status === 429) return 'The API server is busy. Wait for an active scan to finish and try again.'
    if (error.status === 502 || error.status === 503) return 'The web interface cannot reach the API server on port 3001. Check the launcher terminal for the API startup error.'
    return `API request failed (HTTP ${error.status}). Check the launcher terminal for details.`
  }
  return 'Could not reach the API server. Check that CyberWeb.bat is still running and the API started on port 3001.'
}

// Fetch-based SSE keeps the API key in a header and supports cancellation.
export class ApiEventSource {
  private controller = new AbortController()
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  onopen: (() => void) | null = null
  onerror: ((error: unknown) => void) | null = null

  constructor(url: string) { void this.connect(url) }

  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name)!.add(listener)
  }

  close() { this.controller.abort() }

  private dispatch(name: string, data: string) {
    const event = new MessageEvent(name, { data })
    for (const listener of this.listeners.get(name) || []) listener(event)
  }

  private async connect(url: string) {
    try {
      const response = await apiFetch(url, { signal: this.controller.signal })
      if (!response.ok) throw new ApiRequestError(response.status, `HTTP ${response.status}`)
      if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream'))
        throw new Error('API did not return an event stream')
      this.onopen?.()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!this.controller.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const lines = block.split('\n')
          const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message'
          const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (data) this.dispatch(event, data)
          boundary = buffer.indexOf('\n\n')
        }
      }
      if (!this.controller.signal.aborted) this.onerror?.(new Error('Event stream ended unexpectedly'))
    } catch (error) {
      if (!this.controller.signal.aborted) this.onerror?.(error)
    }
  }
}

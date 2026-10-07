const deadline = Date.now() + 30000

async function status(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    await response.body?.cancel()
    return response.status
  } catch { return null }
}

while (Date.now() < deadline) {
  const [ui, api] = await Promise.all([
    status('http://localhost:5173/'),
    status('http://127.0.0.1:3001/api/health'),
  ])
  // A 401 proves the API is live and enforcing its key.
  if (ui === 200 && api === 401) process.exit(0)
  await new Promise(resolve => setTimeout(resolve, 500))
}

console.error('Timed out waiting for the web interface and API server.')
process.exitCode = 1

import { Resolver } from 'dns/promises'

export async function reverseLookup(ip, timeoutMs = 1200) {
  const resolver = new Resolver()
  let timer
  try {
    const names = await Promise.race([
      resolver.reverse(ip),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          resolver.cancel()
          reject(new Error('Reverse DNS timeout'))
        }, timeoutMs)
      }),
    ])
    return names[0] || ''
  } catch { return '' }
  finally { clearTimeout(timer) }
}

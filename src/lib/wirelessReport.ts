// Types (mirrored from WirelessAnalyzer — structural match)
interface BssidInfo { signal: number; channel: string; mac: string; radioType: string }
interface PatchStep  { label: string; detail: string }
interface WifiNetwork { ssid: string; authentication: string; encryption: string; bssids: BssidInfo[] }
interface WifiFinding {
  ssid: string; authentication: string; encryption: string; bssids: BssidInfo[]
  severity: string; cvss: number; title: string; description: string
  remediation: string; tags: string[]; patchSteps: PatchStep[]
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutSegment(cx: number, cy: number, outerR: number, innerR: number, start: number, end: number): string {
  const s = end - start >= 360 ? start + 359.99 : end
  const o1 = polar(cx, cy, outerR, start), o2 = polar(cx, cy, outerR, s)
  const i1 = polar(cx, cy, innerR, s),    i2 = polar(cx, cy, innerR, start)
  const large = s - start > 180 ? 1 : 0
  const f = (n: number) => n.toFixed(2)
  return `M${f(o1.x)},${f(o1.y)} A${outerR},${outerR},0,${large},1,${f(o2.x)},${f(o2.y)} L${f(i1.x)},${f(i1.y)} A${innerR},${innerR},0,${large},0,${f(i2.x)},${f(i2.y)} Z`
}

function signalBarsHTML(pct: number): string {
  const filled = pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : pct >= 20 ? 1 : 0
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'
  const bars = [1, 2, 3, 4].map(i =>
    `<span style="display:inline-block;width:5px;border-radius:2px;background:${filled >= i ? color : '#e2e8f0'};height:${i * 4}px;vertical-align:bottom"></span>`
  ).join('')
  return `<span style="display:inline-flex;align-items:flex-end;gap:2px">${bars}</span> <span style="font-size:11px;color:#64748b">${pct}%</span>`
}

// ── Color maps ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#94a3b8', info: '#60a5fa',
}
const SEV_BG: Record<string, string> = {
  critical: '#fef2f2', high: '#fff7ed', medium: '#fffbeb', low: '#f8fafc', info: '#eff6ff',
}
const SEV_BORDER: Record<string, string> = {
  critical: '#fecaca', high: '#fed7aa', medium: '#fde68a', low: '#e2e8f0', info: '#bfdbfe',
}

const SEC_COLOR: Record<string, string> = {
  open: '#ef4444', wep: '#f97316', wpa: '#f59e0b', wpa2: '#3b82f6', wpa3: '#22c55e', unknown: '#94a3b8',
}

function secLevel(auth: string): string {
  const a = (auth || '').toLowerCase()
  if (!a || a === 'open' || a === 'none') return 'open'
  if (a.includes('wpa3')) return 'wpa3'
  if (a.includes('wpa2')) return 'wpa2'
  if (a.includes('wpa')) return 'wpa'
  if (a.includes('wep')) return 'wep'
  return 'unknown'
}

function secLabel(auth: string): string {
  const l = secLevel(auth)
  if (l === 'open') return 'Open'
  if (l === 'wpa3') return 'WPA3'
  if (l === 'wpa2') return auth?.toLowerCase().includes('enterprise') ? 'WPA2-Enterprise' : 'WPA2'
  if (l === 'wpa') return 'WPA'
  if (l === 'wep') return 'WEP'
  return auth || '—'
}

function getBest(n: WifiNetwork) {
  return n.bssids.length ? Math.max(...n.bssids.map(b => b.signal)) : 0
}

function getChannel(n: WifiNetwork): string {
  const ch = parseInt(n.bssids[0]?.channel || '')
  if (isNaN(ch)) return '—'
  return ch > 14 ? `5 GHz / ${ch}` : `2.4 GHz / ${ch}`
}

// ── Executive summary paragraph ───────────────────────────────────────────────

function summaryText(networks: WifiNetwork[], findings: WifiFinding[]): string {
  const critical = findings.filter(f => f.severity === 'critical').length
  const high     = findings.filter(f => f.severity === 'high').length
  const openNets = networks.filter(n => secLevel(n.authentication) === 'open').length
  const wpa3Nets = networks.filter(n => secLevel(n.authentication) === 'wpa3').length

  const parts: string[] = []
  parts.push(`This wireless security assessment identified <strong>${networks.length} network${networks.length !== 1 ? 's' : ''}</strong> within radio range.`)

  if (critical > 0)
    parts.push(`<strong>${critical} critical-severity finding${critical !== 1 ? 's' : ''}</strong> require immediate remediation — these vulnerabilities can be exploited by an unskilled attacker with freely available tools.`)
  if (high > 0)
    parts.push(`An additional <strong>${high} high-severity finding${high !== 1 ? 's' : ''}</strong> present significant risk and should be addressed within 24 hours.`)
  if (openNets > 0)
    parts.push(`<strong>${openNets} network${openNets !== 1 ? 's are' : ' is'} completely unencrypted</strong> — all traffic on ${openNets !== 1 ? 'these networks' : 'this network'} is visible in plaintext to any nearby device.`)
  if (wpa3Nets > 0 && findings.length === 0)
    parts.push(`All networks use modern WPA3 encryption. No immediate remediation actions are required.`)
  else if (findings.length === 0)
    parts.push(`No exploitable security issues were detected. Continue monitoring and ensure router firmware remains up to date.`)

  return parts.join(' ')
}

// ── DonutChart SVG ────────────────────────────────────────────────────────────

function buildDonut(counts: Record<string, number>, total: number): string {
  if (total === 0) {
    return `<svg width="180" height="180" viewBox="0 0 180 180">
      <circle cx="90" cy="90" r="62" fill="none" stroke="#e2e8f0" stroke-width="22"/>
      <text x="90" y="86" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#94a3b8">0</text>
      <text x="90" y="104" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">findings</text>
    </svg>`
  }

  const segs = [
    { key: 'critical', color: '#ef4444' },
    { key: 'high',     color: '#f97316' },
    { key: 'medium',   color: '#f59e0b' },
    { key: 'low',      color: '#94a3b8' },
    { key: 'info',     color: '#60a5fa' },
  ].filter(s => counts[s.key] > 0)

  let deg = 0
  const paths = segs.map(seg => {
    const angle = (counts[seg.key] / total) * 360
    const p = donutSegment(90, 90, 80, 56, deg, deg + angle)
    deg += angle
    return `<path d="${p}" fill="${seg.color}"/>`
  }).join('\n    ')

  return `<svg width="180" height="180" viewBox="0 0 180 180">
    <circle cx="90" cy="90" r="68" fill="none" stroke="#f1f5f9" stroke-width="24"/>
    ${paths}
    <text x="90" y="84" text-anchor="middle" font-family="system-ui,sans-serif" font-size="30" font-weight="800" fill="#0f172a">${total}</text>
    <text x="90" y="103" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">finding${total !== 1 ? 's' : ''}</text>
  </svg>`
}

// ── Protocol distribution bar chart SVG ──────────────────────────────────────

function buildProtocolChart(networks: WifiNetwork[]): string {
  const groups: Record<string, { color: string; label: string; count: number }> = {
    wpa3:    { color: '#22c55e', label: 'WPA3',    count: 0 },
    wpa2:    { color: '#3b82f6', label: 'WPA2',    count: 0 },
    wpa:     { color: '#f59e0b', label: 'WPA',     count: 0 },
    wep:     { color: '#f97316', label: 'WEP',     count: 0 },
    open:    { color: '#ef4444', label: 'Open',    count: 0 },
    unknown: { color: '#94a3b8', label: 'Unknown', count: 0 },
  }

  for (const n of networks) groups[secLevel(n.authentication)].count++

  const entries = Object.values(groups).filter(g => g.count > 0)
  const maxCount = Math.max(...entries.map(g => g.count), 1)
  const BAR_W = 240

  const rows = entries.map(g => {
    const w = Math.round((g.count / maxCount) * BAR_W)
    return `
    <g>
      <text x="52" y="0" text-anchor="end" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="#475569">${g.label}</text>
      <rect x="58" y="-10" width="${w}" height="20" rx="4" fill="${g.color}" opacity="0.85"/>
      ${w > 28 ? `<text x="${58 + w - 7}" y="0" text-anchor="end" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="white">${g.count}</text>` : `<text x="${58 + w + 6}" y="0" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="${g.color}">${g.count}</text>`}
    </g>`
  })

  const height = entries.length * 32 + 10
  const transforms = entries.map((_, i) => `<g transform="translate(0,${20 + i * 32})">${rows[i]}</g>`)

  return `<svg width="320" height="${height}" viewBox="0 0 320 ${height}" font-family="system-ui,sans-serif">
    ${transforms.join('\n    ')}
  </svg>`
}

// ── Finding card HTML ─────────────────────────────────────────────────────────

function findingHTML(f: WifiFinding, i: number): string {
  const sev = f.severity
  const color  = SEV_COLOR[sev]  || '#94a3b8'
  const bg     = SEV_BG[sev]     || '#f8fafc'
  const border = SEV_BORDER[sev] || '#e2e8f0'

  const patchList = f.patchSteps.map((step, j) => `
    <div style="display:flex;gap:12px;margin-bottom:10px">
      <div style="width:22px;height:22px;border-radius:50%;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#64748b;flex-shrink:0">${j + 1}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:2px">${step.label}</div>
        <div style="font-size:12px;color:#64748b;line-height:1.5">${step.detail}</div>
      </div>
    </div>`).join('')

  const tagPills = f.tags.map(t =>
    `<span style="padding:2px 8px;border-radius:12px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:10px;color:#64748b">${t}</span>`
  ).join(' ')

  return `
  <div style="border:1px solid ${border};border-radius:10px;overflow:hidden;margin-bottom:16px;border-left:4px solid ${color}">
    <div style="padding:18px 20px;background:${bg}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <span style="padding:3px 10px;border-radius:5px;background:${color};color:white;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">${sev}</span>
        <span style="padding:3px 8px;border-radius:5px;background:white;border:1px solid #e2e8f0;font-size:11px;font-family:monospace;color:#475569">CVSS ${f.cvss.toFixed(1)}</span>
        <span style="font-size:11px;color:#94a3b8">Finding ${i + 1}</span>
      </div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:5px">${f.title}</div>
      <div style="font-size:12px;color:#94a3b8">
        ${f.ssid ? `<strong style="color:#475569">${f.ssid}</strong>` : '<em>Hidden Network</em>'}
        ${f.authentication ? ` &middot; ${f.authentication}` : ''}
        ${f.encryption ? ` &middot; ${f.encryption}` : ''}
        ${f.bssids.length > 0 ? ` &middot; ${f.bssids.length} AP${f.bssids.length !== 1 ? 's' : ''}` : ''}
      </div>
      ${tagPills ? `<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">${tagPills}</div>` : ''}
    </div>
    <div style="padding:18px 20px;background:white;border-top:1px solid ${border}">
      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:6px">Description</div>
        <div style="font-size:13px;color:#475569;line-height:1.65">${f.description}</div>
      </div>
      <div style="margin-bottom:${f.patchSteps.length > 0 ? '18px' : '0'}">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:6px">Remediation Summary</div>
        <div style="font-size:13px;color:#475569;line-height:1.65">${f.remediation}</div>
      </div>
      ${f.patchSteps.length > 0 ? `
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:12px">Remediation Checklist</div>
        ${patchList}
      </div>` : ''}
    </div>
  </div>`
}

// ── Network inventory table ───────────────────────────────────────────────────

function networkTableHTML(networks: WifiNetwork[], findings: WifiFinding[]): string {
  const rows = networks
    .slice()
    .sort((a, b) => getBest(b) - getBest(a))
    .map(n => {
      const level = secLevel(n.authentication)
      const color = SEC_COLOR[level] || '#94a3b8'
      const label = secLabel(n.authentication)
      const issueCount = findings.filter(f => f.ssid === n.ssid || (!f.ssid && !n.ssid)).length
      const best = getBest(n)
      return `
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#0f172a">${n.ssid || '<em style="color:#94a3b8">Hidden</em>'}</td>
        <td style="padding:10px 14px"><span style="padding:2px 9px;border-radius:5px;background:${color}18;color:${color};font-size:11px;font-weight:700;border:1px solid ${color}30">${label}</span></td>
        <td style="padding:10px 14px;font-size:12px;color:#475569">${n.encryption || '—'}</td>
        <td style="padding:10px 14px;font-size:12px;color:#475569">${getChannel(n)}</td>
        <td style="padding:10px 14px">${signalBarsHTML(best)}</td>
        <td style="padding:10px 14px;font-size:12px;color:#64748b;text-align:center">${n.bssids.length}</td>
        <td style="padding:10px 14px;text-align:center">
          ${issueCount > 0
            ? `<span style="padding:2px 9px;border-radius:5px;background:#fef2f2;color:#ef4444;font-size:11px;font-weight:700;border:1px solid #fecaca">${issueCount}</span>`
            : `<span style="font-size:12px;color:#22c55e;font-weight:600">✓</span>`}
        </td>
      </tr>`
    }).join('\n')

  return `
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="background:#f8fafc">
        ${['SSID', 'Security', 'Encryption', 'Channel', 'Signal', 'APs', 'Issues'].map(h =>
          `<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;border-bottom:2px solid #e2e8f0">${h}</th>`
        ).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateHTMLReport(networks: WifiNetwork[], findings: WifiFinding[]): string {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
    info:     findings.filter(f => f.severity === 'info').length,
  }
  const total = findings.length
  const openCount = networks.filter(n => secLevel(n.authentication) === 'open').length

  const overallRisk = counts.critical > 0 ? 'CRITICAL'
    : counts.high > 0 ? 'HIGH'
    : counts.medium > 0 ? 'MEDIUM'
    : counts.low > 0 ? 'LOW'
    : 'SECURE'

  const riskColor = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#94a3b8', SECURE: '#22c55e' }[overallRisk]!

  const donut = buildDonut(counts, total)
  const protocolChart = buildProtocolChart(networks)
  const findingCards = findings.map((f, i) => findingHTML(f, i)).join('\n')
  const networkTable = networkTableHTML(networks, findings)
  const summary = summaryText(networks, findings)

  const legendItems = [
    { color: '#ef4444', label: 'Critical', count: counts.critical },
    { color: '#f97316', label: 'High',     count: counts.high },
    { color: '#f59e0b', label: 'Medium',   count: counts.medium },
    { color: '#94a3b8', label: 'Low',      count: counts.low },
  ].filter(l => l.count > 0).map(l =>
    `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475569">
      <span style="width:12px;height:12px;border-radius:3px;background:${l.color};flex-shrink:0"></span>
      <span>${l.label}</span>
      <span style="font-weight:700;color:#0f172a;margin-left:auto;padding-left:16px">${l.count}</span>
    </div>`
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wireless Security Report — CyberWeb</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f1f5f9;color:#0f172a;-webkit-font-smoothing:antialiased}
  @media print{
    body{background:white}
    .no-print{display:none}
    .page-card{box-shadow:none;border:1px solid #e2e8f0}
  }
</style>
</head>
<body>

<!-- ── Header ── -->
<div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:white;padding:36px 56px">
  <div style="max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap">
    <div>
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#e11d48;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
        CyberWeb · Wireless Security Assessment
      </div>
      <h1 style="font-size:26px;font-weight:800;letter-spacing:-.02em">Wireless Security Report</h1>
      <p style="font-size:13px;color:#94a3b8;margin-top:6px">${date} &nbsp;·&nbsp; ${time}</p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
      <div style="padding:8px 20px;border-radius:8px;background:${riskColor};font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">
        ${overallRisk} RISK
      </div>
      <div style="font-size:12px;color:#64748b">${networks.length} networks &nbsp;·&nbsp; ${total} finding${total !== 1 ? 's' : ''}</div>
    </div>
  </div>
</div>

<div style="max-width:1100px;margin:0 auto;padding:40px 56px 60px">

  <!-- ── Executive Summary ── -->
  <div class="page-card" style="background:white;border-radius:12px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)">
    <h2 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #f1f5f9">Executive Summary</h2>

    <!-- Stat cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      ${[
        { value: networks.length, label: 'Networks', sub: 'discovered',    color: '#3b82f6' },
        { value: counts.critical, label: 'Critical',  sub: 'severity',     color: counts.critical > 0 ? '#ef4444' : '#94a3b8' },
        { value: counts.high,     label: 'High',      sub: 'severity',     color: counts.high > 0 ? '#f97316' : '#94a3b8' },
        { value: openCount,       label: 'Open',      sub: 'no encryption', color: openCount > 0 ? '#ef4444' : '#94a3b8' },
      ].map(s => `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;text-align:center">
        <div style="font-size:40px;font-weight:800;color:${s.color};line-height:1">${s.value}</div>
        <div style="font-size:12px;font-weight:700;color:#475569;margin-top:6px;text-transform:uppercase;letter-spacing:.05em">${s.label}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">${s.sub}</div>
      </div>`).join('\n')}
    </div>

    <p style="font-size:14px;color:#475569;line-height:1.8">${summary}</p>
  </div>

  <!-- ── Risk Distribution ── -->
  <div class="page-card" style="background:white;border-radius:12px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)">
    <h2 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #f1f5f9">Risk Distribution</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center">

      <!-- Donut chart -->
      <div>
        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:16px">Findings by Severity</div>
        <div style="display:flex;align-items:center;gap:32px">
          ${donut}
          <div style="display:flex;flex-direction:column;gap:10px;flex:1">
            ${legendItems || '<div style="font-size:13px;color:#94a3b8">No findings</div>'}
          </div>
        </div>
      </div>

      <!-- Protocol chart -->
      <div>
        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:16px">Networks by Security Protocol</div>
        ${protocolChart}
      </div>

    </div>
  </div>

  ${total > 0 ? `
  <!-- ── Security Findings ── -->
  <div class="page-card" style="background:white;border-radius:12px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)">
    <h2 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #f1f5f9">Security Findings <span style="font-weight:400;color:#cbd5e1">(${total})</span></h2>
    ${findingCards}
  </div>` : `
  <!-- ── No Findings ── -->
  <div class="page-card" style="background:white;border-radius:12px;padding:48px 32px;margin-bottom:24px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)">
    <div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #bbf7d0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">No Security Issues Detected</h3>
    <p style="font-size:14px;color:#64748b">All ${networks.length} network${networks.length !== 1 ? 's' : ''} passed security checks. Continue monitoring and ensure firmware stays up to date.</p>
  </div>`}

  <!-- ── Network Inventory ── -->
  <div class="page-card" style="background:white;border-radius:12px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)">
    <h2 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #f1f5f9">Network Inventory <span style="font-weight:400;color:#cbd5e1">(${networks.length})</span></h2>
    ${networkTable}
  </div>

  <!-- ── Footer ── -->
  <div style="text-align:center;padding:24px 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:8px">
    <p style="margin-bottom:4px">Generated by <strong style="color:#e11d48">CyberWeb</strong> Wireless Analyzer &nbsp;·&nbsp; ${date}</p>
    <p>This report is for authorized security assessment purposes only. Handle according to your organization's data classification policy.</p>
  </div>

</div>
</body>
</html>`
}

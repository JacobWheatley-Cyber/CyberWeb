import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import exifr from 'exifr'
import {
  MapPin, Upload, X, Camera, Navigation,
  ExternalLink, Copy, Check, AlertCircle, Image as ImageIcon,
  Shield, Sun, Clock, Cpu, Eye, Search, Compass, Info, Globe,
} from 'lucide-react'
import { useSettingsContext } from '../../context/SettingsContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawExif {
  latitude?: number
  longitude?: number
  GPSAltitude?: number
  DateTimeOriginal?: Date
  OffsetTimeOriginal?: string
  Make?: string
  Model?: string
  Software?: string
  ExposureTime?: number
  FNumber?: number
  ISO?: number
  FocalLength?: number
  ImageWidth?: number
  ImageHeight?: number
}

type SignalStatus = 'running' | 'found' | 'partial' | 'not-found' | 'unavailable'

interface SignalResult {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>
  name: string
  description: string
  status: SignalStatus
  confidence: number
  finding: string | null
  detail: string | null
  location?: {
    lat?: number
    lng?: number
    lngBand?: [number, number]
    regions?: string[]
  }
}

// ── Timezone lookup ───────────────────────────────────────────────────────────

const TIMEZONE_REGIONS: Record<string, string[]> = {
  '-12:00': ['Baker Island', 'Howland Island'],
  '-11:00': ['American Samoa', 'Niue'],
  '-10:00': ['Hawaii (US)', 'Cook Islands'],
  '-09:00': ['Alaska (US)'],
  '-08:00': ['Pacific US/Canada', 'Baja California'],
  '-07:00': ['Mountain US/Canada', 'Arizona'],
  '-06:00': ['Central US/Canada', 'Mexico City', 'Guatemala'],
  '-05:00': ['Eastern US/Canada', 'Colombia', 'Peru', 'Ecuador'],
  '-04:00': ['Atlantic Canada', 'Venezuela', 'Bolivia', 'Chile'],
  '-03:00': ['Argentina', 'Brazil (East)', 'Uruguay'],
  '-02:00': ['South Georgia', 'Fernando de Noronha'],
  '-01:00': ['Azores', 'Cape Verde'],
  '+00:00': ['United Kingdom', 'Ireland', 'Portugal', 'Iceland', 'Ghana'],
  '+01:00': ['Central Europe', 'France', 'Germany', 'Spain', 'Italy', 'Nigeria', 'Morocco'],
  '+02:00': ['Eastern Europe', 'South Africa', 'Egypt', 'Israel', 'Jordan', 'Finland'],
  '+03:00': ['Moscow', 'Turkey', 'Saudi Arabia', 'Kenya', 'Ethiopia', 'Iraq'],
  '+03:30': ['Iran'],
  '+04:00': ['UAE', 'Azerbaijan', 'Georgia', 'Armenia'],
  '+04:30': ['Afghanistan'],
  '+05:00': ['Pakistan', 'Uzbekistan', 'Tajikistan'],
  '+05:30': ['India', 'Sri Lanka'],
  '+05:45': ['Nepal'],
  '+06:00': ['Bangladesh', 'Bhutan', 'Kyrgyzstan'],
  '+06:30': ['Myanmar', 'Cocos Islands'],
  '+07:00': ['Thailand', 'Vietnam', 'Cambodia', 'Laos', 'Indonesia (West)'],
  '+08:00': ['China', 'Taiwan', 'Hong Kong', 'Malaysia', 'Singapore', 'Philippines', 'Australia (West)'],
  '+09:00': ['Japan', 'South Korea', 'Indonesia (East)'],
  '+09:30': ['Australia (Central)'],
  '+10:00': ['Australia (East)', 'Papua New Guinea', 'Guam'],
  '+11:00': ['Solomon Islands', 'New Caledonia', 'Vanuatu'],
  '+12:00': ['New Zealand', 'Fiji'],
  '+13:00': ['Tonga', 'Samoa'],
}

// ── EXIF signal helpers ───────────────────────────────────────────────────────

function parseUtcOffset(offset: string): number | null {
  const m = offset.match(/([+-])(\d{2}):(\d{2})/)
  if (!m) return null
  return (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) + parseInt(m[3]) / 60)
}

function findTimezoneKey(h: number): string {
  const r = Math.round(h * 2) / 2
  const sign = r >= 0 ? '+' : '-'
  const abs = Math.abs(r)
  return `${sign}${String(Math.floor(abs)).padStart(2, '0')}:${abs % 1 === 0.5 ? '30' : '00'}`
}

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
function toCardinal(deg: number) { return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16] }

function solarPosition(utcDate: Date, latDeg: number, lngDeg: number) {
  const jd = utcDate.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360
  const gRad = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * (Math.PI / 180)
  const lambdaRad = (L + 1.915 * Math.sin(gRad) + 0.02 * Math.sin(2 * gRad)) * (Math.PI / 180)
  const eps = 23.439 * (Math.PI / 180)
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambdaRad), Math.cos(lambdaRad))
  const delta = Math.asin(Math.sin(eps) * Math.sin(lambdaRad))
  const ut = utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60 + utcDate.getUTCSeconds() / 3600
  const gmst = (6.697375 + 0.0657098242 * n + ut) % 24
  const lmst = ((gmst + lngDeg / 15) % 24 + 24) % 24
  const ha = (lmst * 15 - alpha * (180 / Math.PI)) * (Math.PI / 180)
  const latRad = latDeg * (Math.PI / 180)
  const elevation = Math.asin(Math.sin(latRad) * Math.sin(delta) + Math.cos(latRad) * Math.cos(delta) * Math.cos(ha)) * (180 / Math.PI)
  const azimuth = Math.atan2(-Math.cos(delta) * Math.sin(ha), Math.sin(delta) * Math.cos(latRad) - Math.cos(delta) * Math.cos(ha) * Math.sin(latRad)) * (180 / Math.PI)
  return { azimuth: ((azimuth + 360) % 360), elevation }
}

function inferDeviceOrigin(make?: string, model?: string): { hint: string; confidence: number } | null {
  if (!make) return null
  const m = make.toLowerCase()
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco'))
    return { hint: 'China / India / Southeast Asia (Xiaomi primary markets)', confidence: 25 }
  if (m.includes('huawei') || m.includes('honor'))
    return { hint: 'China / Europe / Middle East (Huawei primary markets)', confidence: 20 }
  if (m.includes('oppo') || m.includes('oneplus') || m.includes('realme') || m.includes('vivo'))
    return { hint: 'China / India / Southeast Asia (BBK Electronics brands)', confidence: 25 }
  if (m.includes('apple'))
    return { hint: 'Global market — Apple sold in 100+ countries (no region inference)', confidence: 5 }
  if (m.includes('samsung'))
    return { hint: 'Global market — Samsung sold worldwide (no strong region inference)', confidence: 8 }
  if (m.includes('google') || model?.toLowerCase().includes('pixel'))
    return { hint: 'US-primary market (Pixel device)', confidence: 20 }
  if (m.includes('dji'))
    return { hint: 'Drone image — DJI based in Shenzhen, sold globally', confidence: 10 }
  if (['canon','nikon','sony','fujifilm','olympus','panasonic','leica'].some(b => m.includes(b)))
    return { hint: `Japanese camera manufacturer (${make}) — sold globally, no region inference`, confidence: 5 }
  return { hint: `Manufacturer: ${make}`, confidence: 5 }
}

function buildExifSignals(raw: RawExif): SignalResult[] {
  const signals: SignalResult[] = []

  // GPS
  if (raw.latitude != null && raw.longitude != null) {
    signals.push({
      id: 'gps', icon: Navigation, name: 'GPS EXIF',
      description: 'Embedded GPS coordinates in image metadata',
      status: 'found', confidence: 98,
      finding: `${raw.latitude.toFixed(6)}°, ${raw.longitude.toFixed(6)}°`,
      detail: raw.GPSAltitude != null ? `Altitude: ${raw.GPSAltitude.toFixed(1)} m above sea level` : null,
      location: { lat: raw.latitude, lng: raw.longitude },
    })
  } else {
    signals.push({
      id: 'gps', icon: Navigation, name: 'GPS EXIF',
      description: 'Embedded GPS coordinates in image metadata',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'GPS absent — location services were disabled, or metadata was stripped before upload.',
    })
  }

  // Timezone
  const utcOffset = raw.OffsetTimeOriginal
  const offsetHours = utcOffset ? parseUtcOffset(utcOffset) : null
  if (utcOffset && offsetHours != null) {
    const centerLng = offsetHours * 15
    const regions = TIMEZONE_REGIONS[findTimezoneKey(offsetHours)] ?? ['Unknown region']
    signals.push({
      id: 'timezone', icon: Clock, name: 'UTC Offset / Timezone',
      description: 'Camera timezone offset → longitude band inference',
      status: 'found', confidence: 55,
      finding: `${utcOffset} → ~${centerLng >= 0 ? '+' : ''}${centerLng.toFixed(0)}° longitude (±7.5°)`,
      detail: `Candidate regions: ${regions.slice(0, 5).join(', ')}`,
      location: { lngBand: [centerLng - 7.5, centerLng + 7.5], regions },
    })
  } else {
    signals.push({
      id: 'timezone', icon: Clock, name: 'UTC Offset / Timezone',
      description: 'Camera timezone offset → longitude band inference',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'No UTC offset tag found (OffsetTimeOriginal missing).',
    })
  }

  // Device origin
  const deviceHint = inferDeviceOrigin(raw.Make, raw.Model)
  if (raw.Make || raw.Model) {
    signals.push({
      id: 'device', icon: Cpu, name: 'Device Origin',
      description: 'Manufacturer market distribution hint',
      status: 'partial', confidence: deviceHint?.confidence ?? 5,
      finding: `${raw.Make ?? ''} ${raw.Model ?? ''}`.trim(),
      detail: deviceHint?.hint ?? 'No regional inference for this manufacturer.',
    })
  } else {
    signals.push({
      id: 'device', icon: Cpu, name: 'Device Origin',
      description: 'Manufacturer market distribution hint',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'No device information found in EXIF.',
    })
  }

  // Sun position
  const captureDate = raw.DateTimeOriginal
  if (captureDate && offsetHours != null) {
    const utcDate = new Date(captureDate.getTime() - offsetHours * 3600000)
    const estLng = offsetHours * 15
    const sol = solarPosition(utcDate, 45, estLng)
    const shadowDir = (sol.azimuth + 180) % 360
    const isNight = sol.elevation < -6
    signals.push({
      id: 'sun', icon: Sun, name: 'Sun Position Reference',
      description: 'Solar angle at capture time — compare to shadows in image',
      status: 'partial', confidence: 0,
      finding: isNight
        ? `Sun below horizon (${sol.elevation.toFixed(1)}°) — night photo`
        : `Azimuth ${sol.azimuth.toFixed(0)}° (${toCardinal(sol.azimuth)}), elevation ${sol.elevation.toFixed(1)}°`,
      detail: isNight
        ? 'Cannot verify location via shadows — photo taken at night.'
        : `Shadow direction should point ~${shadowDir.toFixed(0)}° (${toCardinal(shadowDir)}). Computed at est. longitude ${estLng.toFixed(0)}° using 45°N reference.`,
    })
  } else {
    signals.push({
      id: 'sun', icon: Sun, name: 'Sun Position Reference',
      description: 'Solar angle at capture time — compare to shadows in image',
      status: captureDate ? 'partial' : 'not-found', confidence: 0,
      finding: captureDate ? 'Capture time known but UTC offset missing' : null,
      detail: 'Requires capture timestamp + UTC offset to compute solar position.',
    })
  }

  return signals
}

// ── OCR text parsing ──────────────────────────────────────────────────────────

function parseOcrFindings(text: string): { clues: string[]; regions: string[]; confidence: number } {
  const clues: string[] = []
  const regions: string[] = []

  // Script detection via Unicode ranges
  if (/[一-鿿]/.test(text))         { clues.push('CJK characters detected');               regions.push('China / Japan / Korea') }
  if (/[぀-ゟ゠-ヿ]/.test(text)) { clues.push('Japanese Hiragana/Katakana detected'); regions.push('Japan') }
  if (/[가-힯]/.test(text))         { clues.push('Korean Hangul script detected');          regions.push('South Korea') }
  if (/[ऀ-ॿ]/.test(text))         { clues.push('Devanagari script detected');             regions.push('India / Nepal') }
  if (/[؀-ۿ]/.test(text))         { clues.push('Arabic script detected');                 regions.push('Middle East / North Africa') }
  if (/[Ѐ-ӿ]/.test(text))         { clues.push('Cyrillic script detected');               regions.push('Russia / Eastern Europe') }
  if (/[฀-๿]/.test(text))         { clues.push('Thai script detected');                   regions.push('Thailand') }
  if (/[Ͱ-Ͽ]/.test(text))         { clues.push('Greek script detected');                  regions.push('Greece / Cyprus') }

  // Phone country codes
  const phoneCodes: Record<string, string> = {
    '1':'US / Canada','44':'United Kingdom','33':'France','49':'Germany','39':'Italy',
    '34':'Spain','7':'Russia','86':'China','91':'India','81':'Japan','82':'South Korea',
    '55':'Brazil','52':'Mexico','61':'Australia','64':'New Zealand','27':'South Africa',
    '20':'Egypt','90':'Turkey','971':'UAE','966':'Saudi Arabia','92':'Pakistan',
    '880':'Bangladesh','63':'Philippines','66':'Thailand','84':'Vietnam','62':'Indonesia',
    '60':'Malaysia','65':'Singapore','31':'Netherlands','32':'Belgium','46':'Sweden',
    '47':'Norway','45':'Denmark','358':'Finland','48':'Poland','380':'Ukraine',
  }
  const phoneMatches = [...text.matchAll(/\+(\d{1,3})[\s\-.(]/g)]
  for (const m of phoneMatches) {
    const country = phoneCodes[m[1]]
    if (country && !regions.includes(country)) {
      clues.push(`Phone code +${m[1]} → ${country}`)
      regions.push(country)
    }
  }

  // Postal code patterns
  if (/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(text))   { clues.push('UK postcode pattern');         if (!regions.includes('United Kingdom')) regions.push('United Kingdom') }
  if (/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i.test(text))            { clues.push('Canadian postal code pattern'); if (!regions.includes('Canada')) regions.push('Canada') }
  if (/\b\d{5}-\d{3}\b/.test(text))                           { clues.push('Brazilian CEP pattern');        if (!regions.includes('Brazil')) regions.push('Brazil') }
  if (/\b[1-9]\d{3}\s?[A-Z]{2}\b/.test(text))                 { clues.push('Dutch postcode pattern');       if (!regions.includes('Netherlands')) regions.push('Netherlands') }

  // Currency symbols
  const currencyMap: [RegExp, string, string][] = [
    [/£/, 'UK', '£ (British pound)'],
    [/€/, 'Eurozone', '€ (Euro)'],
    [/¥|￥/, 'Japan / China', '¥ (Yen/Yuan)'],
    [/₹/, 'India', '₹ (Indian Rupee)'],
    [/₽/, 'Russia', '₽ (Russian Ruble)'],
    [/₩/, 'South Korea', '₩ (Korean Won)'],
    [/฿/, 'Thailand', '฿ (Thai Baht)'],
    [/₫/, 'Vietnam', '₫ (Vietnamese Dong)'],
    [/₺/, 'Turkey', '₺ (Turkish Lira)'],
    [/R\$/, 'Brazil', 'R$ (Brazilian Real)'],
    [/CHF/, 'Switzerland', 'CHF (Swiss Franc)'],
  ]
  for (const [re, region, label] of currencyMap) {
    if (re.test(text) && !regions.includes(region)) {
      clues.push(`Currency: ${label}`)
      regions.push(region)
    }
  }

  // Regional brand names
  const brands: [RegExp, string, string][] = [
    [/\bLIDL\b/i, 'Europe', 'LIDL'], [/\bALDI\b/i, 'Europe', 'ALDI'],
    [/\bREWE\b/i, 'Germany', 'REWE'], [/\bEDEKA\b/i, 'Germany', 'EDEKA'],
    [/\bTESCO\b/i, 'UK / Ireland', 'Tesco'], [/\bSAINSBURY/i, 'UK', "Sainsbury's"],
    [/\bCARREFOUR\b/i, 'France / Europe', 'Carrefour'],
    [/\bWALMART\b/i, 'US', 'Walmart'], [/\bTARGET\b/i, 'US', 'Target'],
    [/\bWOOLWORTHS\b/i, 'Australia / South Africa', 'Woolworths'],
    [/\bCOLES\b/i, 'Australia', 'Coles'],
    [/\bTIM\s+HORTON/i, 'Canada', "Tim Horton's"],
    [/\bLAWSON\b/i, 'Japan', 'Lawson'], [/\bFAMILYMART\b/i, 'Japan / Taiwan', 'FamilyMart'],
    [/\bLOTTE\b/i, 'South Korea / Japan', 'Lotte'],
  ]
  for (const [re, region, name] of brands) {
    if (re.test(text) && !regions.includes(region)) {
      clues.push(`Brand: ${name} → ${region}`)
      regions.push(region)
    }
  }

  const confidence = clues.length === 0 ? 0 : Math.min(20 + clues.length * 12, 70)
  return { clues, regions: [...new Set(regions)], confidence }
}

// ── Async signal runners ──────────────────────────────────────────────────────

async function runTesseract(file: File): Promise<Partial<SignalResult>> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(file)
    const text = data.text.trim()
    if (!text || text.length < 5) {
      return {
        status: 'not-found', confidence: 0, finding: null,
        detail: 'No readable text found in image.',
      }
    }
    const parsed = parseOcrFindings(text)
    if (parsed.clues.length === 0) {
      return {
        status: 'partial', confidence: 0,
        finding: `${text.length} chars extracted — no location patterns`,
        detail: 'Text found but no location clues detected (phone codes, postal codes, scripts, brands, currency).',
      }
    }
    return {
      status: 'found', confidence: parsed.confidence,
      finding: parsed.clues[0],
      detail: parsed.clues.join(' · '),
      location: { regions: parsed.regions },
    }
  } finally {
    await worker.terminate()
  }
}

async function runGeoSpy(file: File, apiKey: string): Promise<Partial<SignalResult>> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const res = await fetch('https://dev.geospy.ai/predict_v1', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 }),
  })

  if (res.status === 401) return { status: 'not-found', finding: null, detail: 'GeoSpy API key invalid or expired.' }
  if (res.status === 429) return { status: 'not-found', finding: null, detail: 'GeoSpy rate limit reached.' }
  if (!res.ok) return { status: 'not-found', finding: null, detail: `GeoSpy returned HTTP ${res.status}.` }

  const data = await res.json()
  const preds = data.geo_predictions
  if (!preds?.length) {
    return { status: 'not-found', finding: null, detail: 'GeoSpy could not identify a location for this image.' }
  }

  const top = preds[0]
  const [lat, lng] = top.coordinates
  const confidence = Math.round((top.similarity_score_1km ?? top.score ?? 0.5) * 100)
  return {
    status: 'found', confidence,
    finding: `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`,
    detail: `Visual scene match. ${preds.length} candidate location${preds.length !== 1 ? 's' : ''} evaluated. Confidence: ${confidence}%`,
    location: { lat, lng },
  }
}

// ── Combined estimate ─────────────────────────────────────────────────────────

function buildEstimate(signals: SignalResult[]) {
  const get = (id: string) => signals.find(s => s.id === id)
  const gps = get('gps'), geospy = get('geospy'), tz = get('timezone'), device = get('device'), ocr = get('ocr')

  if (gps?.status === 'found' && gps.location?.lat != null) {
    return { confidence: 98, summary: 'Exact location via GPS EXIF',
      detail: `Coordinates: ${gps.location.lat.toFixed(6)}°, ${gps.location.lng!.toFixed(6)}°`,
      lat: gps.location.lat, lng: gps.location.lng, regions: undefined as string[] | undefined }
  }
  if (geospy?.status === 'found' && geospy.location?.lat != null) {
    return { confidence: geospy.confidence, summary: 'GeoSpy AI visual geolocation',
      detail: geospy.detail ?? '', lat: geospy.location.lat, lng: geospy.location.lng, regions: undefined as string[] | undefined }
  }
  // Combine timezone + OCR region hints
  if (tz?.status === 'found' && tz.location?.regions) {
    let conf = tz.confidence
    if ((device?.confidence ?? 0) > 10) conf = Math.min(conf + 10, 70)
    if (ocr?.status === 'found' && (ocr.confidence ?? 0) > 0) conf = Math.min(conf + 15, 80)

    const tzRegions = tz.location.regions.slice(0, 5)
    const ocrRegions = ocr?.location?.regions ?? []
    // Intersect if OCR has results, else just use timezone
    const regions = ocrRegions.length > 0
      ? [...new Set([...tzRegions.filter(r => ocrRegions.some(or => or.includes(r.split('/')[0].trim()) || r.includes(or.split('/')[0].trim()))), ...tzRegions])]
      : tzRegions
    const lngBand = tz.location.lngBand!
    return {
      confidence: conf,
      summary: ocrRegions.length > 0 ? 'Timezone + OCR text signals' : 'Longitude band from timezone',
      detail: `Longitude: ${lngBand[0].toFixed(0)}° to ${lngBand[1].toFixed(0)}°. Latitude unknown without GPS or AI signals.`,
      lat: undefined, lng: undefined, regions: regions.slice(0, 5),
    }
  }
  if ((device?.confidence ?? 0) > 10) {
    return { confidence: device!.confidence, summary: 'Manufacturer market hint only',
      detail: device!.detail ?? '', lat: undefined, lng: undefined, regions: [] as string[] }
  }
  return null
}

// ── UI components ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<SignalStatus, { label: string; color: string; dot: string; bar: string; border: string; bg: string }> = {
  running:     { label: 'Running…',    color: 'text-orange-400',  dot: 'bg-orange-400',  bar: 'bg-orange-500',  border: 'border-orange-500/15', bg: 'bg-orange-500/5' },
  found:       { label: 'Found',       color: 'text-emerald-400', dot: 'bg-emerald-400', bar: 'bg-emerald-500', border: 'border-emerald-500/15', bg: 'bg-emerald-500/5' },
  partial:     { label: 'Partial',     color: 'text-amber-400',   dot: 'bg-amber-400',   bar: 'bg-amber-500',   border: 'border-amber-500/15',  bg: 'bg-amber-500/5' },
  'not-found': { label: 'Not Found',   color: 'text-slate-500',   dot: 'bg-slate-600',   bar: 'bg-slate-600',   border: 'border-wire-1',        bg: 'bg-surface-0' },
  unavailable: { label: 'Unavailable', color: 'text-slate-600',   dot: 'bg-slate-700',   bar: 'bg-slate-700',   border: 'border-wire-1',        bg: 'bg-surface-0' },
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} className="text-slate-600 hover:text-slate-400" />}
    </button>
  )
}

function ExifRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="group flex items-center gap-2 py-1.5 border-b border-wire-1 last:border-0">
      <span className="text-[11px] text-slate-500 w-32 flex-shrink-0">{label}</span>
      <span className={clsx('text-[12px] text-slate-300 flex-1 min-w-0 truncate', mono && 'font-mono')}>{value}</span>
      <CopyBtn value={value} />
    </div>
  )
}

function SignalCard({ signal, index }: { signal: SignalResult; index: number }) {
  const cfg = STATUS_CFG[signal.status]
  const Icon = signal.icon
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.22 }}
      className={clsx('rounded-lg border p-3 flex gap-3', cfg.bg, cfg.border)}
    >
      <div className={clsx('mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot,
        signal.status === 'running' && 'animate-pulse')} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Icon size={12} className={clsx(cfg.color, signal.status === 'running' && 'animate-pulse')} />
            <span className="text-[12px] font-semibold text-slate-200">{signal.name}</span>
          </div>
          <span className={clsx('text-[10px] font-semibold uppercase tracking-wider', cfg.color)}>{cfg.label}</span>
          {signal.confidence > 0 && (
            <span className="text-[10px] text-slate-600">{signal.confidence}% conf.</span>
          )}
        </div>
        <p className="text-[11px] text-slate-600">{signal.description}</p>
        {signal.finding && (
          <p className="text-[11px] font-mono text-orange-300 bg-orange-500/8 rounded px-1.5 py-0.5 inline-block break-all">{signal.finding}</p>
        )}
        {signal.detail && (
          <p className="text-[11px] text-slate-500 leading-relaxed">{signal.detail}</p>
        )}
        {signal.confidence > 0 && signal.status !== 'unavailable' && signal.status !== 'running' && (
          <div className="h-0.5 bg-wire-2 rounded-full overflow-hidden mt-1.5">
            <motion.div initial={{ width: 0 }} animate={{ width: `${signal.confidence}%` }}
              transition={{ delay: index * 0.1 + 0.2, duration: 0.4 }}
              className={clsx('h-full rounded-full', cfg.bar)} />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function CombinedEstimate({ signals }: { signals: SignalResult[] }) {
  const est = buildEstimate(signals)
  const anyRunning = signals.some(s => s.status === 'running')

  if (!est) {
    return (
      <div className="card-surface p-4 flex items-start gap-2.5">
        <AlertCircle size={14} className="text-slate-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[12px] font-semibold text-slate-400">
            {anyRunning ? 'Analysis in progress…' : 'Insufficient Signal Data'}
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {anyRunning ? 'Waiting for OCR and GeoSpy results.' : 'No usable signals. Enable GPS or upload an image with intact EXIF.'}
          </p>
        </div>
      </div>
    )
  }

  const mapsUrl = est.lat != null && est.lng != null
    ? `https://www.openstreetmap.org/?mlat=${est.lat}&mlon=${est.lng}#map=15/${est.lat}/${est.lng}`
    : null
  const barColor = est.confidence >= 80 ? 'bg-emerald-500' : est.confidence >= 40 ? 'bg-amber-500' : 'bg-slate-600'
  const confColor = est.confidence >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : est.confidence >= 40 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-slate-500 bg-wire-1 border-wire-2'

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
        <Compass size={13} className="text-orange-400" />
        <span className="text-[12px] font-semibold text-slate-300">Combined Estimate</span>
        {anyRunning && <div className="ml-1 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
        <span className={clsx('ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded border', confColor)}>
          {est.confidence}% confidence
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="h-1.5 bg-wire-2 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${est.confidence}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={clsx('h-full rounded-full', barColor)} />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-slate-200">{est.summary}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{est.detail}</p>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] text-orange-400 hover:text-orange-300 transition-colors">
            <ExternalLink size={11} /> Open in OpenStreetMap
          </a>
        )}
        {est.regions && est.regions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {est.regions.map(r => (
              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">{r}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ImageLocationFinder() {
  const { settings } = useSettingsContext()
  const geoSpyKey = settings.apiKeys['GeoSpy'] ?? ''

  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [signals, setSignals] = useState<SignalResult[]>([])
  const [rawExif, setRawExif] = useState<RawExif | null>(null)
  const [exifLoading, setExifLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const analysisId = useRef(0)

  function patchSignal(id: string, patch: Partial<SignalResult>, aid: number) {
    if (aid !== analysisId.current) return
    setSignals(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  async function processFile(f: File) {
    const aid = ++analysisId.current
    setFile(f)
    setSignals([])
    setRawExif(null)
    setExifLoading(true)
    setProgress(0)

    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)

    let p = 0
    const iv = setInterval(() => {
      p += Math.random() * 18 + 8
      setProgress(Math.min(p, 92))
      if (p >= 92) clearInterval(iv)
    }, 100)

    let raw: RawExif = {}
    try {
      raw = (await exifr.parse(f, { gps: true, tiff: true, exif: true, xmp: false, icc: false, iptc: false })) ?? {}
    } catch { /* no EXIF */ }

    clearInterval(iv)
    setProgress(100)
    if (aid !== analysisId.current) return
    setRawExif(raw)

    // Build synchronous EXIF signals immediately
    const exifSignals = buildExifSignals(raw)

    // OCR signal — starts running
    const ocrSignal: SignalResult = {
      id: 'ocr', icon: Search, name: 'Text & Sign Analysis',
      description: 'Language, street signs, phone numbers, postal codes, brands',
      status: 'running', confidence: 0, finding: null,
      detail: 'Running Tesseract OCR…',
    }

    // GeoSpy signal
    const geospySignal: SignalResult = geoSpyKey ? {
      id: 'geospy', icon: Globe, name: 'GeoSpy AI Geolocation',
      description: 'Visual scene fingerprinting via GeoSpy API',
      status: 'running', confidence: 0, finding: null,
      detail: 'Querying GeoSpy…',
    } : {
      id: 'geospy', icon: Globe, name: 'GeoSpy AI Geolocation',
      description: 'Visual scene fingerprinting via GeoSpy API',
      status: 'unavailable', confidence: 0, finding: null,
      detail: 'Add your GeoSpy API key in Settings → API Keys to enable visual geolocation.',
    }

    setSignals([...exifSignals, ocrSignal, geospySignal])
    setExifLoading(false)

    // Run OCR async
    runTesseract(f)
      .then(patch => patchSignal('ocr', patch, aid))
      .catch(() => patchSignal('ocr', { status: 'not-found', finding: null, detail: 'OCR failed — image may be too small or low contrast.' }, aid))

    // Run GeoSpy async if key present
    if (geoSpyKey) {
      runGeoSpy(f, geoSpyKey)
        .then(patch => patchSignal('geospy', patch, aid))
        .catch(() => patchSignal('geospy', { status: 'not-found', finding: null, detail: 'GeoSpy request failed — check network or API key.' }, aid))
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('image/')) processFile(f)
  }, [geoSpyKey])

  function clear() {
    analysisId.current++
    setFile(null); setPreview(null); setSignals([]); setRawExif(null)
    setExifLoading(false); setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  const hasGps = signals.find(s => s.id === 'gps')?.status === 'found'
  const anyRunning = signals.some(s => s.status === 'running')

  return (
    <div className="min-h-full p-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex-shrink-0">
          <MapPin size={22} className="text-orange-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Image Location Finder</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
              OSINT · Geolocation
            </span>
            {geoSpyKey && (
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                GeoSpy Active
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Layered signal analysis — GPS, timezone, device origin, sun position, OCR text, and GeoSpy AI visual geolocation.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: upload + estimate + privacy */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="lg:col-span-1 space-y-4">
          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'card-surface border-2 border-dashed rounded-lg py-14 flex flex-col items-center gap-3 cursor-pointer transition-all',
                dragging ? 'border-orange-500/60 bg-orange-500/8' : 'border-wire-2 hover:border-orange-500/30 hover:bg-orange-500/4',
              )}
            >
              <div className={clsx('p-4 rounded-full transition-colors', dragging ? 'bg-orange-500/20' : 'bg-wire-2')}>
                <Upload size={22} className={dragging ? 'text-orange-400' : 'text-slate-500'} />
              </div>
              <div className="text-center px-4">
                <p className="text-[13px] font-medium text-slate-300">Drop image here</p>
                <p className="text-[12px] text-slate-600 mt-0.5">or click to browse</p>
                <p className="text-[11px] text-slate-700 mt-1.5">JPEG · PNG · HEIC · TIFF · WebP</p>
              </div>
              <input ref={inputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
            </div>
          ) : (
            <div className="card-surface overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-wire-1">
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon size={13} className="text-orange-400 flex-shrink-0" />
                  <span className="text-[12px] text-slate-300 truncate font-mono">{file.name}</span>
                </div>
                <button onClick={clear} className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 ml-2">
                  <X size={14} />
                </button>
              </div>
              {preview && (
                <div className="relative">
                  <img src={preview} alt="preview" className="w-full object-cover max-h-52" />
                  {exifLoading && (
                    <div className="absolute inset-0 bg-surface-0/85 flex flex-col items-center justify-center gap-3">
                      <div className="w-40 space-y-1.5">
                        <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
                          <motion.div className="h-full bg-orange-400 rounded-full"
                            animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.15 }} />
                        </div>
                        <p className="text-[11px] text-orange-400 text-center">Parsing EXIF…</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="px-4 py-2 flex gap-4 text-[11px] text-slate-600">
                <span>{(file.size / 1024).toFixed(1)} KB</span>
                <span>{file.type || 'image'}</span>
              </div>
            </div>
          )}

          <AnimatePresence>
            {signals.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <CombinedEstimate signals={signals} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {rawExif && signals.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="card-surface overflow-hidden">
                <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
                  <Shield size={13} className="text-orange-400" />
                  <span className="text-[12px] font-semibold text-slate-300">Privacy Exposure</span>
                </div>
                <div className="p-3 flex flex-wrap gap-1.5">
                  {hasGps && <span className="text-[11px] px-2 py-0.5 rounded-full border text-rose-400 bg-rose-500/10 border-rose-500/20">GPS coordinates embedded</span>}
                  {hasGps && <span className="text-[11px] px-2 py-0.5 rounded-full border text-rose-400 bg-rose-500/10 border-rose-500/20">Precise altitude recorded</span>}
                  {rawExif.Make && <span className="text-[11px] px-2 py-0.5 rounded-full border text-amber-400 bg-amber-500/10 border-amber-500/20">Device make & model exposed</span>}
                  {rawExif.DateTimeOriginal && <span className="text-[11px] px-2 py-0.5 rounded-full border text-slate-400 bg-wire-1 border-wire-2">Capture timestamp</span>}
                  {rawExif.Software && <span className="text-[11px] px-2 py-0.5 rounded-full border text-slate-400 bg-wire-1 border-wire-2">Software fingerprint</span>}
                  {!hasGps && !rawExif.Make && !rawExif.DateTimeOriginal && (
                    <span className="text-[11px] text-slate-600">No significant metadata detected</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right: signal board + EXIF tables */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="lg:col-span-2 space-y-4">
          {!file && (
            <div className="card-surface py-24 flex flex-col items-center gap-3 text-center">
              <MapPin size={32} className="text-slate-700" />
              <p className="text-sm text-slate-600">Upload an image to run multi-signal location analysis.</p>
              <p className="text-[12px] text-slate-700">GPS · Timezone · Device Origin · Sun · OCR · GeoSpy AI</p>
            </div>
          )}

          {(exifLoading || signals.length > 0) && (
            <div className="card-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
                <MapPin size={13} className="text-orange-400" />
                <span className="text-[12px] font-semibold text-slate-300">Signal Analysis</span>
                {anyRunning && (
                  <div className="ml-auto flex items-center gap-1.5 text-[11px] text-orange-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    Running…
                  </div>
                )}
                {!anyRunning && signals.length > 0 && (
                  <span className="ml-auto text-[11px] text-slate-600">
                    {signals.filter(s => s.status === 'found').length} signal{signals.filter(s => s.status === 'found').length !== 1 ? 's' : ''} found
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2">
                {exifLoading && signals.length === 0 && (
                  <div className="py-6 flex items-center justify-center gap-2 text-[12px] text-slate-500">
                    <div className="w-4 h-4 rounded-full border border-orange-400/30 border-t-orange-400 animate-spin" />
                    Parsing EXIF data…
                  </div>
                )}
                {signals.map((signal, i) => (
                  <SignalCard key={signal.id} signal={signal} index={i} />
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {rawExif && signals.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="space-y-4">
                {(rawExif.Make || rawExif.Model || rawExif.DateTimeOriginal) && (
                  <div className="card-surface overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
                      <Camera size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">Device & Camera</span>
                    </div>
                    <div className="px-4 py-2">
                      {rawExif.Make && <ExifRow label="Make" value={rawExif.Make} />}
                      {rawExif.Model && <ExifRow label="Model" value={rawExif.Model} />}
                      {rawExif.Software && <ExifRow label="Software" value={rawExif.Software} />}
                      {rawExif.DateTimeOriginal && <ExifRow label="Date / Time" value={rawExif.DateTimeOriginal.toLocaleString()} mono />}
                      {rawExif.OffsetTimeOriginal && <ExifRow label="UTC Offset" value={rawExif.OffsetTimeOriginal} mono />}
                    </div>
                  </div>
                )}
                {(rawExif.ExposureTime || rawExif.FNumber || rawExif.ISO) && (
                  <div className="card-surface overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
                      <Info size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">Capture Settings</span>
                    </div>
                    <div className="px-4 py-2">
                      {rawExif.ImageWidth && rawExif.ImageHeight && (
                        <ExifRow label="Resolution" value={`${rawExif.ImageWidth.toLocaleString()} × ${rawExif.ImageHeight.toLocaleString()} px`} mono />
                      )}
                      {rawExif.ExposureTime && <ExifRow label="Exposure" value={rawExif.ExposureTime < 1 ? `1/${Math.round(1 / rawExif.ExposureTime)}s` : `${rawExif.ExposureTime}s`} mono />}
                      {rawExif.FNumber && <ExifRow label="Aperture" value={`f/${rawExif.FNumber}`} mono />}
                      {rawExif.ISO && <ExifRow label="ISO" value={`ISO ${rawExif.ISO}`} mono />}
                      {rawExif.FocalLength && <ExifRow label="Focal Length" value={`${rawExif.FocalLength}mm`} />}
                    </div>
                  </div>
                )}
                {hasGps && (
                  <div className="card-surface overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
                      <Navigation size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">Raw GPS EXIF Tags</span>
                    </div>
                    <div className="px-4 py-2">
                      <ExifRow label="GPSLatitude" value={`${Math.abs(rawExif.latitude!).toFixed(8)} ${rawExif.latitude! >= 0 ? 'N' : 'S'}`} mono />
                      <ExifRow label="GPSLongitude" value={`${Math.abs(rawExif.longitude!).toFixed(8)} ${rawExif.longitude! >= 0 ? 'E' : 'W'}`} mono />
                      {rawExif.GPSAltitude != null && <ExifRow label="GPSAltitude" value={`${rawExif.GPSAltitude.toFixed(1)} m`} mono />}
                      <ExifRow label="GPSMapDatum" value="WGS-84" mono />
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import exifr from 'exifr'
import {
  MapPin, Upload, X, Camera, Navigation,
  ExternalLink, Copy, Check, AlertCircle, Image as ImageIcon,
  Shield, Sun, Clock, Cpu, Eye, Search, Compass, Info, Globe,
  Tag, Target, Fingerprint, Crosshair, ChevronRight,
} from 'lucide-react'
import { useSettingsContext } from '../../context/SettingsContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawExif {
  // GPS core
  latitude?: number
  longitude?: number
  GPSAltitude?: number
  // GPS direction / movement
  GPSImgDirection?: number
  GPSImgDirectionRef?: string
  GPSSpeed?: number
  GPSSpeedRef?: string
  GPSTrack?: number
  // GPS fix quality
  GPSSatellites?: string
  GPSHPositioningError?: number
  GPSDOP?: number
  // Timestamp
  DateTimeOriginal?: Date
  OffsetTimeOriginal?: string
  // Device
  Make?: string
  Model?: string
  Software?: string
  LensModel?: string
  LensInfo?: number[]
  // Capture settings
  ExposureTime?: number
  FNumber?: number
  ISO?: number
  FocalLength?: number
  ImageWidth?: number
  ImageHeight?: number
  Flash?: number
  WhiteBalance?: number
  LightSource?: number
  SceneCaptureType?: number
  // IPTC location (populated when iptc:true)
  City?: string
  'Province-State'?: string
  'Country-PrimaryLocationName'?: string
  'Country-PrimaryLocationCode'?: string
  'Sub-location'?: string
  Keywords?: string | string[]
  // XMP
  CreatorTool?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
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

// ── EXIF helpers ──────────────────────────────────────────────────────────────

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

// ── Perceptual hash (average hash — 8×8 grayscale) ───────────────────────────

async function computeImageHash(objectUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 8; canvas.height = 8
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve('0000000000000000'); return }
        ctx.drawImage(img, 0, 0, 8, 8)
        const d = ctx.getImageData(0, 0, 8, 8).data
        const gray = Array.from({ length: 64 }, (_, i) =>
          0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
        )
        const avg = gray.reduce((a, b) => a + b, 0) / 64
        // Build 64-bit hash as two 32-bit chunks to avoid BigInt
        let hi = 0, lo = 0
        gray.forEach((v, i) => {
          if (v > avg) {
            if (i < 32) hi |= (1 << (31 - i))
            else lo |= (1 << (63 - i))
          }
        })
        const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
        resolve((toHex(hi) + toHex(lo)).toUpperCase())
      } catch { resolve('0000000000000000') }
    }
    img.onerror = () => resolve('0000000000000000')
    img.src = objectUrl
  })
}

// ── buildExifSignals ──────────────────────────────────────────────────────────

const LIGHT_SOURCE: Record<number, string> = {
  1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten / Incandescent', 4: 'Flash',
  9: 'Fine weather', 10: 'Cloudy', 11: 'Shade',
}
const SCENE_TYPE: Record<number, string> = {
  0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night scene',
}

function buildExifSignals(raw: RawExif): SignalResult[] {
  const signals: SignalResult[] = []

  // ── GPS coordinates ────────────────────────────────────────────────────────
  if (raw.latitude != null && raw.longitude != null) {
    signals.push({
      id: 'gps', icon: Navigation, name: 'GPS Coordinates',
      description: 'Embedded GPS coordinates in EXIF metadata',
      status: 'found', confidence: 98,
      finding: `${raw.latitude.toFixed(6)}°, ${raw.longitude.toFixed(6)}°`,
      detail: raw.GPSAltitude != null ? `Altitude: ${raw.GPSAltitude.toFixed(1)} m above sea level` : null,
      location: { lat: raw.latitude, lng: raw.longitude },
    })
  } else {
    signals.push({
      id: 'gps', icon: Navigation, name: 'GPS Coordinates',
      description: 'Embedded GPS coordinates in EXIF metadata',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'No GPS block found — location services were off, or metadata was stripped.',
    })
  }

  // ── IPTC / XMP location data ───────────────────────────────────────────────
  const iptcCity = raw.City
  const iptcState = raw['Province-State']
  const iptcCountry = raw['Country-PrimaryLocationName']
  const iptcCode = raw['Country-PrimaryLocationCode']
  const iptcSubloc = raw['Sub-location']
  const iptcParts = [iptcSubloc, iptcCity, iptcState, iptcCountry].filter(Boolean) as string[]

  if (iptcParts.length > 0) {
    signals.push({
      id: 'iptc', icon: Tag, name: 'IPTC Location Metadata',
      description: 'Explicit city / state / country embedded by editing software or camera app',
      status: 'found', confidence: 90,
      finding: iptcParts.join(', '),
      detail: iptcCode
        ? `ISO country code: ${iptcCode}. Written by Lightroom, Photoshop, or a camera app.`
        : 'Written by Lightroom, Photoshop, or a camera app into the IPTC metadata block.',
      location: { regions: [iptcCountry ?? iptcState ?? iptcCity ?? ''].filter(Boolean) as string[] },
    })
  } else {
    signals.push({
      id: 'iptc', icon: Tag, name: 'IPTC Location Metadata',
      description: 'Explicit city / state / country embedded by editing software or camera app',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'No IPTC city/state/country fields found. These are written by Lightroom, Photoshop, Apple Photos, etc.',
    })
  }

  // ── Timezone → longitude band ──────────────────────────────────────────────
  const utcOffset = raw.OffsetTimeOriginal
  const offsetHours = utcOffset ? parseUtcOffset(utcOffset) : null
  if (utcOffset && offsetHours != null) {
    const centerLng = offsetHours * 15
    const regions = TIMEZONE_REGIONS[findTimezoneKey(offsetHours)] ?? ['Unknown region']
    signals.push({
      id: 'timezone', icon: Clock, name: 'UTC Offset / Timezone',
      description: 'Camera clock offset → longitude band inference',
      status: 'found', confidence: 55,
      finding: `${utcOffset} → ~${centerLng >= 0 ? '+' : ''}${centerLng.toFixed(0)}° longitude (±7.5°)`,
      detail: `Candidate regions: ${regions.slice(0, 5).join(', ')}`,
      location: { lngBand: [centerLng - 7.5, centerLng + 7.5], regions },
    })
  } else {
    signals.push({
      id: 'timezone', icon: Clock, name: 'UTC Offset / Timezone',
      description: 'Camera clock offset → longitude band inference',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'No UTC offset tag found (OffsetTimeOriginal missing).',
    })
  }

  // ── Device origin ──────────────────────────────────────────────────────────
  const deviceHint = inferDeviceOrigin(raw.Make, raw.Model)
  if (raw.Make || raw.Model) {
    signals.push({
      id: 'device', icon: Cpu, name: 'Device Origin',
      description: 'Manufacturer primary market distribution hint',
      status: 'partial', confidence: deviceHint?.confidence ?? 5,
      finding: `${raw.Make ?? ''} ${raw.Model ?? ''}`.trim(),
      detail: deviceHint?.hint ?? 'No regional inference for this manufacturer.',
    })
  } else {
    signals.push({
      id: 'device', icon: Cpu, name: 'Device Origin',
      description: 'Manufacturer primary market distribution hint',
      status: 'not-found', confidence: 0, finding: null,
      detail: 'No device information found in EXIF.',
    })
  }

  // ── Solar position ─────────────────────────────────────────────────────────
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
        : `Shadows should point ~${shadowDir.toFixed(0)}° (${toCardinal(shadowDir)}). Computed at est. longitude ${estLng.toFixed(0)}°, 45°N reference.`,
    })
  } else {
    signals.push({
      id: 'sun', icon: Sun, name: 'Sun Position Reference',
      description: 'Solar angle at capture time — compare to shadows in image',
      status: captureDate ? 'partial' : 'not-found', confidence: 0,
      finding: captureDate ? 'Timestamp found but UTC offset missing' : null,
      detail: 'Requires capture timestamp + UTC offset to compute solar angle.',
    })
  }

  // ── Camera bearing (conditional) ───────────────────────────────────────────
  if (raw.GPSImgDirection != null) {
    const ref = raw.GPSImgDirectionRef === 'M' ? 'magnetic north' : 'true north'
    signals.push({
      id: 'gps-bearing', icon: Crosshair, name: 'Camera Bearing',
      description: 'Compass direction the lens was pointed at the moment of capture',
      status: 'found', confidence: 0,
      finding: `${raw.GPSImgDirection.toFixed(1)}° ${toCardinal(raw.GPSImgDirection)} (${ref})`,
      detail: 'With GPS coordinates, this pinpoints which building face or street side was photographed.',
    })
  }

  // ── GPS fix quality (conditional) ─────────────────────────────────────────
  const dop = raw.GPSDOP
  const posErr = raw.GPSHPositioningError
  if (dop != null || posErr != null || raw.GPSSatellites) {
    const dopLabel = dop != null
      ? (dop < 2 ? 'Excellent' : dop < 5 ? 'Good' : dop < 10 ? 'Moderate' : 'Poor')
      : null
    const finding = posErr != null
      ? `±${posErr.toFixed(0)} m horizontal positioning error`
      : dop != null
        ? `DOP ${dop.toFixed(1)} — ${dopLabel} fix`
        : `${raw.GPSSatellites} satellites tracked`
    const detail = [
      raw.GPSSatellites ? `Satellites: ${raw.GPSSatellites}` : null,
      dop != null ? `Dilution of precision: ${dop.toFixed(1)}` : null,
      posErr != null ? `H. error: ±${posErr.toFixed(0)} m` : null,
    ].filter(Boolean).join(' · ')
    signals.push({
      id: 'gps-accuracy', icon: Target, name: 'GPS Fix Quality',
      description: 'Precision metrics embedded alongside the GPS coordinate',
      status: 'partial', confidence: 0,
      finding,
      detail: detail || null,
    })
  }

  // ── Scene environment (conditional) ───────────────────────────────────────
  const flashFired = raw.Flash != null && (raw.Flash & 0x1) === 1
  const lightLabel = raw.LightSource != null ? LIGHT_SOURCE[raw.LightSource] : undefined
  const sceneLabel = raw.SceneCaptureType != null ? SCENE_TYPE[raw.SceneCaptureType] : undefined
  const sceneClues: string[] = []
  if (flashFired) sceneClues.push('Flash fired — indoor or low-light setting')
  if (lightLabel) sceneClues.push(`Light source: ${lightLabel}`)
  if (sceneLabel && sceneLabel !== 'Standard') sceneClues.push(`Scene mode: ${sceneLabel}`)
  if (raw.WhiteBalance === 1) sceneClues.push('Manual white balance — controlled lighting environment')

  if (sceneClues.length > 0) {
    const isLikelyIndoor = flashFired || [2, 3].includes(raw.LightSource ?? -1)
    signals.push({
      id: 'scene', icon: Eye, name: 'Scene Environment',
      description: 'Flash, light source, and scene mode — indoor vs. outdoor inference',
      status: 'partial', confidence: 0,
      finding: isLikelyIndoor ? 'Indoor environment inferred' : 'Outdoor environment inferred',
      detail: sceneClues.join(' · '),
    })
  }

  return signals
}

// ── Enhanced OCR text parsing ─────────────────────────────────────────────────

function parseOcrFindings(text: string): { clues: string[]; regions: string[]; confidence: number } {
  const clues: string[] = []
  const regions: string[] = []
  const addRegion = (r: string) => { if (!regions.includes(r)) regions.push(r) }

  // Script detection
  if (/[一-鿿]/.test(text))         { clues.push('CJK characters detected');               addRegion('China / Japan / Korea') }
  if (/[぀-ゟ゠-ヿ]/.test(text)) { clues.push('Japanese Hiragana/Katakana detected'); addRegion('Japan') }
  if (/[가-힯]/.test(text))         { clues.push('Korean Hangul script detected');          addRegion('South Korea') }
  if (/[ऀ-ॿ]/.test(text))         { clues.push('Devanagari script detected');             addRegion('India / Nepal') }
  if (/[؀-ۿ]/.test(text))         { clues.push('Arabic script detected');                 addRegion('Middle East / North Africa') }
  if (/[Ѐ-ӿ]/.test(text))         { clues.push('Cyrillic script detected');               addRegion('Russia / Eastern Europe') }
  if (/[฀-๿]/.test(text))         { clues.push('Thai script detected');                   addRegion('Thailand') }
  if (/[Ͱ-Ͽ]/.test(text))         { clues.push('Greek script detected');                  addRegion('Greece / Cyprus') }

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
  for (const m of [...text.matchAll(/\+(\d{1,3})[\s\-.(]/g)]) {
    const country = phoneCodes[m[1]]
    if (country) { clues.push(`Phone code +${m[1]} → ${country}`); addRegion(country) }
  }

  // Postal code patterns
  if (/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(text))  { clues.push('UK postcode pattern');           addRegion('United Kingdom') }
  if (/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i.test(text))           { clues.push('Canadian postal code pattern');  addRegion('Canada') }
  if (/\b\d{5}-\d{3}\b/.test(text))                          { clues.push('Brazilian CEP code pattern');    addRegion('Brazil') }
  if (/\b[1-9]\d{3}\s?[A-Z]{2}\b/.test(text))                { clues.push('Dutch postcode pattern');        addRegion('Netherlands') }

  // Currency
  const currencyMap: [RegExp, string, string][] = [
    [/£/, 'United Kingdom', '£ (British pound)'],
    [/€/, 'Eurozone', '€ (Euro)'],
    [/¥|￥/, 'Japan / China', '¥ (Yen / Yuan)'],
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
    if (re.test(text)) { clues.push(`Currency: ${label}`); addRegion(region) }
  }

  // Regional brand names
  const brands: [RegExp, string, string][] = [
    [/\bLIDL\b/i, 'Europe', 'LIDL'], [/\bALDI\b/i, 'Europe', 'ALDI'],
    [/\bREWE\b/i, 'Germany', 'REWE'], [/\bEDEKA\b/i, 'Germany', 'EDEKA'],
    [/\bTESCO\b/i, 'UK / Ireland', 'Tesco'], [/\bSAINSBURY/i, 'United Kingdom', "Sainsbury's"],
    [/\bCARREFOUR\b/i, 'France / Europe', 'Carrefour'],
    [/\bWALMART\b/i, 'US', 'Walmart'], [/\bTARGET\b/i, 'US', 'Target'],
    [/\bWOOLWORTHS\b/i, 'Australia / South Africa', 'Woolworths'],
    [/\bCOLES\b/i, 'Australia', 'Coles'],
    [/\bTIM\s+HORTON/i, 'Canada', "Tim Horton's"],
    [/\bLAWSON\b/i, 'Japan', 'Lawson'], [/\bFAMILYMART\b/i, 'Japan / Taiwan', 'FamilyMart'],
    [/\bLOTTE\b/i, 'South Korea / Japan', 'Lotte'],
    [/\bMERCADONA\b/i, 'Spain', 'Mercadona'],
    [/\bAUCHAN\b/i, 'France / Europe', 'Auchan'],
    [/\bICICI\b/i, 'India', 'ICICI Bank'], [/\bHDFC\b/i, 'India', 'HDFC Bank'],
    [/\bBIG\s+C\b/i, 'Thailand', 'Big C'], [/\bSEVEN\s*ELEVEN\b/i, 'Japan / Taiwan / Thailand', '7-Eleven'],
  ]
  for (const [re, region, name] of brands) {
    if (re.test(text)) { clues.push(`Brand: ${name} → ${region}`); addRegion(region) }
  }

  // License plate patterns
  const plates: [RegExp, string, string][] = [
    [/\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/, 'United Kingdom', 'UK registration plate'],
    [/\b[A-Z]{1,3}-[A-Z]{1,2}\s?\d{1,4}\b/, 'Germany', 'German Kennzeichen'],
    [/\b[A-Z]{2}-\d{3}-[A-Z]{2}\b/, 'France', 'French plate format'],
    [/\b[A-Z]{3}\d[A-Z]\d{2}\b/, 'Brazil', 'Brazilian Mercosul plate'],
    [/\b[A-Z]{2}\d{2}-\d{3}\b/i, 'Ireland', 'Irish registration plate'],
    [/\b\d{4}\s?[BCDFGHJKLMNPRSTUVWXYZ]{3}\b/, 'Spain', 'Spanish plate format'],
  ]
  for (const [re, region, label] of plates) {
    if (re.test(text)) { clues.push(`Possible ${label} visible`); addRegion(region) }
  }

  // URL domain TLDs
  const tldMap: Record<string, string> = {
    '.de': 'Germany', '.fr': 'France', '.co.uk': 'United Kingdom', '.uk': 'United Kingdom',
    '.com.br': 'Brazil', '.jp': 'Japan', '.cn': 'China', '.ru': 'Russia',
    '.it': 'Italy', '.es': 'Spain', '.nl': 'Netherlands', '.au': 'Australia',
    '.nz': 'New Zealand', '.ca': 'Canada', '.mx': 'Mexico', '.in': 'India',
    '.kr': 'South Korea', '.se': 'Sweden', '.no': 'Norway', '.dk': 'Denmark',
    '.fi': 'Finland', '.pl': 'Poland', '.at': 'Austria', '.ch': 'Switzerland',
    '.za': 'South Africa', '.tr': 'Turkey', '.ae': 'UAE',
  }
  for (const m of [...text.matchAll(/[a-z0-9-]+(\.[a-z]{2,6})(?:\/|\s|$)/gi)]) {
    const tld = m[1].toLowerCase()
    const country = tldMap[tld]
    if (country) { clues.push(`Domain TLD ${tld} → ${country}`); addRegion(country) }
  }

  const confidence = clues.length === 0 ? 0 : Math.min(20 + clues.length * 12, 70)
  return { clues, regions: [...new Set(regions)], confidence }
}

// ── Async signal runners ───────────────────────────────────────────────────────

async function runTesseract(file: File): Promise<Partial<SignalResult>> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(file)
    const text = data.text.trim()
    if (!text || text.length < 5) {
      return { status: 'not-found', confidence: 0, finding: null, detail: 'No readable text found in image.' }
    }
    const parsed = parseOcrFindings(text)
    if (parsed.clues.length === 0) {
      return {
        status: 'partial', confidence: 0,
        finding: `${text.length} chars extracted — no location patterns`,
        detail: 'Text found but no location clues detected (scripts, phone codes, postal codes, brands, license plates, currency, domain TLDs).',
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
    detail: `Visual scene match. ${preds.length} candidate${preds.length !== 1 ? 's' : ''} evaluated. Confidence: ${confidence}%`,
    location: { lat, lng },
  }
}

// ── Combined estimate ──────────────────────────────────────────────────────────

function buildEstimate(signals: SignalResult[]) {
  const get = (id: string) => signals.find(s => s.id === id)
  const gps = get('gps'), iptc = get('iptc'), geospy = get('geospy')
  const tz = get('timezone'), device = get('device'), ocr = get('ocr')

  if (gps?.status === 'found' && gps.location?.lat != null) {
    return { confidence: 98, summary: 'Exact location via GPS EXIF',
      detail: `Coordinates: ${gps.location.lat.toFixed(6)}°, ${gps.location.lng!.toFixed(6)}°`,
      lat: gps.location.lat, lng: gps.location.lng, regions: undefined as string[] | undefined }
  }
  if (iptc?.status === 'found') {
    return { confidence: 90, summary: 'IPTC embedded location data',
      detail: iptc.finding ?? 'Location fields found in image metadata.',
      lat: undefined, lng: undefined, regions: iptc.location?.regions }
  }
  if (geospy?.status === 'found' && geospy.location?.lat != null) {
    return { confidence: geospy.confidence, summary: 'GeoSpy AI visual geolocation',
      detail: geospy.detail ?? '', lat: geospy.location.lat, lng: geospy.location.lng,
      regions: undefined as string[] | undefined }
  }
  if (tz?.status === 'found' && tz.location?.regions) {
    let conf = tz.confidence
    if ((device?.confidence ?? 0) > 10) conf = Math.min(conf + 10, 70)
    if (ocr?.status === 'found' && (ocr.confidence ?? 0) > 0) conf = Math.min(conf + 15, 80)
    const tzRegions = tz.location.regions.slice(0, 5)
    const ocrRegions = ocr?.location?.regions ?? []
    const regions = ocrRegions.length > 0
      ? [...new Set([...tzRegions.filter(r => ocrRegions.some(or =>
          or.includes(r.split('/')[0].trim()) || r.includes(or.split('/')[0].trim()))), ...tzRegions])]
      : tzRegions
    const lngBand = tz.location.lngBand!
    return { confidence: conf,
      summary: ocrRegions.length > 0 ? 'Timezone + OCR text signals' : 'Longitude band from timezone',
      detail: `Longitude: ${lngBand[0].toFixed(0)}° to ${lngBand[1].toFixed(0)}°. Latitude unknown without GPS or AI signals.`,
      lat: undefined, lng: undefined, regions: regions.slice(0, 5) }
  }
  if ((device?.confidence ?? 0) > 10) {
    return { confidence: device!.confidence, summary: 'Manufacturer market hint only',
      detail: device!.detail ?? '', lat: undefined, lng: undefined, regions: [] as string[] }
  }
  return null
}

// ── UI config ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<SignalStatus, {
  label: string; color: string; dot: string; bar: string
  border: string; bg: string; leftBorder: string; iconBg: string
}> = {
  running:     { label: 'Scanning',    color: 'text-orange-400',  dot: 'bg-orange-400',  bar: 'bg-orange-500',
                 border: 'border-orange-500/15', bg: 'bg-orange-500/5',
                 leftBorder: 'border-l-orange-500/70', iconBg: 'bg-orange-500/15' },
  found:       { label: 'Signal Found', color: 'text-emerald-400', dot: 'bg-emerald-400', bar: 'bg-emerald-500',
                 border: 'border-emerald-500/15', bg: 'bg-emerald-500/5',
                 leftBorder: 'border-l-emerald-500/70', iconBg: 'bg-emerald-500/15' },
  partial:     { label: 'Partial',     color: 'text-amber-400',   dot: 'bg-amber-400',   bar: 'bg-amber-500',
                 border: 'border-amber-500/15', bg: 'bg-amber-500/5',
                 leftBorder: 'border-l-amber-500/70', iconBg: 'bg-amber-500/15' },
  'not-found': { label: 'No Signal',   color: 'text-slate-500',   dot: 'bg-slate-600',   bar: 'bg-slate-600',
                 border: 'border-wire-1', bg: 'bg-surface-0',
                 leftBorder: 'border-l-slate-700/50', iconBg: 'bg-wire-2' },
  unavailable: { label: 'Unavailable', color: 'text-slate-600',   dot: 'bg-slate-700',   bar: 'bg-slate-700',
                 border: 'border-wire-1', bg: 'bg-surface-0',
                 leftBorder: 'border-l-slate-800', iconBg: 'bg-wire-1' },
}

// ── Shared small components ────────────────────────────────────────────────────

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

// ── Confidence gauge (SVG circle) ─────────────────────────────────────────────

function ConfidenceGauge({ value }: { value: number }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, value / 100)) * circ
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : value >= 20 ? '#f97316' : '#475569'
  const trackColor = value >= 80 ? 'rgba(34,197,94,0.1)' : value >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(30,41,59,0.8)'
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="flex-shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" strokeWidth="5" stroke={trackColor} />
      <motion.circle
        cx="34" cy="34" r={r} fill="none" strokeWidth="5"
        stroke={color}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 34 34)"
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${circ - dash}` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <text x="34" y="38" textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{value}%</text>
    </svg>
  )
}

// ── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({ signal, index }: { signal: SignalResult; index: number }) {
  const cfg = STATUS_CFG[signal.status]
  const Icon = signal.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.2 }}
      className={clsx(
        'rounded-lg border border-l-[3px] transition-colors',
        cfg.bg, cfg.border, cfg.leftBorder,
      )}
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <div className={clsx('p-1.5 rounded-md flex-shrink-0 mt-0.5', cfg.iconBg)}>
          <Icon size={12} className={clsx(cfg.color, signal.status === 'running' && 'animate-pulse')} />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-slate-200 leading-tight">{signal.name}</span>
            <span className={clsx(
              'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border',
              signal.status === 'found'       ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
              signal.status === 'running'     ? 'text-orange-400 bg-orange-500/10 border-orange-500/25' :
              signal.status === 'partial'     ? 'text-amber-400 bg-amber-500/10 border-amber-500/25' :
              signal.status === 'unavailable' ? 'text-slate-600 bg-wire-1 border-wire-2' :
                                               'text-slate-500 bg-wire-1 border-wire-2',
              signal.status === 'running' && 'animate-pulse'
            )}>{cfg.label}</span>
            {signal.confidence > 0 && (
              <span className="text-[10px] text-slate-600 ml-auto tabular-nums">{signal.confidence}% conf</span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">{signal.description}</p>
          {signal.finding && (
            <p className="text-[11px] font-mono text-orange-300 bg-orange-500/8 border border-orange-500/15 rounded px-2 py-1 break-all leading-relaxed">
              {signal.finding}
            </p>
          )}
          {signal.detail && (
            <p className="text-[11px] text-slate-500 leading-relaxed">{signal.detail}</p>
          )}
          {signal.confidence > 0 && signal.status !== 'unavailable' && signal.status !== 'running' && (
            <div className="h-[2px] bg-wire-2 rounded-full overflow-hidden mt-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${signal.confidence}%` }}
                transition={{ delay: index * 0.07 + 0.3, duration: 0.5 }}
                className={clsx('h-full rounded-full', cfg.bar)}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Combined estimate card ────────────────────────────────────────────────────

function CombinedEstimate({ signals }: { signals: SignalResult[] }) {
  const est = buildEstimate(signals)
  const anyRunning = signals.some(s => s.status === 'running')

  if (!est) {
    return (
      <div className="card-surface p-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-wire-2 flex-shrink-0">
          <AlertCircle size={14} className="text-slate-600" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-slate-400">
            {anyRunning ? 'Analysis in progress…' : 'Insufficient Signal Data'}
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
            {anyRunning
              ? 'Waiting for OCR and AI signals to complete.'
              : 'No usable signals found. Enable GPS on device or upload an image with intact EXIF metadata.'}
          </p>
        </div>
      </div>
    )
  }

  const mapsUrl = est.lat != null && est.lng != null
    ? `https://www.openstreetmap.org/?mlat=${est.lat}&mlon=${est.lng}#map=15/${est.lat}/${est.lng}`
    : null
  const confTextColor = est.confidence >= 80 ? 'text-emerald-400'
    : est.confidence >= 50 ? 'text-amber-400'
    : est.confidence >= 20 ? 'text-orange-400'
    : 'text-slate-500'

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
        <Compass size={13} className="text-orange-400" />
        <span className="text-[12px] font-semibold text-slate-300">Combined Estimate</span>
        {anyRunning && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-orange-400">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Updating…
          </span>
        )}
      </div>
      <div className="p-4 flex items-start gap-4">
        <ConfidenceGauge value={est.confidence} />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className={clsx('text-[13px] font-semibold leading-tight', confTextColor)}>{est.summary}</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{est.detail}</p>
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-orange-400 hover:text-orange-300 transition-colors">
              <ExternalLink size={10} /> Open in OpenStreetMap
            </a>
          )}
          {est.regions && est.regions.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {est.regions.map(r => (
                <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

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
  const [scanHash, setScanHash] = useState<string>('')
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
    setScanHash('')
    setExifLoading(true)
    setProgress(0)

    const objUrl = URL.createObjectURL(f)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)

    let p = 0
    const iv = setInterval(() => {
      p += Math.random() * 18 + 8
      setProgress(Math.min(p, 92))
      if (p >= 92) clearInterval(iv)
    }, 100)

    // Compute pHash in parallel with EXIF parsing
    const hashPromise = computeImageHash(objUrl)

    let raw: RawExif = {}
    try {
      raw = (await exifr.parse(f, {
        gps: true, tiff: true, exif: true,
        xmp: true, iptc: true, icc: false,
      })) ?? {}
    } catch { /* no EXIF */ }

    URL.revokeObjectURL(objUrl)
    clearInterval(iv)
    setProgress(100)
    if (aid !== analysisId.current) return
    setRawExif(raw)

    const hash = await hashPromise
    if (aid === analysisId.current) setScanHash(hash)

    const exifSignals = buildExifSignals(raw)

    const ocrSignal: SignalResult = {
      id: 'ocr', icon: Search, name: 'Text & Sign Analysis',
      description: 'Scripts, phone codes, postal codes, license plates, brands, domain TLDs',
      status: 'running', confidence: 0, finding: null,
      detail: 'Running Tesseract OCR…',
    }

    const geospySignal: SignalResult = geoSpyKey ? {
      id: 'geospy', icon: Globe, name: 'GeoSpy AI Geolocation',
      description: 'Visual scene fingerprinting via GeoSpy API',
      status: 'running', confidence: 0, finding: null,
      detail: 'Querying GeoSpy visual model…',
    } : {
      id: 'geospy', icon: Globe, name: 'GeoSpy AI Geolocation',
      description: 'Visual scene fingerprinting via GeoSpy API',
      status: 'unavailable', confidence: 0, finding: null,
      detail: 'Add your GeoSpy API key in Settings → API Keys to enable visual geolocation.',
    }

    setSignals([...exifSignals, ocrSignal, geospySignal])
    setExifLoading(false)

    runTesseract(f)
      .then(patch => patchSignal('ocr', patch, aid))
      .catch(() => patchSignal('ocr', { status: 'not-found', finding: null, detail: 'OCR failed — image may be too small or low contrast.' }, aid))

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
  }, [geoSpyKey])  // eslint-disable-line react-hooks/exhaustive-deps

  function clear() {
    analysisId.current++
    setFile(null); setPreview(null); setSignals([]); setRawExif(null)
    setExifLoading(false); setProgress(0); setScanHash('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const hasGps = signals.find(s => s.id === 'gps')?.status === 'found'
  const anyRunning = signals.some(s => s.status === 'running')
  const foundCount = signals.filter(s => s.status === 'found').length

  return (
    <div className="min-h-full p-6 space-y-5">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="relative p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex-shrink-0">
            <MapPin size={22} className="text-orange-400" />
            {anyRunning && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-surface-0 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Image Location Finder</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
                OSINT
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
                Geolocation
              </span>
              {geoSpyKey && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                  GeoSpy Active
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 mt-1">
              GPS · IPTC · Timezone · Device · Sun position · OCR · GeoSpy AI — multi-signal layered analysis
            </p>
          </div>
        </div>

        {/* Scan fingerprint badge */}
        <AnimatePresence>
          {scanHash && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-wire-2 border border-wire-1 text-[11px] font-mono"
            >
              <Fingerprint size={12} className="text-orange-400 flex-shrink-0" />
              <span className="text-slate-600">HASH</span>
              <span className="text-orange-300 tracking-wider">{scanHash.slice(0, 4)}-{scanHash.slice(4, 8)}-{scanHash.slice(8, 12)}-{scanHash.slice(12)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left column: upload / preview + estimate + privacy ──────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="lg:col-span-1 space-y-4">

          {/* Upload zone or image preview */}
          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'card-surface border-2 border-dashed rounded-xl py-12 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200',
                dragging
                  ? 'border-orange-500/70 bg-orange-500/8 scale-[1.01]'
                  : 'border-wire-2 hover:border-orange-500/35 hover:bg-orange-500/4',
              )}
            >
              <motion.div
                animate={dragging ? { scale: 1.15, rotate: 5 } : { scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={clsx('p-4 rounded-full transition-colors', dragging ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-wire-2')}
              >
                <Upload size={24} className={dragging ? 'text-orange-400' : 'text-slate-500'} />
              </motion.div>
              <div className="text-center px-6 space-y-1">
                <p className="text-[13px] font-semibold text-slate-300">{dragging ? 'Drop to analyze' : 'Drop image here'}</p>
                <p className="text-[12px] text-slate-600">or click to browse files</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-center px-4">
                {['JPEG', 'PNG', 'HEIC', 'TIFF', 'WebP'].map(fmt => (
                  <span key={fmt} className="text-[10px] px-1.5 py-0.5 rounded bg-wire-2 text-slate-600 border border-wire-1">{fmt}</span>
                ))}
              </div>
              <input ref={inputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
            </div>
          ) : (
            <div className="card-surface overflow-hidden rounded-xl">
              {/* File header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-wire-1 bg-wire-1/30">
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon size={13} className="text-orange-400 flex-shrink-0" />
                  <span className="text-[12px] text-slate-300 truncate font-mono">{file.name}</span>
                </div>
                <button onClick={clear} className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 ml-2 p-0.5 hover:bg-wire-2 rounded">
                  <X size={13} />
                </button>
              </div>
              {/* Image with scan animation */}
              {preview && (
                <div className="relative overflow-hidden bg-black/20">
                  <img src={preview} alt="preview" className="w-full object-cover max-h-56" />
                  {exifLoading && (
                    <div className="absolute inset-0">
                      {/* Scan line */}
                      <motion.div
                        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-orange-400/80 to-transparent"
                        animate={{ y: ['0%', '100%'] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                      />
                      {/* Dim overlay */}
                      <div className="absolute inset-0 bg-surface-0/60 flex flex-col items-center justify-center gap-2">
                        <div className="w-44 space-y-2">
                          <div className="h-[3px] bg-wire-2 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-orange-400 rounded-full"
                              animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.15 }} />
                          </div>
                          <p className="text-[11px] text-orange-400 text-center font-mono tracking-wider">PARSING METADATA…</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* File info */}
              <div className="px-4 py-2 flex items-center gap-4 text-[11px] text-slate-600 bg-wire-1/20">
                <span>{(file.size / 1024).toFixed(1)} KB</span>
                <span>{file.type || 'image/*'}</span>
                {!exifLoading && foundCount > 0 && (
                  <span className="ml-auto text-emerald-500 font-medium">{foundCount} signal{foundCount !== 1 ? 's' : ''} found</span>
                )}
              </div>
            </div>
          )}

          {/* Combined estimate */}
          <AnimatePresence>
            {signals.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <CombinedEstimate signals={signals} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Privacy exposure */}
          <AnimatePresence>
            {rawExif && signals.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="card-surface overflow-hidden rounded-xl">
                <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2">
                  <Shield size={13} className="text-orange-400" />
                  <span className="text-[12px] font-semibold text-slate-300">Privacy Exposure</span>
                </div>
                <div className="p-3 flex flex-wrap gap-1.5">
                  {hasGps && <span className="text-[11px] px-2 py-0.5 rounded-full border text-rose-400 bg-rose-500/10 border-rose-500/20">GPS coordinates embedded</span>}
                  {hasGps && rawExif.GPSAltitude != null && <span className="text-[11px] px-2 py-0.5 rounded-full border text-rose-400 bg-rose-500/10 border-rose-500/20">Altitude recorded</span>}
                  {rawExif.GPSImgDirection != null && <span className="text-[11px] px-2 py-0.5 rounded-full border text-rose-400 bg-rose-500/10 border-rose-500/20">Camera bearing logged</span>}
                  {rawExif.Make && <span className="text-[11px] px-2 py-0.5 rounded-full border text-amber-400 bg-amber-500/10 border-amber-500/20">Device make & model</span>}
                  {rawExif.DateTimeOriginal && <span className="text-[11px] px-2 py-0.5 rounded-full border text-slate-400 bg-wire-1 border-wire-2">Capture timestamp</span>}
                  {rawExif.Software && <span className="text-[11px] px-2 py-0.5 rounded-full border text-slate-400 bg-wire-1 border-wire-2">Software fingerprint</span>}
                  {rawExif.City && <span className="text-[11px] px-2 py-0.5 rounded-full border text-amber-400 bg-amber-500/10 border-amber-500/20">IPTC city embedded</span>}
                  {!hasGps && !rawExif.Make && !rawExif.DateTimeOriginal && !rawExif.City && (
                    <span className="text-[11px] text-slate-600">No significant metadata detected</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Right column: signal board + EXIF tables ────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="lg:col-span-2 space-y-4">

          {/* Empty state */}
          {!file && (
            <div className="card-surface rounded-xl py-20 flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="p-5 rounded-full bg-wire-2 border border-wire-1">
                  <MapPin size={30} className="text-slate-700" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-medium text-slate-500">Upload an image to begin analysis</p>
                <p className="text-[12px] text-slate-700">Multi-signal geolocation across {[
                  'GPS', 'IPTC', 'Timezone', 'Device', 'Sun', 'OCR', 'GeoSpy'
                ].length} independent signal sources</p>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 max-w-xs w-full px-4">
                {[
                  { icon: Navigation, label: 'GPS EXIF' },
                  { icon: Tag, label: 'IPTC Data' },
                  { icon: Clock, label: 'Timezone' },
                  { icon: Search, label: 'OCR Text' },
                  { icon: Globe, label: 'GeoSpy AI' },
                  { icon: Crosshair, label: 'Camera Bearing' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-wire-1/30">
                    <Icon size={13} className="text-slate-600" />
                    <span className="text-[10px] text-slate-700">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal board */}
          {(exifLoading || signals.length > 0) && (
            <div className="card-surface rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2 bg-wire-1/20">
                <MapPin size={13} className="text-orange-400" />
                <span className="text-[12px] font-semibold text-slate-300">Signal Analysis</span>
                {anyRunning ? (
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-orange-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    Running…
                  </span>
                ) : signals.length > 0 ? (
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className={clsx('w-1.5 h-1.5 rounded-full', foundCount > 0 ? 'bg-emerald-500' : 'bg-slate-600')} />
                    {foundCount} of {signals.length} signals found
                  </span>
                ) : null}
              </div>
              <div className="p-3 space-y-2">
                {exifLoading && signals.length === 0 && (
                  <div className="py-8 flex items-center justify-center gap-2 text-[12px] text-slate-500">
                    <div className="w-4 h-4 rounded-full border border-orange-400/40 border-t-orange-400 animate-spin" />
                    Parsing metadata…
                  </div>
                )}
                {signals.map((signal, i) => (
                  <SignalCard key={signal.id} signal={signal} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* EXIF detail tables */}
          <AnimatePresence>
            {rawExif && signals.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="space-y-4">

                {/* Device & Camera */}
                {(rawExif.Make || rawExif.Model || rawExif.DateTimeOriginal) && (
                  <div className="card-surface rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2 bg-wire-1/20">
                      <Camera size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">Device & Camera</span>
                    </div>
                    <div className="px-4 py-2">
                      {rawExif.Make && <ExifRow label="Make" value={rawExif.Make} />}
                      {rawExif.Model && <ExifRow label="Model" value={rawExif.Model} />}
                      {rawExif.Software && <ExifRow label="Software" value={rawExif.Software} />}
                      {rawExif.CreatorTool && rawExif.CreatorTool !== rawExif.Software && (
                        <ExifRow label="Creator Tool" value={rawExif.CreatorTool} />
                      )}
                      {rawExif.LensModel && <ExifRow label="Lens" value={rawExif.LensModel} />}
                      {rawExif.DateTimeOriginal && <ExifRow label="Date / Time" value={rawExif.DateTimeOriginal.toLocaleString()} mono />}
                      {rawExif.OffsetTimeOriginal && <ExifRow label="UTC Offset" value={rawExif.OffsetTimeOriginal} mono />}
                    </div>
                  </div>
                )}

                {/* Capture settings */}
                {(rawExif.ExposureTime || rawExif.FNumber || rawExif.ISO || rawExif.Flash != null) && (
                  <div className="card-surface rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2 bg-wire-1/20">
                      <Info size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">Capture Settings</span>
                    </div>
                    <div className="px-4 py-2">
                      {rawExif.ImageWidth && rawExif.ImageHeight && (
                        <ExifRow label="Resolution" value={`${rawExif.ImageWidth.toLocaleString()} × ${rawExif.ImageHeight.toLocaleString()} px`} mono />
                      )}
                      {rawExif.ExposureTime && <ExifRow label="Exposure" value={rawExif.ExposureTime < 1 ? `1/${Math.round(1/rawExif.ExposureTime)}s` : `${rawExif.ExposureTime}s`} mono />}
                      {rawExif.FNumber && <ExifRow label="Aperture" value={`f/${rawExif.FNumber}`} mono />}
                      {rawExif.ISO && <ExifRow label="ISO" value={`ISO ${rawExif.ISO}`} mono />}
                      {rawExif.FocalLength && <ExifRow label="Focal Length" value={`${rawExif.FocalLength}mm`} />}
                      {rawExif.Flash != null && (
                        <ExifRow label="Flash" value={`${(rawExif.Flash & 0x1) === 1 ? 'Fired' : 'Did not fire'} (value: 0x${rawExif.Flash.toString(16)})`} mono />
                      )}
                      {rawExif.WhiteBalance != null && (
                        <ExifRow label="White Balance" value={rawExif.WhiteBalance === 0 ? 'Auto' : 'Manual'} />
                      )}
                      {rawExif.SceneCaptureType != null && SCENE_TYPE[rawExif.SceneCaptureType] && (
                        <ExifRow label="Scene Mode" value={SCENE_TYPE[rawExif.SceneCaptureType]} />
                      )}
                    </div>
                  </div>
                )}

                {/* IPTC location */}
                {(rawExif.City || rawExif['Province-State'] || rawExif['Country-PrimaryLocationName'] || rawExif['Sub-location']) && (
                  <div className="card-surface rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2 bg-wire-1/20">
                      <Tag size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">IPTC Location Fields</span>
                    </div>
                    <div className="px-4 py-2">
                      {rawExif['Sub-location'] && <ExifRow label="Sub-location" value={rawExif['Sub-location']} />}
                      {rawExif.City && <ExifRow label="City" value={rawExif.City} />}
                      {rawExif['Province-State'] && <ExifRow label="State / Province" value={rawExif['Province-State']} />}
                      {rawExif['Country-PrimaryLocationName'] && <ExifRow label="Country" value={rawExif['Country-PrimaryLocationName']} />}
                      {rawExif['Country-PrimaryLocationCode'] && <ExifRow label="ISO Code" value={rawExif['Country-PrimaryLocationCode']} mono />}
                    </div>
                  </div>
                )}

                {/* GPS detail */}
                {hasGps && (
                  <div className="card-surface rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wire-1 flex items-center gap-2 bg-wire-1/20">
                      <Navigation size={13} className="text-orange-400" />
                      <span className="text-[12px] font-semibold text-slate-300">Raw GPS EXIF Tags</span>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${rawExif.latitude}&mlon=${rawExif.longitude}#map=15/${rawExif.latitude}/${rawExif.longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        className="ml-auto flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        <ChevronRight size={10} /> View on map
                      </a>
                    </div>
                    <div className="px-4 py-2">
                      <ExifRow label="GPSLatitude" value={`${Math.abs(rawExif.latitude!).toFixed(8)}° ${rawExif.latitude! >= 0 ? 'N' : 'S'}`} mono />
                      <ExifRow label="GPSLongitude" value={`${Math.abs(rawExif.longitude!).toFixed(8)}° ${rawExif.longitude! >= 0 ? 'E' : 'W'}`} mono />
                      {rawExif.GPSAltitude != null && <ExifRow label="GPSAltitude" value={`${rawExif.GPSAltitude.toFixed(1)} m`} mono />}
                      {rawExif.GPSImgDirection != null && (
                        <ExifRow label="GPSImgDirection" value={`${rawExif.GPSImgDirection.toFixed(1)}° ${toCardinal(rawExif.GPSImgDirection)} (${rawExif.GPSImgDirectionRef === 'M' ? 'magnetic' : 'true'})`} mono />
                      )}
                      {rawExif.GPSSatellites && <ExifRow label="GPSSatellites" value={rawExif.GPSSatellites} mono />}
                      {rawExif.GPSDOP != null && <ExifRow label="GPSDOP" value={rawExif.GPSDOP.toFixed(1)} mono />}
                      {rawExif.GPSHPositioningError != null && <ExifRow label="H.PositioningError" value={`±${rawExif.GPSHPositioningError.toFixed(0)} m`} mono />}
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

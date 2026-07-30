import type { LucideIcon } from 'lucide-react'

export interface Tool {
  id: string
  name: string
  description: string
  icon: LucideIcon
  team: 'red' | 'blue' | 'workflow' | 'osint'
  category: string
  path: string
  capabilities: string[]
  status: 'active' | 'idle' | 'running' | 'warning'
}

export interface Activity {
  id: string
  type: 'alert' | 'scan' | 'block' | 'info' | 'warning'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  tool: string
  timestamp: string
}

export interface Metric {
  id: string
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'neutral'
  color: 'blue' | 'red' | 'green' | 'amber'
  icon: LucideIcon
}

export interface ThreatGeo {
  country: string
  city: string
  asn: string
  asnName: string
  risk: 'Low' | 'Medium' | 'High' | 'Critical'
}

export interface ThreatReputation {
  score: number
  tor: boolean
  malware: boolean
  scanner: boolean
  proxy: boolean
  botnet: boolean
}

export interface ThreatEntry {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  type: string
  source: string
  target: string
  time?: string         // legacy, replaced by timestamp
  timestamp?: string    // ISO — from server
  protocol?: string
  mitre?: string[]
  geo?: ThreatGeo
  reputation?: ThreatReputation
  status: 'active' | 'blocked' | 'monitoring' | 'investigating' | 'resolved'
  notes?: string
  source_label?: string
}

export interface ScanHost {
  ip: string
  hostname: string
  ports: number[]
  services: string[]
  os: string
  status: 'up' | 'filtered' | 'down'
}

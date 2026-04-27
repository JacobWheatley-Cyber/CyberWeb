import type { ThreatEntry, ScanHost } from '../types'

export const threatFeed: ThreatEntry[] = [
  { id: 't1', severity: 'critical', type: 'Ransomware C2 Beacon', source: '185.220.101.45', target: '10.0.1.23', time: '2m ago', status: 'active' },
  { id: 't2', severity: 'high', type: 'SQL Injection Attempt', source: '91.108.56.133', target: '10.0.1.45:8080', time: '5m ago', status: 'blocked' },
  { id: 't3', severity: 'high', type: 'SSH Brute Force', source: '45.33.32.156', target: '10.0.1.10:22', time: '8m ago', status: 'blocked' },
  { id: 't4', severity: 'high', type: 'LDAP Injection', source: '192.168.99.12', target: '10.0.1.5:389', time: '11m ago', status: 'investigating' },
  { id: 't5', severity: 'medium', type: 'Horizontal Port Scan', source: '198.51.100.42', target: '10.0.0.0/24', time: '14m ago', status: 'monitoring' },
  { id: 't6', severity: 'medium', type: 'DNS Tunneling Detected', source: '10.0.1.87', target: 'exfil.evil-corp.io', time: '19m ago', status: 'investigating' },
  { id: 't7', severity: 'medium', type: 'Suspicious PowerShell', source: 'WKSTN-082', target: 'local', time: '26m ago', status: 'blocked' },
  { id: 't8', severity: 'low', type: 'Failed Admin Login x5', source: '10.0.1.120', target: '10.0.1.1', time: '33m ago', status: 'monitoring' },
  { id: 't9', severity: 'low', type: 'Outbound FTP Attempt', source: '10.0.1.34', target: '203.0.113.88:21', time: '41m ago', status: 'blocked' },
  { id: 't10', severity: 'low', type: 'Weak TLS Cipher', source: 'external', target: 'mail.corp.io', time: '1h ago', status: 'resolved' },
]

export const scanHosts: ScanHost[] = [
  { ip: '192.168.1.1', hostname: 'gw-core-01', ports: [22, 80, 443, 8080], services: ['SSH', 'HTTP', 'HTTPS', 'HTTP-alt'], os: 'Cisco IOS 17.x', status: 'up' },
  { ip: '192.168.1.10', hostname: 'web-prod-01', ports: [22, 80, 443, 8443], services: ['SSH', 'HTTP', 'HTTPS', 'HTTPS-alt'], os: 'Ubuntu 22.04 LTS', status: 'up' },
  { ip: '192.168.1.20', hostname: 'db-primary', ports: [22, 3306, 5432], services: ['SSH', 'MySQL', 'PostgreSQL'], os: 'Debian 12 (Bookworm)', status: 'up' },
]

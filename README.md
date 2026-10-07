# CyberWeb

CyberWeb is a local cybersecurity workbench under active development. Run it only against systems you own or are authorized to assess.

## Start locally

1. Install Node.js 18 or later and project dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set a strong random `CYBERWEB_API_KEY`.
3. Run `CyberWeb.bat` on Windows, or `npm start` where the launcher is supported.
4. Open `http://localhost:5173`. In **Settings → Security**, enter the same API key. The browser keeps it in tab session storage; older keys stored in local storage are discarded.

The API binds to `127.0.0.1:3001`. Vite proxies `/api` requests from the local UI. Cross-origin API access and API keys in URL query parameters are disabled. Do not expose the development UI or API to the internet. The Windows launcher waits for both services before opening the browser.

If a scan reports that the API key is missing or incorrect, open **Settings → Security**, paste the `CYBERWEB_API_KEY` value from `.env`, and select **Test connection**. A new browser tab or session needs the key again. If the test says the server is unreachable, inspect the CyberWeb launcher terminal for the startup error; check that port 3001 is available.

## Scan targets

Network Recon, Port Scanner, and Vulnerability Scanner accept valid public or private IPv4 targets without an IP allowlist. Hostnames resolve to one IPv4 address, which is pinned for the scan. Network Recon accepts at most a `/22`; Port Scanner accepts at most 10,000 ports per request. Closing a network or port scan stops queued work and active socket probes. Use these tools only on systems you are authorized to assess.

## Current tool state

- **Implemented local functions:** Network Recon, TCP Port Scanner, evidence-based HTTP/TLS/Redis Vulnerability Scanner, Payload Builder, passive Wireless Analyzer, local Threat Monitor, Image Location Finder, Sherlock username checks, and Code Checkpoint.
- **Planned:** the other catalog tools, including WHOIS & DNS Intel, Email Harvester, and Breach Search. Earlier browser-generated examples are no longer routed because they were not real intelligence.
- **Not connected:** the experimental phishing module remains outside application and server routes.

Network Recon uses ICMP echo and a small TCP fallback set for discovery, then checks selected TCP ports on responsive hosts. "No response" does not prove a host is offline. Reverse DNS is optional and bounded. The Port Scanner uses TCP connect, reads limited banners, and records TLS metadata when a handshake succeeds. Its review priority is based on a port hint; it is not a vulnerability rating. Neither tool performs raw-packet SYN/UDP scans or reliable OS fingerprinting.

The Vulnerability Scanner runs read-only checks on selected HTTP/HTTPS ports, presented TLS certificate expiry, and unauthenticated Redis PING. Every finding includes its observed evidence. It does not exploit services, verify data access, enumerate CVEs, or establish that an unreported service is safe. Wireless severity values remain heuristic priorities. Threat Monitor supports acknowledging alerts but does not change firewall rules. The last 100 activity entries and up to 1,000 threats from the last 30 days are saved under the Git-ignored `.cyberweb-data` directory. Other scan results are not persisted. User accounts, role-based access, notifications, and configurable retention are not implemented.

Image Location Finder runs its local analysis in the browser. If you configure GeoSpy, you must enable its upload checkbox before an image is sent to that external service.

Payload Builder invokes a real local `msfvenom` installation to generate Windows/Linux x86/x64 stageless reverse TCP shells. Select the platform, EXE/ELF or raw shellcode format, callback host and callback port. Generate and download the binary and matching Metasploit handler resource file. The callback address must be reachable from your test target; configure the listener bind address separately if using NAT. Files include SHA-256 fingerprints and a hex preview. Raw output requires a compatible loader. The application generates files; delivery and session handling happen separately.

### Metasploit setup

Every tool page includes a **Tool manual** with animated pages, contents navigation, and Previous/Next controls. Arrow keys turn pages and Escape closes the manual. Animations honor the system and CyberWeb reduced-motion preferences. Implemented tools include usage, interpretation, and troubleshooting; planned tools explain their unavailable status. Payload Builder also displays the exact requirement blocking Generate and inline compiler setup instructions.

Install Metasploit separately on the API host. On Windows, install a Kali WSL distribution with Metasploit and set these values in `.env` (use the distribution name shown by `wsl --list --quiet`):

```text
CYBERWEB_MSF_MODE=wsl
CYBERWEB_MSF_DISTRO=kali-linux
CYBERWEB_MSF_PATH=/usr/bin/msfvenom
```

On native Linux, use `CYBERWEB_MSF_MODE=native`; `CYBERWEB_MSF_PATH` defaults to `msfvenom` on PATH. Restart CyberWeb after changing `.env`. The compiler status checks that the four required modules exist; status checks are cached for 30 seconds. The API host needs outbound connectivity if a callback hostname requires DNS resolution.

Compiler arguments are validated, passed with `execFile` without a command shell, and restricted to the supported catalog. Builds are limited to one at a time, two minutes, and 8 MiB of output. All payload endpoints require the API key. Up to eight artifacts are held in API memory for an hour and lost on restart; no generated executable is run by CyberWeb. A stale download returns an explicit expiration error. Unit/integration tests use inert binary fixtures rather than real shell payloads.

Code Checkpoint reviews the working tree before committing, refuses common secret-file types, and accepts only GitHub HTTPS or SSH remotes for push. Review the listed files and remote before confirming.

## Checks

```text
node --test server/targetPolicy.test.js server/localStore.test.js server/redTools.test.js
node --test tests/payloadBuilder.test.js
node_modules/.bin/tsc --noEmit
```

On PowerShell, invoke TypeScript with `& .\node_modules\.bin\tsc.cmd --noEmit`.

After `npm run build`, run `node tests/payloadBuilder.browser.mjs` for the Payload Builder browser smoke test. It uses the installed Puppeteer browser and a temporary loopback HTTP server.

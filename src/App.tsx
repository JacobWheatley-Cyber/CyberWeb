import { useState, useEffect, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { NetworkRecon } from './pages/tools/NetworkRecon'
import { ThreatMonitor } from './pages/tools/ThreatMonitor'
import { VulnScanner } from './pages/tools/VulnScanner'
import { PortScanner } from './pages/tools/PortScanner'
import { CodeCheckpoint } from './pages/tools/CodeCheckpoint'
import { ImageLocationFinder } from './pages/tools/ImageLocationFinder'
import { Sherlock } from './pages/tools/Sherlock'
import { WhoisDnsIntel } from './pages/tools/WhoisDnsIntel'
import { EmailHarvester } from './pages/tools/EmailHarvester'
import { BreachSearch } from './pages/tools/BreachSearch'
import { WirelessAnalyzer } from './pages/tools/WirelessAnalyzer'
import { ToolPlaceholder } from './pages/tools/ToolPlaceholder'
import { redTools, blueTools, workflowTools, osintTools } from './data/tools'
import { useSettings, SESSION_TIMEOUT_MS } from './hooks/useSettings'
import { SettingsContext } from './context/SettingsContext'
import { useProfile } from './hooks/useProfile'
import { ProfileContext } from './context/ProfileContext'
import { Profile } from './pages/Profile'
import { ShieldOff, RefreshCw } from 'lucide-react'

const osintDedicatedIds = new Set(['image-location-finder', 'sherlock', 'whois-dns-intel', 'email-harvester', 'breach-search'])

const placeholderTools = [
  ...redTools.filter(t => t.id !== 'network-recon' && t.id !== 'vuln-scanner' && t.id !== 'port-scanner' && t.id !== 'wireless-analyzer'),
  ...blueTools.filter(t => t.id !== 'threat-monitor' && t.id !== 'code-checkpoint'),
  ...workflowTools,
  ...osintTools.filter(t => !osintDedicatedIds.has(t.id)),
]

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="min-h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/tools/network-recon" element={<NetworkRecon />} />
          <Route path="/tools/threat-monitor" element={<ThreatMonitor />} />
          <Route path="/tools/vuln-scanner" element={<VulnScanner />} />
          <Route path="/tools/port-scanner" element={<PortScanner />} />
          <Route path="/tools/code-checkpoint" element={<CodeCheckpoint />} />
          <Route path="/tools/image-location-finder" element={<ImageLocationFinder />} />
          <Route path="/tools/sherlock" element={<Sherlock />} />
          <Route path="/tools/whois-dns-intel" element={<WhoisDnsIntel />} />
          <Route path="/tools/email-harvester" element={<EmailHarvester />} />
          <Route path="/tools/breach-search" element={<BreachSearch />} />
          <Route path="/tools/wireless-analyzer" element={<WirelessAnalyzer />} />
          {placeholderTools.map(tool => (
            <Route
              key={tool.id}
              path={`/tools/${tool.id}`}
              element={<ToolPlaceholder tool={tool} />}
            />
          ))}
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Session timeout overlay ───────────────────────────────────────────────────

function SessionExpiredOverlay({ onResume }: { onResume: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="card-surface-elevated p-8 max-w-sm w-full mx-4 text-center space-y-5"
      >
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20">
            <ShieldOff size={28} className="text-amber-400" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Session Locked</h2>
          <p className="text-[13px] text-slate-500 mt-1">
            Your session has been locked due to inactivity.
          </p>
        </div>
        <button
          onClick={onResume}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} /> Resume Session
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const settingsApi = useSettings()
  const profileApi = useProfile()
  const { settings } = settingsApi

  // Apply all data-* attributes to <html> whenever settings change
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-theme', settings.theme)
    html.setAttribute('data-fontsize', settings.fontSize)
    html.setAttribute('data-density', settings.sidebarDensity)
    html.setAttribute('data-motion', settings.reducedMotion ? 'reduced' : 'normal')

    // Monospace font via CSS variable
    html.style.setProperty('--font-mono-override', `"${settings.monoFont}", monospace`)
  }, [settings.theme, settings.fontSize, settings.sidebarDensity, settings.reducedMotion, settings.monoFont])

  // Session timeout
  const resetTimer = useCallback(() => {
    setSessionExpired(false)
  }, [])

  useEffect(() => {
    const ms = SESSION_TIMEOUT_MS[settings.sessionTimeout]
    if (!ms) return

    let timer: ReturnType<typeof setTimeout>

    const bump = () => {
      clearTimeout(timer)
      if (!sessionExpired) timer = setTimeout(() => setSessionExpired(true), ms)
    }

    bump()
    window.addEventListener('mousemove', bump, { passive: true })
    window.addEventListener('keydown', bump, { passive: true })
    window.addEventListener('click', bump, { passive: true })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', bump)
      window.removeEventListener('keydown', bump)
      window.removeEventListener('click', bump)
    }
  }, [settings.sessionTimeout, sessionExpired])

  return (
    <>
    <SettingsContext.Provider value={settingsApi}>
      <ProfileContext.Provider value={profileApi}>
      <div className="flex h-screen overflow-hidden bg-surface-0 text-slate-100">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <TopBar
            sidebarCollapsed={sidebarCollapsed}
            onMenuToggle={() => setSidebarCollapsed(c => !c)}
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatedRoutes />
          </main>
        </div>
      </div>

      <AnimatePresence>
        {sessionExpired && <SessionExpiredOverlay onResume={() => { setSessionExpired(false); resetTimer() }} />}
      </AnimatePresence>
      </ProfileContext.Provider>
    </SettingsContext.Provider>

    </>
  )
}

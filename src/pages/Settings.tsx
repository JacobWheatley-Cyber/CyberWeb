import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  SlidersHorizontal, Palette, Bell, Lock, Plug, Users,
  Check, Key, Eye, EyeOff, RotateCcw, Monitor, Terminal,
  Layers, AlertTriangle, ShieldCheck, Webhook,
} from 'lucide-react'
import { useSettingsContext } from '../context/SettingsContext'
import type { Theme, FontSize, SidebarDensity, SessionTimeout } from '../hooks/useSettings'

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button onClick={onChange} disabled={disabled}
      className={clsx(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0',
        checked ? 'bg-blue-500' : 'bg-wire-3',
        disabled && 'opacity-40 cursor-not-allowed',
      )}>
      <motion.span
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm"
      />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="px-5 py-3.5 border-b border-wire-1">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-slate-300">{label}</div>
        {hint && <div className="text-[12px] text-slate-600 mt-0.5">{hint}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, type = 'text', width = 'w-56',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  width?: string
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      className={clsx(
        'bg-wire-1 border border-wire-3 rounded-md px-3 py-1.5 text-[13px] text-slate-300',
        'placeholder:text-slate-600 outline-none focus:border-blue-500/50 focus:bg-surface-3',
        'transition-all duration-150', width,
      )}
    />
  )
}

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className={clsx(
        'bg-wire-1 border border-wire-3 rounded-md px-3 py-1.5 text-[13px] text-slate-300',
        'outline-none focus:border-blue-500/50 cursor-pointer transition-all duration-150 w-48',
      )}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ── Theme picker ──────────────────────────────────────────────────────────────

const THEMES: { id: Theme; label: string; desc: string; swatch: string[] }[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    desc: 'Deep space navy — the default',
    swatch: ['#04070f', '#0b1224', '#152240', '#3b82f6'],
  },
  {
    id: 'phosphor',
    label: 'Phosphor',
    desc: 'Classic CRT terminal green',
    swatch: ['#020803', '#050f06', '#122814', '#22c55e'],
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    desc: 'Volcanic deep purple-black',
    swatch: ['#08060e', '#100d18', '#27213a', '#a78bfa'],
  },
  {
    id: 'graphite',
    label: 'Graphite',
    desc: 'Pure neutral monochrome',
    swatch: ['#080808', '#121212', '#2c2c2c', '#94a3b8'],
  },
]

function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {THEMES.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={clsx(
            'relative flex flex-col gap-2 p-3 rounded-lg border transition-all text-left',
            value === t.id
              ? 'border-blue-500/50 bg-blue-500/8'
              : 'border-wire-2 hover:border-wire-3 bg-wire-1',
          )}>
          {/* Swatch */}
          <div className="flex gap-1.5 items-center">
            {t.swatch.map((c, i) => (
              <div key={i} className="h-4 rounded" style={{
                backgroundColor: c,
                width: i === 3 ? '12px' : '16px',
                border: '1px solid rgba(255,255,255,0.08)',
              }} />
            ))}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-200 flex items-center gap-2">
              {t.label}
              {value === t.id && <Check size={12} className="text-blue-400" />}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">{t.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── API key row ────────────────────────────────────────────────────────────────

function ApiKeyRow({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const hasValue = value.trim().length > 0

  function commit() {
    onChange(draft.trim())
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-wire-1 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-slate-300">{name}</div>
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="Paste API key…"
              className="bg-wire-1 border border-blue-500/40 rounded px-2.5 py-1 text-[12px] font-mono text-slate-300 w-52 outline-none"
            />
            <button onClick={commit} className="px-2.5 py-1 rounded text-[12px] bg-blue-500 text-white font-medium">Save</button>
            <button onClick={() => setEditing(false)} className="px-2.5 py-1 rounded text-[12px] text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
          </>
        ) : (
          <>
            <div className="relative">
              <input
                readOnly
                type={show ? 'text' : 'password'}
                value={hasValue ? value : ''}
                placeholder={hasValue ? '' : 'Not configured'}
                className="bg-wire-1 border border-wire-2 rounded px-2.5 py-1 text-[12px] font-mono text-slate-400 w-44 outline-none pr-7 cursor-default placeholder:text-slate-700"
              />
              {hasValue && (
                <button onClick={() => setShow(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                  {show ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              )}
            </div>
            <span className={clsx(
              'text-[11px] font-medium px-2 py-0.5 rounded border',
              hasValue
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-slate-500 bg-wire-1 border-wire-2',
            )}>
              {hasValue ? 'Set' : 'Not set'}
            </span>
            <button onClick={() => { setDraft(value); setEditing(true) }}
              className="text-[12px] text-blue-400 hover:text-blue-300 transition-colors">
              {hasValue ? 'Edit' : 'Add'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'general',      label: 'General',        icon: SlidersHorizontal },
  { id: 'appearance',   label: 'Appearance',      icon: Palette },
  { id: 'notifications',label: 'Notifications',   icon: Bell },
  { id: 'security',     label: 'Security',        icon: Lock },
  { id: 'integrations', label: 'Integrations',    icon: Plug },
  { id: 'team',         label: 'Team',            icon: Users },
]

// ── Main ──────────────────────────────────────────────────────────────────────

export function Settings() {
  const { settings, update, setApiKey, reset } = useSettingsContext()
  const [activeTab, setActiveTab] = useState('general')
  const [saved, setSaved] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleUpdate<K extends keyof typeof settings>(key: K, value: typeof settings[K]) {
    update(key, value)
    flashSaved()
  }

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return }
    reset()
    setConfirmReset(false)
    flashSaved()
  }

  return (
    <div className="min-h-full">
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">All changes save automatically</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all',
                confirmReset
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : 'text-slate-500 border-wire-2 hover:text-slate-300 hover:border-wire-3',
              )}>
              <RotateCcw size={12} />
              {confirmReset ? 'Click again to confirm' : 'Reset defaults'}
            </button>
            <AnimatePresence>
              {saved && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={12} /> Saved
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Sidebar */}
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
            className="md:col-span-1 card-surface h-fit p-2 space-y-0.5">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150',
                    activeTab === tab.id ? 'bg-blue-500/15 text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-wire-2',
                  )}>
                  <Icon size={15} className="flex-shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </motion.div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="md:col-span-3 space-y-4">

              {/* ── General ── */}
              {activeTab === 'general' && (
                <>
                  <Section title="Platform">
                    <Field label="Organization Name" hint="Shown in the dashboard greeting">
                      <TextInput value={settings.orgName} onChange={v => handleUpdate('orgName', v)} placeholder="My Organization" />
                    </Field>
                    <Field label="Timezone" hint="Used for date and time display">
                      <Select<string>
                        value={settings.timezone}
                        onChange={v => handleUpdate('timezone', v)}
                        options={[
                          { value: 'UTC', label: 'UTC' },
                          { value: 'America/New_York', label: 'Eastern (ET)' },
                          { value: 'America/Chicago', label: 'Central (CT)' },
                          { value: 'America/Denver', label: 'Mountain (MT)' },
                          { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
                          { value: 'Europe/London', label: 'London (GMT)' },
                          { value: 'Europe/Berlin', label: 'Berlin (CET)' },
                          { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
                        ]}
                      />
                    </Field>
                    <Field label="Session Timeout" hint="Auto-lock after this period of inactivity">
                      <Select<SessionTimeout>
                        value={settings.sessionTimeout}
                        onChange={v => handleUpdate('sessionTimeout', v)}
                        options={[
                          { value: '15m', label: '15 minutes' },
                          { value: '30m', label: '30 minutes' },
                          { value: '1h',  label: '1 hour' },
                          { value: '4h',  label: '4 hours' },
                          { value: 'never', label: 'Never' },
                        ]}
                      />
                    </Field>
                    <Field label="Auto-update signatures" hint="Keep CVE rules current on startup">
                      <Toggle checked={settings.autoUpdate} onChange={() => handleUpdate('autoUpdate', !settings.autoUpdate)} />
                    </Field>
                    <Field label="Anonymous diagnostics" hint="Help improve CyberWeb with anonymized data">
                      <Toggle checked={settings.crashReports} onChange={() => handleUpdate('crashReports', !settings.crashReports)} />
                    </Field>
                  </Section>

                  <Section title="Data Retention">
                    <Field label="Scan results retention">
                      <Select<string> value={settings.scanRetention} onChange={v => handleUpdate('scanRetention', v)}
                        options={['30 days','60 days','90 days','1 year','Indefinite'].map(v => ({ value: v, label: v }))} />
                    </Field>
                    <Field label="Activity log retention">
                      <Select<string> value={settings.activityRetention} onChange={v => handleUpdate('activityRetention', v)}
                        options={['90 days','6 months','1 year','2 years','Indefinite'].map(v => ({ value: v, label: v }))} />
                    </Field>
                    <Field label="Alert archive retention">
                      <Select<string> value={settings.alertRetention} onChange={v => handleUpdate('alertRetention', v)}
                        options={['6 months','1 year','2 years','Indefinite'].map(v => ({ value: v, label: v }))} />
                    </Field>
                  </Section>
                </>
              )}

              {/* ── Appearance ── */}
              {activeTab === 'appearance' && (
                <>
                  <Section title="Theme">
                    <ThemePicker value={settings.theme} onChange={v => handleUpdate('theme', v)} />
                  </Section>

                  <Section title="Display">
                    <Field label="Sidebar density" hint="Controls spacing of navigation items">
                      <Select<SidebarDensity> value={settings.sidebarDensity} onChange={v => handleUpdate('sidebarDensity', v)}
                        options={[
                          { value: 'compact', label: 'Compact' },
                          { value: 'comfortable', label: 'Comfortable' },
                          { value: 'spacious', label: 'Spacious' },
                        ]} />
                    </Field>
                    <Field label="Font size">
                      <Select<FontSize> value={settings.fontSize} onChange={v => handleUpdate('fontSize', v)}
                        options={[
                          { value: 'small', label: 'Small (13px)' },
                          { value: 'default', label: 'Default (14px)' },
                          { value: 'large', label: 'Large (15px)' },
                        ]} />
                    </Field>
                    <Field label="Monospace font" hint="Used in scan results and code output">
                      <Select<string> value={settings.monoFont} onChange={v => handleUpdate('monoFont', v)}
                        options={['JetBrains Mono','Fira Code','Cascadia Code','Courier New','System Mono'].map(v => ({ value: v, label: v }))} />
                    </Field>
                    <Field label="Reduced motion" hint="Disables all UI animations">
                      <Toggle checked={settings.reducedMotion} onChange={() => handleUpdate('reducedMotion', !settings.reducedMotion)} />
                    </Field>
                  </Section>
                </>
              )}

              {/* ── Notifications ── */}
              {activeTab === 'notifications' && (
                <>
                  <Section title="Webhooks">
                    <Field label="Webhook notifications" hint="POST scan results to an endpoint">
                      <Toggle checked={settings.webhookEnabled} onChange={() => handleUpdate('webhookEnabled', !settings.webhookEnabled)} />
                    </Field>
                    <Field label="Webhook URL" hint="Receives a JSON payload on each scan completion">
                      <TextInput value={settings.webhookUrl} onChange={v => handleUpdate('webhookUrl', v)}
                        placeholder="https://hooks.example.com/..." />
                    </Field>
                  </Section>

                  <Section title="Alert Filtering">
                    <Field label="Minimum severity" hint="Suppress findings below this level">
                      <Select<string> value={settings.minSeverity} onChange={v => handleUpdate('minSeverity', v)}
                        options={['Info','Low','Medium','High','Critical'].map(v => ({ value: v, label: v }))} />
                    </Field>
                    <Field label="Critical only" hint="Only surface critical severity findings">
                      <Toggle checked={settings.criticalOnly} onChange={() => handleUpdate('criticalOnly', !settings.criticalOnly)} />
                    </Field>
                    <Field label="Alert digest">
                      <Select<string> value={settings.alertDigest} onChange={v => handleUpdate('alertDigest', v)}
                        options={['Real-time','Hourly','Daily','Weekly'].map(v => ({ value: v, label: v }))} />
                    </Field>
                  </Section>
                </>
              )}

              {/* ── Security ── */}
              {activeTab === 'security' && (
                <>
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-md bg-amber-500/8 border border-amber-500/20 text-[12px] text-amber-400">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    Authentication settings are stored locally. Full enforcement requires a backend with user management.
                  </div>

                  <Section title="Authentication">
                    <Field label="Two-factor authentication" hint="Require a second factor at login">
                      <Toggle checked={settings.twoFactor} onChange={() => handleUpdate('twoFactor', !settings.twoFactor)} />
                    </Field>
                    <Field label="SSO provider">
                      <Select<string> value={settings.ssoProvider} onChange={v => handleUpdate('ssoProvider', v)}
                        options={['None','Okta','Azure AD','Google Workspace','SAML 2.0'].map(v => ({ value: v, label: v }))} />
                    </Field>
                    <Field label="Password policy">
                      <Select<string> value={settings.passwordPolicy} onChange={v => handleUpdate('passwordPolicy', v)}
                        options={[
                          { value: 'Standard', label: 'Standard' },
                          { value: 'Strong (12+ chars)', label: 'Strong (12+ chars)' },
                          { value: 'Strict (16+ chars)', label: 'Strict (16+ chars)' },
                        ]} />
                    </Field>
                  </Section>

                  <Section title="Access Control">
                    <Field label="IP allowlist" hint="Restrict access to specific IP ranges">
                      <Toggle checked={settings.ipAllowlist} onChange={() => handleUpdate('ipAllowlist', !settings.ipAllowlist)} />
                    </Field>
                    <Field label="Allowed IP ranges" hint="Comma-separated CIDR notation">
                      <TextInput value={settings.allowedIPs} onChange={v => handleUpdate('allowedIPs', v)}
                        placeholder="10.0.0.0/8, 192.168.1.0/24"
                        width={clsx('w-56', !settings.ipAllowlist && 'opacity-40 pointer-events-none')} />
                    </Field>
                    <Field label="Audit log" hint="Record all scan and user activity">
                      <Toggle checked={settings.auditLog} onChange={() => handleUpdate('auditLog', !settings.auditLog)} />
                    </Field>
                    <Field label="API access" hint="Allow programmatic access via API endpoints">
                      <Toggle checked={settings.apiAccess} onChange={() => handleUpdate('apiAccess', !settings.apiAccess)} />
                    </Field>
                  </Section>
                </>
              )}

              {/* ── Integrations ── */}
              {activeTab === 'integrations' && (
                <Section title="API Keys">
                  <p className="text-[12px] text-slate-500 -mt-1">
                    Keys are stored in browser local storage. Do not use production secrets in shared browsers.
                  </p>
                  {Object.keys(settings.apiKeys).map(name => (
                    <ApiKeyRow key={name} name={name} value={settings.apiKeys[name]}
                      onChange={v => { setApiKey(name, v); flashSaved() }} />
                  ))}
                  <div className="pt-2 text-[12px] text-slate-600">
                    Keys are used by scan modules when querying external threat intelligence services.
                  </div>
                </Section>
              )}

              {/* ── Team ── */}
              {activeTab === 'team' && (
                <div className="card-surface py-16 flex flex-col items-center gap-4 text-center">
                  <div className="p-4 rounded-full bg-wire-2">
                    <Users size={28} className="text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-300">Team management requires a backend</p>
                    <p className="text-[12px] text-slate-600 mt-1 max-w-72 mx-auto">
                      User accounts, roles, and invitations need a server-side authentication system. This is a planned feature.
                    </p>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

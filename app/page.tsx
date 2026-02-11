'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface StreamItem {
  id?: string
  uid: string // unique client-side ID for tracking
  type: 'writing' | 'ai-annotation' | 'ai-conversational' | 'merged-header' | 'image'
  content: string
  tone?: string
  linked_entry_id?: string | null
  tool_call?: any
  animating?: boolean
  mergedFrom?: string
  waveDelay?: number
  exiting?: boolean
  exitDelay?: number
  isNew?: boolean
  // ─── Edit tracking ───
  sourceUid?: string
  originalContent?: string
  editedSinceProcess?: boolean
  processing?: boolean
  // ─── Image ───
  imageUrl?: string
  imageWidth?: number  // percentage of container width (10-100)
  imageFloat?: 'none' | 'left' | 'right'
}

interface ModelOption {
  id: string
  label: string
  provider: string
  available: boolean
}

interface AppState {
  authed: boolean
  loading: boolean
  entryId: string | null
  stream: StreamItem[]
  busy: boolean
  greetingVisible: boolean
  greeting: string
  recentEntryId: string | null
  recentEntryTopic: string | null
  continuationChecked: boolean
  panelOpen: boolean
  theme: 'light' | 'dark'
  error: string | null
  entryTitle: string | null
  model: string
  models: ModelOption[]
  modelPickerOpen: boolean
  streamFadeMs: number
  importOpen: boolean
}

let _uid = 0
function uid() { return `si-${++_uid}-${Date.now()}` }

// ═══════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const password = inputRef.current?.value || pw
    if (!password.trim()) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) onLogin()
      else {
        setErr('Wrong password')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        inputRef.current?.select()
      }
    } catch {
      setErr('Connection error')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-bg-grain" />
      <div className="login-card">
        <div className="login-lock">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="login-title">Smart Notebook</h1>
        <form className={`login-form ${shake ? 'shake' : ''}`} onSubmit={submit} autoComplete="on" method="post" action="">
          <input type="text" name="username" autoComplete="username" defaultValue="notebook" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} tabIndex={-1} aria-hidden="true" />
          <label className="login-label" htmlFor="password">Password</label>
          <div className="login-input-wrap">
            <input
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              className="login-input"
              placeholder="Enter your password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              disabled={loading}
              enterKeyHint="go"
              id="password"
            />
            <button type="button" className="login-eye" onClick={() => setShowPw(!showPw)} tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>
          </div>
          {err && <p className="login-err">{err}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? <><svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg><span>Signing in...</span></>
              : <span>Unlock</span>}
          </button>
        </form>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// TOOL RENDERERS
// ═══════════════════════════════════════════

function ToolRender({ toolCall, messageId, onLoadEntry }: { toolCall: any; messageId?: string; onLoadEntry?: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)
  const data = toolCall.data || {}

  useEffect(() => {
    if (toolCall.type === 'chart' && canvasRef.current) {
      if (chartRef.current) chartRef.current.destroy()
      const Chart = (window as any).Chart
      if (!Chart) return
      chartRef.current = new Chart(canvasRef.current, {
        type: data.chartType || 'bar',
        data: { labels: data.labels || [], datasets: (data.datasets || []).map((ds: any, i: number) => ({ ...ds, backgroundColor: chartColor(i, 0.2), borderColor: chartColor(i, 1), borderWidth: 2, tension: 0.4 })) },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { font: { family: 'DM Sans' } } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.05)' } } } },
      })
    }
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [toolCall])

  const toggleCheck = async (idx: number) => { if (!messageId) return; try { await fetch('/api/checklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, itemIndex: idx }) }) } catch {} }

  if (toolCall.type === 'load_entry') return null

  return (
    <div className="tool-box">
      {toolCall.title && <div className="tool-head">{toolCall.title}</div>}
      {toolCall.type === 'chart' && <canvas ref={canvasRef} className="tool-chart" />}
      {toolCall.type === 'table' && (<div className="tool-tbl-wrap"><table className="tool-tbl">{data.headers && <thead><tr>{data.headers.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead>}<tbody>{(data.rows || []).map((row: any[], ri: number) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}</tbody></table></div>)}
      {toolCall.type === 'checklist' && <ChecklistTool items={data.items || []} onToggle={toggleCheck} />}
      {toolCall.type === 'prompt_card' && <div className="tool-prompt">{data.prompt}</div>}
      {toolCall.type === 'tracker' && (<div className="tool-tracker"><div className="tr-metric">{data.metric}</div>{(data.values || []).map((v: any, i: number) => <div key={i} className="tr-pt"><span className="tr-val">{v.value}</span><span className="tr-unit">{data.unit || ''}</span><span className="tr-date">{v.date || ''}</span></div>)}</div>)}
      {toolCall.type === 'link_card' && (<div className="tool-link-card" onClick={() => data.entry_id && onLoadEntry?.(data.entry_id)} style={{ cursor: data.entry_id ? 'pointer' : 'default' }}><div style={{ fontSize: '0.85rem' }}>{data.title || 'Past Entry'}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{data.date || ''}</div></div>)}
      {toolCall.type === 'calendar_view' && (<div className="tool-calendar">{(data.events || []).map((ev: any, i: number) => <div key={i} className="cal-event"><span className="cal-date">{ev.date}</span><span className="cal-title">{ev.title}</span></div>)}</div>)}
    </div>
  )
}

function ChecklistTool({ items, onToggle }: { items: any[]; onToggle: (i: number) => void }) {
  const [state, setState] = useState(items)
  const toggle = (i: number) => { setState(prev => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item)); onToggle(i) }
  return (
    <ul className="tool-cl">{state.map((item, i) => (
      <li key={i} className={item.checked ? 'done' : ''} onClick={() => toggle(i)}>
        <span className="cl-icon">{item.checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
        <span className="cl-txt">{item.text}</span>
      </li>
    ))}</ul>
  )
}

function chartColor(i: number, a: number) {
  const c = [`rgba(196,119,90,${a})`,`rgba(154,176,142,${a})`,`rgba(178,148,120,${a})`,`rgba(132,120,160,${a})`,`rgba(180,130,140,${a})`]
  return c[i % c.length]
}

// ═══════════════════════════════════════════
// IMPORT PANEL — Genspark conversation import
// ═══════════════════════════════════════════

function ImportPanel({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (entryId: string) => void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setUrl(''); setError(''); setPreview(null); setTimeout(() => inputRef.current?.focus(), 200) }
  }, [open])

  const handleFetch = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to fetch conversation'); setLoading(false); return }
      setPreview(data)
    } catch {
      setError('Connection error — check your network')
    }
    setLoading(false)
  }

  const handleImport = async () => {
    if (!preview) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), messages: preview.messages, title: preview.title }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to import'); setLoading(false); return }
      onImported(data.entryId)
      onClose()
    } catch {
      setError('Connection error')
    }
    setLoading(false)
  }

  return (
    <>
      <div className={`panel-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`import-panel ${open ? 'open' : ''}`}>
        <div className="p-head">
          <span className="p-title">Import Conversation</span>
          <button className="p-close" onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
        <div className="import-body">
          <p className="import-desc">Paste a shared Genspark conversation link to import it as a notebook entry.</p>
          <div className="import-input-row">
            <input
              ref={inputRef}
              type="url"
              className="import-url-input"
              placeholder="https://www.genspark.ai/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleFetch() }}
              disabled={loading}
            />
            <button className="import-fetch-btn" onClick={handleFetch} disabled={loading || !url.trim()}>
              {loading && !preview ? <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> : 'Fetch'}
            </button>
          </div>
          {error && <div className="import-error">{error}</div>}
          {preview && (
            <div className="import-preview">
              <div className="import-preview-title">{preview.title || 'Untitled Conversation'}</div>
              <div className="import-preview-count">{preview.messages?.length || 0} messages found</div>
              <div className="import-preview-msgs">
                {(preview.messages || []).slice(0, 6).map((m: any, i: number) => (
                  <div key={i} className={`import-msg ${m.role}`}>
                    <span className="import-msg-role">{m.role === 'user' ? 'You' : 'AI'}</span>
                    <span className="import-msg-text">{m.content.slice(0, 150)}{m.content.length > 150 ? '...' : ''}</span>
                  </div>
                ))}
                {(preview.messages || []).length > 6 && (
                  <div className="import-more">+{preview.messages.length - 6} more messages</div>
                )}
              </div>
              <button className="import-save-btn" onClick={handleImport} disabled={loading}>
                {loading ? <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Importing...</> : `Import ${preview.messages?.length || 0} messages`}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════
// SIDE PANEL WITH DELETE
// ═══════════════════════════════════════════

function SidePanel({ open, onClose, onLoadEntry, onDeleteEntry }: { open: boolean; onClose: () => void; onLoadEntry: (id: string) => void; onDeleteEntry: (id: string) => void }) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => { if (open) { setLoaded(false); loadEntries(); setConfirmDelete(null) } }, [open])
  const loadEntries = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/entries')
      if (r.ok) { const d = await r.json(); setEntries(d.entries || []) }
    } catch {}
    setLoading(false)
    requestAnimationFrame(() => { requestAnimationFrame(() => setLoaded(true)) })
  }

  const doDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id))
        setConfirmDelete(null)
        onDeleteEntry(id)
      }
    } catch {}
  }

  const grouped: Record<string, any[]> = {}
  const uncategorized: any[] = []
  for (const e of entries) { if (e.folder_name) { if (!grouped[e.folder_name]) grouped[e.folder_name] = []; grouped[e.folder_name].push(e) } else { uncategorized.push(e) } }

  return (
    <>
      <div className={`panel-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`panel ${open ? 'open' : ''}`}>
        <div className="p-head">
          <span className="p-title">Your Notebook</span>
          <button className="p-close" onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
        <div className={`p-body ${!loading && loaded ? 'p-loaded' : ''}`}>
          {loading && <div className="p-loading"><div className="thinking"><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div></div>}
          {!loading && entries.length === 0 && <div className="p-empty">No entries yet. Start writing.</div>}
          {!loading && entries.length > 0 && (
            <div className="p-entries">
              {Object.entries(grouped).map(([folder, ents]) => (
                <div key={folder} className="fgrp">
                  <div className="fname"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>{folder}</div>
                  {ents.map(e => <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} onDelete={() => confirmDelete === e.id ? doDelete(e.id) : setConfirmDelete(e.id)} confirming={confirmDelete === e.id} />)}
                </div>
              ))}
              {uncategorized.length > 0 && <div className="fgrp"><div className="fname">Uncategorized</div>{uncategorized.map(e => <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} onDelete={() => confirmDelete === e.id ? doDelete(e.id) : setConfirmDelete(e.id)} confirming={confirmDelete === e.id} />)}</div>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function EntryCard({ entry, onClick, onDelete, confirming }: { entry: any; onClick: () => void; onDelete: () => void; confirming: boolean }) {
  const date = new Date(entry.created_at || entry.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const tags = [...(entry.emotion_tags || []).slice(0, 2), ...(entry.topic_tags || []).slice(0, 2)]
  return (
    <div className="ecard">
      <div className="ecard-main" onClick={onClick}>
        <div className="ecard-t">{entry.title || 'Untitled'}</div>
        <div className="ecard-meta"><span className="ecard-date">{date}</span>{tags.map((t: string, i: number) => <span key={i} className="tag">{t}</span>)}</div>
      </div>
      <button className={`ecard-del ${confirming ? 'confirming' : ''}`} onClick={(e) => { e.stopPropagation(); onDelete() }} title={confirming ? 'Tap again to confirm' : 'Delete entry'}>
        {confirming
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════
// INLINE IMAGE — resizable, floatable
// ═══════════════════════════════════════════

function InlineImage({ item, onResize, onChangeFloat, onRemove }: { 
  item: StreamItem
  onResize: (width: number) => void
  onChangeFloat: (float: 'none' | 'left' | 'right') => void
  onRemove: () => void
}) {
  const [showControls, setShowControls] = useState(false)
  const [resizing, setResizing] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const width = item.imageWidth || 50
  const float = item.imageFloat || 'none'

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width

    const handleMouseMove = (e: MouseEvent) => {
      const containerWidth = imgRef.current?.parentElement?.offsetWidth || 680
      const deltaX = e.clientX - startXRef.current
      const deltaPercent = (deltaX / containerWidth) * 100
      const newWidth = Math.max(15, Math.min(100, startWidthRef.current + deltaPercent))
      onResize(Math.round(newWidth))
    }

    const handleMouseUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Touch support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    setResizing(true)
    startXRef.current = e.touches[0].clientX
    startWidthRef.current = width

    const handleTouchMove = (e: TouchEvent) => {
      const containerWidth = imgRef.current?.parentElement?.offsetWidth || 680
      const deltaX = e.touches[0].clientX - startXRef.current
      const deltaPercent = (deltaX / containerWidth) * 100
      const newWidth = Math.max(15, Math.min(100, startWidthRef.current + deltaPercent))
      onResize(Math.round(newWidth))
    }

    const handleTouchEnd = () => {
      setResizing(false)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }

    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)
  }

  const floatClass = float === 'left' ? 'img-float-left' : float === 'right' ? 'img-float-right' : 'img-float-none'

  return (
    <div
      ref={imgRef}
      className={`si-image ${floatClass} ${resizing ? 'resizing' : ''}`}
      style={{ width: `${width}%` }}
      onClick={e => { e.stopPropagation(); setShowControls(!showControls) }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => { if (!resizing) setShowControls(false) }}
    >
      <img src={item.imageUrl} alt="" draggable={false} />
      
      {/* Resize handle */}
      <div
        className="img-resize-handle"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      />

      {/* Controls overlay */}
      <div className={`img-controls ${showControls ? 'visible' : ''}`}>
        <button
          className={`img-ctrl-btn ${float === 'left' ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); onChangeFloat(float === 'left' ? 'none' : 'left') }}
          title="Float left (text wraps right)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="8" height="8" rx="1" /><line x1="14" y1="4" x2="22" y2="4" /><line x1="14" y1="8" x2="22" y2="8" /><line x1="2" y1="16" x2="22" y2="16" /><line x1="2" y1="20" x2="22" y2="20" /></svg>
        </button>
        <button
          className={`img-ctrl-btn ${float === 'none' ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); onChangeFloat('none') }}
          title="Center (no text wrap)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="8" rx="1" /><line x1="2" y1="16" x2="22" y2="16" /><line x1="2" y1="20" x2="22" y2="20" /></svg>
        </button>
        <button
          className={`img-ctrl-btn ${float === 'right' ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); onChangeFloat(float === 'right' ? 'none' : 'right') }}
          title="Float right (text wraps left)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="14" y="3" width="8" height="8" rx="1" /><line x1="2" y1="4" x2="10" y2="4" /><line x1="2" y1="8" x2="10" y2="8" /><line x1="2" y1="16" x2="22" y2="16" /><line x1="2" y1="20" x2="22" y2="20" /></svg>
        </button>
        <div className="img-ctrl-divider" />
        <button
          className="img-ctrl-btn img-ctrl-delete"
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remove image"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// EDITABLE WRITING BLOCK
// ═══════════════════════════════════════════

function WritingBlock({ item, onEdit, onClick }: { item: StreamItem; onEdit: (newContent: string) => void; onClick?: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const lastContentRef = useRef(item.content)

  // Sync content from props only when not editing
  useEffect(() => {
    if (!editing && ref.current && ref.current.textContent !== item.content) {
      ref.current.textContent = item.content
    }
    lastContentRef.current = item.content
  }, [item.content, editing])

  const handleBlur = () => {
    setEditing(false)
    const text = ref.current?.textContent || ''
    if (text !== lastContentRef.current) {
      onEdit(text)
    }
  }

  const handleInput = () => {
    if (!editing) setEditing(true)
  }

  return (
    <div
      ref={ref}
      className="si-writing-editable"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={handleInput}
      onBlur={handleBlur}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: item.content }}
    />
  )
}

// ═══════════════════════════════════════════
// MAIN APP — JOURNAL CANVAS
// ═══════════════════════════════════════════

export default function Home() {
  const [state, setState] = useState<AppState>({
    authed: false, loading: true, entryId: null, stream: [],
    busy: false, greetingVisible: true, greeting: '',
    recentEntryId: null, recentEntryTopic: null,
    continuationChecked: false, panelOpen: false,
    theme: 'light', error: null, entryTitle: null,
    model: typeof window !== 'undefined' ? (localStorage.getItem('sn-model') || 'claude-haiku-4.5') : 'claude-haiku-4.5',
    models: [],
    modelPickerOpen: false,
    streamFadeMs: 0,
    importOpen: false,
  })

  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentRef = useRef('')
  const allTextRef = useRef('')
  const busyRef = useRef(false)
  const streamEndRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<StreamItem[]>([])
  const entryIdRef = useRef<string | null>(null)
  const queueRef = useRef<Array<{ text: string; userRequested: boolean; insertIdx: number; writingUid: string }>>([])
  const processingRef = useRef(false)
  const continuationCheckedRef = useRef(false)
  const modelRef = useRef(typeof window !== 'undefined' ? (localStorage.getItem('sn-model') || 'claude-haiku-4.5') : 'claude-haiku-4.5')
  const exitingRef = useRef(false)

  const s = useCallback((update: Partial<AppState> | ((prev: AppState) => AppState)) => {
    if (typeof update === 'function') setState(update)
    else setState(prev => ({ ...prev, ...update }))
  }, [])

  // Keep refs in sync
  useEffect(() => { busyRef.current = state.busy }, [state.busy])
  useEffect(() => { streamRef.current = state.stream }, [state.stream])
  useEffect(() => { entryIdRef.current = state.entryId }, [state.entryId])
  useEffect(() => { continuationCheckedRef.current = state.continuationChecked }, [state.continuationChecked])
  useEffect(() => { modelRef.current = state.model }, [state.model])

  // ─── Theme — follows system preference ───
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (dark: boolean) => {
      if (dark) {
        document.documentElement.setAttribute('data-theme', 'dark')
        s({ theme: 'dark' })
      } else {
        document.documentElement.removeAttribute('data-theme')
        s({ theme: 'light' })
      }
    }
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [s])

  // ─── Auth ───
  useEffect(() => { checkAuth() }, [])

  const loadModels = async () => {
    try {
      const res = await fetch('/api/models')
      if (res.ok) {
        const data = await res.json()
        s({ models: data.models || [] })
      }
    } catch {}
  }

  const checkAuth = async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Boise'
      const res = await fetch(`/api/init?tz=${encodeURIComponent(tz)}`)
      if (res.ok) {
        const data = await res.json()
        s({ authed: true, loading: false, greeting: data.greeting || 'Write something.', recentEntryId: data.recentEntryId, recentEntryTopic: data.recentEntryTopic })
        loadModels()
      } else if (res.status === 401) {
        s({ authed: false, loading: false })
      } else {
        s({ authed: true, loading: false, greeting: 'Hey. Write something.' })
        loadModels()
      }
    } catch { s({ authed: false, loading: false, error: 'Failed to connect' }) }
  }

  const onLogin = async () => { s({ loading: true }); await checkAuth() }

  const setModel = (id: string) => {
    s({ model: id, modelPickerOpen: false })
    localStorage.setItem('sn-model', id)
  }

  const scrollToBottom = () => { setTimeout(() => streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80) }

  const focusInput = useCallback(() => {
    if (state.greetingVisible) s({ greetingVisible: false })
    if (state.modelPickerOpen) s({ modelPickerOpen: false })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [state.greetingVisible, state.modelPickerOpen, s])

  // ─── New entry — with exit animation ───
  const newEntry = () => {
    if (streamRef.current.length === 0) {
      s({ entryId: null, stream: [], continuationChecked: false, greetingVisible: false, error: null, entryTitle: null, streamFadeMs: 0 })
      lastSentRef.current = ''
      allTextRef.current = ''
      queueRef.current = []
      continuationCheckedRef.current = false
      setInput('')
      setTimeout(() => inputRef.current?.focus(), 100)
      return
    }

    exitingRef.current = true
    s(prev => ({
      ...prev,
      stream: prev.stream.map((item, i) => ({
        ...item,
        exiting: true,
        exitDelay: i * 25,
      })),
    }))

    const lastItemDelay = Math.min((streamRef.current.length - 1) * 25, 350)
    const duration = lastItemDelay + 450 + 100
    setTimeout(() => {
      exitingRef.current = false
      s({ entryId: null, stream: [], continuationChecked: false, greetingVisible: false, error: null, entryTitle: null, streamFadeMs: 0 })
      lastSentRef.current = ''
      allTextRef.current = ''
      queueRef.current = []
      continuationCheckedRef.current = false
      setInput('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }, duration)
  }

  const onDeleteEntry = (id: string) => {
    if (state.entryId === id) newEntry()
  }

  // ─── Handle writing block edits ───
  const handleWritingEdit = (itemUid: string, newContent: string) => {
    s(prev => {
      const newStream = prev.stream.map(item => {
        if (item.uid === itemUid && item.type === 'writing') {
          const wasProcessed = item.originalContent != null
          const isChanged = wasProcessed && newContent !== item.originalContent
          return { ...item, content: newContent, editedSinceProcess: isChanged }
        }
        // Mark linked AI responses as stale
        if (item.sourceUid === itemUid && (item.type === 'ai-annotation' || item.type === 'ai-conversational')) {
          const sourceItem = prev.stream.find(s => s.uid === itemUid)
          if (sourceItem && sourceItem.originalContent != null && newContent !== sourceItem.originalContent) {
            return { ...item, editedSinceProcess: true }
          }
        }
        return item
      })
      return { ...prev, stream: newStream }
    })
  }

  // ─── Redo: reprocess a writing block with the AI ───
  const handleRedo = (sourceUid: string) => {
    const sourceItem = streamRef.current.find(i => i.uid === sourceUid)
    if (!sourceItem || sourceItem.type !== 'writing') return

    // Remove old AI responses for this source
    s(prev => ({
      ...prev,
      stream: prev.stream.filter(item => item.sourceUid !== sourceUid),
    }))

    // Re-enqueue with updated content
    const text = sourceItem.content
    const insertIdx = streamRef.current.findIndex(i => i.uid === sourceUid)

    // Update original content to match current
    s(prev => ({
      ...prev,
      stream: prev.stream.map(item => 
        item.uid === sourceUid 
          ? { ...item, originalContent: text, editedSinceProcess: false, processing: true }
          : item
      ),
    }))

    queueRef.current.push({ text, userRequested: true, insertIdx, writingUid: sourceUid })
    processQueue()
  }

  // ─── Image upload handler ───
  const uploadImage = async (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string

      // Add image to stream immediately with base64 data URL
      const imageItem: StreamItem = {
        uid: uid(),
        type: 'image',
        content: '',
        imageUrl: base64,
        imageWidth: 50,
        imageFloat: 'none',
        animating: true,
        isNew: true,
      }

      s(prev => ({
        ...prev,
        stream: [...prev.stream, imageItem],
        greetingVisible: false,
      }))
      scrollToBottom()

      // Upload to server in background
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            filename: file.name,
            contentType: file.type,
          }),
        })
        const data = await res.json()
        if (data.url && data.url !== base64) {
          // Replace base64 with server URL
          s(prev => ({
            ...prev,
            stream: prev.stream.map(item =>
              item.uid === imageItem.uid ? { ...item, imageUrl: data.url } : item
            ),
          }))
        }
      } catch {
        // Keep base64 URL if upload fails — it still works
      }
    }
    reader.readAsDataURL(file)
  }

  // ─── Handle image resize ───
  const handleImageResize = (itemUid: string, width: number) => {
    s(prev => ({
      ...prev,
      stream: prev.stream.map(item =>
        item.uid === itemUid ? { ...item, imageWidth: width } : item
      ),
    }))
  }

  // ─── Handle image float change ───
  const handleImageFloat = (itemUid: string, float: 'none' | 'left' | 'right') => {
    s(prev => ({
      ...prev,
      stream: prev.stream.map(item =>
        item.uid === itemUid ? { ...item, imageFloat: float } : item
      ),
    }))
  }

  // ─── Handle image remove ───
  const handleImageRemove = (itemUid: string) => {
    s(prev => ({
      ...prev,
      stream: prev.stream.filter(item => item.uid !== itemUid),
    }))
  }

  // ─── Load entry — MERGE into current thread, don't replace ───
  const loadEntry = async (entryId: string, isMerge?: boolean) => {
    try {
      const res = await fetch(`/api/entries/${entryId}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.entry) return

      const items: StreamItem[] = (data.messages || []).map((m: any, idx: number) => {
        const itemUid = uid()
        return {
          uid: itemUid,
          id: m.id,
          type: m.sender === 'user' ? 'writing' as const : m.message_type === 'annotation' ? 'ai-annotation' as const : 'ai-conversational' as const,
          content: m.content,
          tone: m.tone,
          linked_entry_id: m.linked_entry_id,
          tool_call: m.tool_call,
          animating: true,
          waveDelay: idx * 80,
          originalContent: m.sender === 'user' ? m.content : undefined,
        }
      })

      // Link AI items to their preceding writing block
      let lastWritingUid: string | null = null
      for (const item of items) {
        if (item.type === 'writing') {
          lastWritingUid = item.uid
        } else if (lastWritingUid) {
          item.sourceUid = lastWritingUid
        }
      }

      if (isMerge && streamRef.current.length > 0) {
        const mergeHeader: StreamItem = {
          uid: uid(),
          type: 'merged-header',
          content: data.entry.title || 'Past Entry',
          mergedFrom: data.entry.title,
          animating: true,
          waveDelay: 0,
        }
        const mergedItems = items.map((item, i) => ({ ...item, waveDelay: (i + 1) * 80 }))
        s(prev => ({
          ...prev,
          stream: [mergeHeader, ...mergedItems, ...prev.stream],
          panelOpen: false,
          error: null,
          greetingVisible: false,
        }))
        setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, 100)
      } else {
        if (streamRef.current.length > 0) {
          exitingRef.current = true
          s(prev => ({
            ...prev,
            stream: prev.stream.map((item, i) => ({
              ...item,
              exiting: true,
              exitDelay: i * 25,
            })),
          }))
          const exitDuration = Math.min(streamRef.current.length * 25, 300) + 400
          await new Promise(resolve => setTimeout(resolve, exitDuration))
          exitingRef.current = false
        }

        allTextRef.current = items.filter(i => i.type === 'writing').map(i => i.content).join('\n\n')
        lastSentRef.current = allTextRef.current
        setInput('')
        const fadeDuration = items.length * 80 + 400
        s({
          entryId,
          stream: items,
          panelOpen: false,
          error: null,
          greetingVisible: false,
          entryTitle: data.entry.title || null,
          continuationChecked: true,
          streamFadeMs: fadeDuration,
        })

        const totalWaveDuration = items.length * 80 + 500
        setTimeout(() => {
          streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
          inputRef.current?.focus()
        }, totalWaveDuration)
      }
    } catch {}
  }

  // ─── Continuation check ───
  const checkContinuation = async (text: string) => {
    if (continuationCheckedRef.current || !text.trim()) return
    if (entryIdRef.current || streamRef.current.length > 0) {
      continuationCheckedRef.current = true
      s({ continuationChecked: true })
      return
    }
    continuationCheckedRef.current = true
    s({ continuationChecked: true })
    try {
      const res = await fetch('/api/continuation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model: modelRef.current }) })
      const data = await res.json()
      if (data.isContinuation && data.entryId) {
        const items: StreamItem[] = (data.messages || []).map((m: any) => {
          const itemUid = uid()
          return {
            uid: itemUid,
            id: m.id,
            type: m.sender === 'user' ? 'writing' as const : m.message_type === 'annotation' ? 'ai-annotation' as const : 'ai-conversational' as const,
            content: m.content, tone: m.tone, linked_entry_id: m.linked_entry_id, tool_call: m.tool_call,
            originalContent: m.sender === 'user' ? m.content : undefined,
          }
        })
        // Link AI items
        let lastWritingUid: string | null = null
        for (const item of items) {
          if (item.type === 'writing') lastWritingUid = item.uid
          else if (lastWritingUid) item.sourceUid = lastWritingUid
        }
        allTextRef.current = items.filter(i => i.type === 'writing').map(i => i.content).join('\n\n')
        lastSentRef.current = allTextRef.current
        s({ entryId: data.entryId, stream: items, entryTitle: data.entry?.title || null })
        scrollToBottom()
      }
    } catch {}
  }

  // ═══════════════════════════════════════════
  // NON-BLOCKING SEND QUEUE
  // ═══════════════════════════════════════════

  const enqueueMessage = (text: string, userRequested: boolean) => {
    if (!text.trim()) return

    const isFirstMessage = !entryIdRef.current && streamRef.current.length === 0
    const forceResponse = userRequested || isFirstMessage

    if (!continuationCheckedRef.current) {
      continuationCheckedRef.current = true
      s({ continuationChecked: true })
    }

    const writingUid = uid()
    const writingItem: StreamItem = { uid: writingUid, type: 'writing', content: text, originalContent: text, processing: true }

    const insertIdx = streamRef.current.length
    queueRef.current.push({ text, userRequested: forceResponse, insertIdx, writingUid })

    s(prev => ({
      ...prev,
      stream: [...prev.stream, writingItem],
      error: null,
    }))

    allTextRef.current = (allTextRef.current ? allTextRef.current + '\n\n' : '') + text
    setInput('')
    scrollToBottom()

    processQueue()
  }

  const processQueue = async () => {
    if (processingRef.current) return
    processingRef.current = true
    s({ busy: true })

    while (queueRef.current.length > 0) {
      const job = queueRef.current.shift()!
      await processOneMessage(job.text, job.userRequested, job.insertIdx, job.writingUid)
    }

    processingRef.current = false
    s({ busy: false })
  }

  const processOneMessage = async (text: string, userRequested: boolean, originalInsertIdx: number, writingUid: string) => {
    try {
      const currentStream = streamRef.current
      const recentContext = currentStream.slice(-15).map(i => ({
        sender: i.type === 'writing' ? 'user' : 'ai',
        content: i.content,
        type: i.type === 'writing' ? 'user_message' : i.type === 'ai-annotation' ? 'annotation' : 'conversational',
      }))

      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          entryId: entryIdRef.current,
          sessionMessages: recentContext,
          userRequestedResponse: userRequested,
          model: modelRef.current,
        }),
      })

      // Mark writing block as done processing
      s(prev => ({
        ...prev,
        stream: prev.stream.map(item =>
          item.uid === writingUid ? { ...item, processing: false } : item
        ),
      }))

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Something went wrong' }))
        s({ error: err.error || 'Something went wrong' })
        return
      }

      const data = await res.json()

      const aiItems: StreamItem[] = (data.responses || []).filter((r: any) => r.content?.trim()).map((r: any) => ({
        uid: uid(),
        id: r.id,
        type: r.type === 'annotation' ? 'ai-annotation' as const : 'ai-conversational' as const,
        content: r.content,
        tone: r.tone,
        linked_entry_id: r.linked_entry_id,
        animating: true,
        isNew: true,
        sourceUid: writingUid,
      }))

      if (data.toolCall && aiItems.length > 0) {
        aiItems[aiItems.length - 1].tool_call = data.toolCall
      } else if (data.toolCall && aiItems.length === 0) {
        aiItems.push({ uid: uid(), type: 'ai-annotation', content: '', tool_call: data.toolCall, animating: true, isNew: true, sourceUid: writingUid })
      }

      if (aiItems.length > 0) {
        s(prev => {
          const newStream = [...prev.stream]
          // Find the writing block by uid
          const writingIdx = newStream.findIndex(i => i.uid === writingUid)
          let insertAt = writingIdx >= 0 ? writingIdx + 1 : newStream.length

          // Skip past any existing AI items for this writing block
          while (insertAt < newStream.length && newStream[insertAt]?.sourceUid === writingUid) {
            insertAt++
          }

          newStream.splice(insertAt, 0, ...aiItems)
          return {
            ...prev,
            entryId: data.entryId,
            entryTitle: data.entryTitle || prev.entryTitle,
            stream: newStream,
          }
        })
        scrollToBottom()
      } else {
        s(prev => ({
          ...prev,
          entryId: data.entryId,
          entryTitle: data.entryTitle || prev.entryTitle,
        }))
      }

      lastSentRef.current = allTextRef.current

      if (data.toolCall?.type === 'load_entry' && data.toolCall?.data?.entry_id) {
        setTimeout(() => loadEntry(data.toolCall.data.entry_id, true), 400)
      }
    } catch {
      s({ error: 'Network error — check your connection' })
      // Clear processing state on error
      s(prev => ({
        ...prev,
        stream: prev.stream.map(item =>
          item.uid === writingUid ? { ...item, processing: false } : item
        ),
      }))
    }
  }

  // ═══════════════════════════════════════════
  // SMART AUTO-SEND
  // ═══════════════════════════════════════════

  const lastKeystrokeRef = useRef<number>(Date.now())
  const wordCountAtLastSendRef = useRef(0)

  const resetAutoTrigger = () => {
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null }
  }

  const startAutoTrigger = (text: string) => {
    resetAutoTrigger()
    if (!text.trim()) return
    lastKeystrokeRef.current = Date.now()

    const trimmed = text.trimEnd()
    const lastChar = trimmed.charAt(trimmed.length - 1)
    const endsSentence = ['.', '!', '?'].includes(lastChar)
    const wordCount = trimmed.split(/\s+/).length
    const wordsSinceLastSend = wordCount - wordCountAtLastSendRef.current

    let delay: number
    if (endsSentence && wordsSinceLastSend >= 8) {
      delay = 5000
    } else if (wordsSinceLastSend >= 20 && endsSentence) {
      delay = 8000
    } else if (wordsSinceLastSend >= 40) {
      delay = 12000
    } else {
      return
    }

    autoTimerRef.current = setTimeout(() => {
      const timeSinceLastKeystroke = Date.now() - lastKeystrokeRef.current
      if (timeSinceLastKeystroke < delay - 500) return

      const current = inputRef.current?.value?.trim() || ''
      if (current && !processingRef.current) {
        wordCountAtLastSendRef.current = current.split(/\s+/).length
        const isFirstMessage = !entryIdRef.current && streamRef.current.length === 0
        enqueueMessage(current, isFirstMessage)
      }
    }, delay)
  }

  // ─── Input change ───
  const onInputChange = (val: string) => {
    setInput(val)
    lastKeystrokeRef.current = Date.now()
    if (state.greetingVisible && val.trim()) s({ greetingVisible: false })
    if (!continuationCheckedRef.current && !entryIdRef.current && streamRef.current.length === 0 && val.trim().split(/\s+/).length >= 4) {
      checkContinuation(val.trim())
    }
    startAutoTrigger(val)
  }

  // ─── Manual send ───
  const manualSend = () => {
    resetAutoTrigger()
    const text = (inputRef.current?.value ?? '').trim() || input.trim()
    if (!text) return
    wordCountAtLastSendRef.current = 0
    enqueueMessage(text, true)
  }

  // ─── Auto-resize textarea ───
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 300) + 'px'
    }
  }, [input])

  // ─── Import callback ───
  const onImported = (entryId: string) => {
    loadEntry(entryId)
  }

  // ─── Render ───
  if (state.loading) {
    return (
      <>
        <div className="login-screen"><div className="thinking" style={{ justifyContent: 'center' }}><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div></div>
        <style jsx global>{styles}</style>
      </>
    )
  }

  if (!state.authed) return (
    <>
      <LoginScreen onLogin={onLogin} />
      <style jsx global>{styles}</style>
    </>
  )

  return (
    <div id="app" onClick={focusInput}>
      {/* Top Bar */}
      <div id="topbar" onClick={e => e.stopPropagation()}>
        <div className="topbar-left">
          <button className="tbtn" onClick={newEntry} title="New entry">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button className="tbtn" onClick={() => s({ importOpen: true })} title="Import conversation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
        </div>
        {state.entryTitle && <div className="topbar-title">{state.entryTitle}</div>}

        {state.busy && (
          <div className="topbar-thinking">
            <span className="t-dot-sm" /><span className="t-dot-sm" /><span className="t-dot-sm" />
          </div>
        )}

        <div className="topbar-right">
          <div className="model-picker-wrap" onClick={e => e.stopPropagation()}>
            <button className="tbtn model-btn" onClick={() => s({ modelPickerOpen: !state.modelPickerOpen })} title="Change AI model">
              <span className="model-badge">{(state.models.find(m => m.id === state.model) || { label: 'Haiku' }).label}</span>
            </button>
            {state.modelPickerOpen && (
              <div className="model-dropdown">
                {(() => {
                  const available = state.models.length > 0 ? state.models.filter(m => m.available) : []
                  const anthropicModels = available.filter(m => m.provider === 'anthropic')
                  const openaiModels = available.filter(m => m.provider === 'openai')

                  if (available.length === 0) {
                    return (
                      <>
                        <div className="model-group-label">Claude</div>
                        <button className={`model-opt ${state.model === 'claude-haiku-4.5' ? 'active' : ''}`} onClick={() => setModel('claude-haiku-4.5')}>
                          <span className="model-opt-label">Haiku 4.5</span>
                          {state.model === 'claude-haiku-4.5' && <span className="model-check">&#10003;</span>}
                        </button>
                        <button className={`model-opt ${state.model === 'claude-sonnet-4.5' ? 'active' : ''}`} onClick={() => setModel('claude-sonnet-4.5')}>
                          <span className="model-opt-label">Sonnet 4.5</span>
                          {state.model === 'claude-sonnet-4.5' && <span className="model-check">&#10003;</span>}
                        </button>
                        <div className="model-group-divider" />
                        <div className="model-group-label">GPT</div>
                        <button className={`model-opt ${state.model === 'gpt-5-mini' ? 'active' : ''}`} onClick={() => setModel('gpt-5-mini')}>
                          <span className="model-opt-label">GPT-5 Mini</span>
                          {state.model === 'gpt-5-mini' && <span className="model-check">&#10003;</span>}
                        </button>
                        <button className={`model-opt ${state.model === 'gpt-5.2' ? 'active' : ''}`} onClick={() => setModel('gpt-5.2')}>
                          <span className="model-opt-label">GPT-5.2</span>
                          {state.model === 'gpt-5.2' && <span className="model-check">&#10003;</span>}
                        </button>
                      </>
                    )
                  }

                  return (
                    <>
                      {anthropicModels.length > 0 && (
                        <>
                          <div className="model-group-label">Claude</div>
                          {anthropicModels.map(m => (
                            <button key={m.id} className={`model-opt ${state.model === m.id ? 'active' : ''}`} onClick={() => setModel(m.id)}>
                              <span className="model-opt-label">{m.label}</span>
                              {state.model === m.id && <span className="model-check">&#10003;</span>}
                            </button>
                          ))}
                        </>
                      )}
                      {anthropicModels.length > 0 && openaiModels.length > 0 && <div className="model-group-divider" />}
                      {openaiModels.length > 0 && (
                        <>
                          <div className="model-group-label">GPT</div>
                          {openaiModels.map(m => (
                            <button key={m.id} className={`model-opt ${state.model === m.id ? 'active' : ''}`} onClick={() => setModel(m.id)}>
                              <span className="model-opt-label">{m.label}</span>
                              {state.model === m.id && <span className="model-check">&#10003;</span>}
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
          <button className="tbtn" onClick={() => s({ panelOpen: true })} title="Browse entries">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div id="greeting-screen" className={!state.greetingVisible ? 'fading' : ''} style={!state.greetingVisible ? { pointerEvents: 'none' } : {}} onClick={focusInput}>
        <div className="greeting-text">{state.greeting}</div>
        {state.recentEntryId && state.recentEntryTopic && (
          <button className="greeting-continue" onClick={(e) => { e.stopPropagation(); loadEntry(state.recentEntryId!) }}>
            Continue: {state.recentEntryTopic}
          </button>
        )}
        <div className="greeting-hint">Tap anywhere to begin writing</div>
      </div>

      {/* Canvas */}
      <div id="canvas">
        <div id="stream" className={state.streamFadeMs > 0 ? 'stream-fade' : ''} style={state.streamFadeMs > 0 ? { animationDuration: `${state.streamFadeMs}ms` } as React.CSSProperties : undefined}>
          {state.stream.map((item, i) => {
            const waveStyle = item.animating && item.waveDelay != null
              ? { animationDelay: `${item.waveDelay}ms` } as React.CSSProperties
              : item.animating
              ? { animationDelay: `${Math.min(i * 40, 600)}ms` } as React.CSSProperties
              : {}

            const exitStyle = item.exiting
              ? { animationDelay: `${item.exitDelay || 0}ms` } as React.CSSProperties
              : {}

            const animClass = item.exiting ? 'stream-exit' : item.animating ? 'wave-in' : ''

            // Merged header
            if (item.type === 'merged-header') {
              return (
                <div key={item.uid} className={`si-merge-header ${animClass}`} style={item.exiting ? exitStyle : waveStyle}>
                  <div className="merge-line" />
                  <span className="merge-label">{item.content}</span>
                  <div className="merge-line" />
                </div>
              )
            }

            // Writing block — editable
            if (item.type === 'writing') {
              const hasAiResponse = state.stream.some(s => s.sourceUid === item.uid)
              const isProcessing = item.processing

              return (
                <div key={item.uid} className={`si-writing-wrap ${item.exiting ? 'stream-exit' : ''} ${item.animating ? (item.waveDelay != null ? 'wave-in' : '') : ''}`} style={item.exiting ? exitStyle : waveStyle}>
                  <WritingBlock
                    item={item}
                    onEdit={(newContent) => handleWritingEdit(item.uid, newContent)}
                    onClick={e => e.stopPropagation()}
                  />
                  {isProcessing && (
                    <div className="writing-processing">
                      <div className="processing-line" />
                    </div>
                  )}
                </div>
              )
            }

            // Image block
            if (item.type === 'image') {
              const imgAnimClass = item.exiting ? 'stream-exit' : item.animating ? (item.isNew ? 'si-inserting' : 'wave-in') : ''
              return (
                <div key={item.uid} className={`si-image-wrap ${imgAnimClass}`} onClick={e => e.stopPropagation()} style={item.exiting ? exitStyle : waveStyle}>
                  <InlineImage
                    item={item}
                    onResize={(w) => handleImageResize(item.uid, w)}
                    onChangeFloat={(f) => handleImageFloat(item.uid, f)}
                    onRemove={() => handleImageRemove(item.uid)}
                  />
                </div>
              )
            }

            // AI Annotation
            if (item.type === 'ai-annotation') {
              const aiAnimClass = item.exiting ? 'stream-exit' : item.animating ? (item.isNew ? 'si-inserting' : 'wave-in') : ''
              const sourceEdited = item.editedSinceProcess
              return (
                <div key={item.uid} className={`si-annotation ${aiAnimClass}`} onClick={e => e.stopPropagation()} style={item.exiting ? exitStyle : waveStyle}>
                  {/* Separator line that draws in */}
                  {item.isNew && <div className="ai-separator"><div className="ai-separator-line" /></div>}
                  <div className="anno-bar" />
                  <div className="anno-body">
                    {item.content && <div className="anno-text">{item.content}</div>}
                    {item.linked_entry_id && <span className="anno-link" onClick={() => loadEntry(item.linked_entry_id!, true)}>see related entry</span>}
                    {item.tool_call && <ToolRender toolCall={item.tool_call} messageId={item.id} onLoadEntry={(id) => loadEntry(id, true)} />}
                    {sourceEdited && item.sourceUid && (
                      <button className="redo-btn" onClick={() => handleRedo(item.sourceUid!)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                        <span>Reprocess</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            }

            // AI Conversational
            const convAnimClass = item.exiting ? 'stream-exit' : item.animating ? (item.isNew ? 'si-inserting' : 'wave-in') : ''
            const sourceEdited = item.editedSinceProcess
            return (
              <div key={item.uid} className={`si-conv ${convAnimClass}`} onClick={e => e.stopPropagation()} style={item.exiting ? exitStyle : waveStyle}>
                {item.isNew && <div className="ai-separator"><div className="ai-separator-line" /></div>}
                <div className="conv-text">{item.content}</div>
                {item.tool_call && <ToolRender toolCall={item.tool_call} messageId={item.id} onLoadEntry={(id) => loadEntry(id, true)} />}
                {sourceEdited && item.sourceUid && (
                  <button className="redo-btn" onClick={() => handleRedo(item.sourceUid!)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                    <span>Reprocess</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Live input — always at the bottom, NEVER disabled */}
        <div id="writing-input" onClick={e => e.stopPropagation()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
          onDragLeave={e => { e.currentTarget.classList.remove('drag-over') }}
          onDrop={e => {
            e.preventDefault()
            e.currentTarget.classList.remove('drag-over')
            const files = Array.from(e.dataTransfer.files)
            const imageFile = files.find(f => f.type.startsWith('image/'))
            if (imageFile) uploadImage(imageFile)
          }}
        >
          <textarea
            ref={inputRef}
            id="tinput"
            rows={1}
            placeholder={state.stream.length === 0 ? "Start writing..." : "Keep writing..."}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); manualSend() }
              if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); manualSend() }
            }}
            onPaste={e => {
              const items = Array.from(e.clipboardData?.items || [])
              const imageItem = items.find(item => item.type.startsWith('image/'))
              if (imageItem) {
                e.preventDefault()
                const file = imageItem.getAsFile()
                if (file) uploadImage(file)
              }
            }}
            autoFocus
          />
        </div>

        {/* Send hint */}
        {input.trim() && (
          <div id="send-hint" onClick={e => { e.stopPropagation(); manualSend() }}>
            <span className="send-hint-text">pause & reflect</span>
            <span className="send-hint-key">Ctrl+Enter</span>
          </div>
        )}

        <div ref={streamEndRef} />
      </div>

      {/* Error */}
      {state.error && (
        <div className="error-bar" onClick={e => e.stopPropagation()}>
          <span className="error-text">{state.error}</span>
          <button className="error-close" onClick={() => s({ error: null })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
      )}

      <SidePanel open={state.panelOpen} onClose={() => s({ panelOpen: false })} onLoadEntry={(id) => loadEntry(id)} onDeleteEntry={onDeleteEntry} />
      <ImportPanel open={state.importOpen} onClose={() => s({ importOpen: false })} onImported={onImported} />

      <style jsx global>{styles}</style>
    </div>
  )
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════

const styles = `
:root {
  --bg: #FAF7F2; --bg-secondary: #F3EDE4; --text: #2C2520; --text-muted: #8A7E74;
  --text-light: #B5AA9E; --accent: #C4775A; --accent-light: #E8C4B4; --accent-bg: #FDF5F0;
  --divider: #E4DDD3; --shadow: rgba(44,37,32,0.06); --shadow-md: rgba(44,37,32,0.1);
  --panel-bg: #FAF7F2; --panel-border: #E4DDD3; --input-bg: #FFFFFF; --input-border: #E4DDD3;
  --tag-bg: #F0EAE0; --tag-text: #8A7E74; --hover-bg: #F0EAE0; --error-bg: #c0392b;
  --annotation-border: #C4775A; --conv-bg: #F0EAE0;
}
[data-theme="dark"] {
  --bg: #1A1714; --bg-secondary: #242018; --text: #E8E0D6; --text-muted: #8A7E74;
  --text-light: #5A524A; --accent: #D4896B; --accent-light: #6B4A3A; --accent-bg: #2A2018;
  --divider: #3A342E; --shadow: rgba(0,0,0,0.2); --shadow-md: rgba(0,0,0,0.3);
  --panel-bg: #1A1714; --panel-border: #3A342E; --input-bg: #242018; --input-border: #3A342E;
  --tag-bg: #2A2520; --tag-text: #8A7E74; --hover-bg: #2A2520; --error-bg: #a93226;
  --annotation-border: #D4896B; --conv-bg: #252018;
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  font-family: 'Source Serif 4', Georgia, serif; font-size: 18px; line-height: 1.8;
  color: var(--text); background: var(--bg);
  transition: background 0.4s ease, color 0.4s ease;
  overflow-x: hidden; -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale; -webkit-tap-highlight-color: transparent;
}
#app { min-height: 100dvh; cursor: text; }

.spin { animation: spinAnim 0.8s linear infinite; }
@keyframes spinAnim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ═══ Login ═══ */
.login-screen {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: 24px; position: relative; overflow: hidden;
}
.login-bg-grain {
  position: absolute; inset: 0; opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
}
.login-card {
  width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center;
  background: var(--input-bg); border: 1px solid var(--divider); border-radius: 24px;
  padding: 48px 36px 40px; box-shadow: 0 8px 40px var(--shadow), 0 1px 3px var(--shadow);
  opacity: 0; animation: loginCardIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
}
@keyframes loginCardIn {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.login-lock {
  width: 56px; height: 56px; border-radius: 16px; background: var(--accent-bg);
  border: 1px solid var(--accent-light); display: flex; align-items: center; justify-content: center;
  color: var(--accent); margin-bottom: 24px;
}
.login-title {
  font-size: 1.4rem; font-weight: 400; color: var(--text); margin-bottom: 32px;
  letter-spacing: -0.01em;
}
.login-form {
  display: flex; flex-direction: column; gap: 0; width: 100%; position: relative;
}
.login-form.shake { animation: shakeForm 0.4s ease; }
@keyframes shakeForm {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(5px); }
}
.login-label {
  font-family: 'DM Sans', sans-serif; font-size: 0.72rem; font-weight: 500;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;
  margin-bottom: 8px; padding-left: 2px;
}
.login-input-wrap { position: relative; display: flex; align-items: center; margin-bottom: 12px; }
.login-input {
  width: 100%; border: 1px solid var(--input-border); border-radius: 14px;
  padding: 15px 44px 15px 16px; font-family: 'DM Sans', sans-serif; font-size: 16px;
  background: var(--bg); color: var(--text); outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.login-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(196,119,90,0.1); }
.login-input::placeholder { color: var(--text-light); }
.login-eye {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; color: var(--text-light);
  padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  transition: color 0.15s;
}
.login-eye:hover { color: var(--text-muted); }
.login-err {
  color: var(--error-bg); font-size: 0.78rem; margin-bottom: 12px;
  font-family: 'DM Sans', sans-serif; text-align: center; padding: 8px 12px;
  background: rgba(192,57,43,0.06); border-radius: 10px;
  animation: fadeUp 0.2s ease;
}
.login-btn {
  width: 100%; padding: 14px; border-radius: 14px; border: none;
  background: var(--accent); color: white; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 0.88rem; font-weight: 500;
  letter-spacing: 0.02em; display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: transform 0.15s, opacity 0.15s, background 0.2s;
}
.login-btn:hover { background: #b86a4f; transform: translateY(-1px); }
.login-btn:active { transform: translateY(0) scale(0.99); }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

/* ═══ Greeting ═══ */
#greeting-screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; background: var(--bg); padding: 24px; transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); cursor: text; }
#greeting-screen.fading { opacity: 0; transform: translateY(-16px) scale(0.98); pointer-events: none; }
.greeting-text { font-size: 1.45rem; font-weight: 300; color: var(--text); text-align: center; max-width: 480px; line-height: 1.5; opacity: 0; animation: fadeUp 0.9s ease 0.3s forwards; }
.greeting-continue { margin-top: 20px; font-family: 'DM Sans', sans-serif; font-size: 0.88rem; color: var(--text-muted); background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 10px; transition: color 0.2s, background 0.2s, transform 0.15s; opacity: 0; animation: fadeUp 0.7s ease 0.9s forwards; }
.greeting-continue:hover { color: var(--accent); background: var(--hover-bg); transform: translateY(-1px); }
.greeting-hint { margin-top: 48px; font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: var(--text-light); letter-spacing: 0.05em; opacity: 0; animation: fadeUp 0.6s ease 1.4s forwards; text-transform: uppercase; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* ═══ Top Bar ═══ */
#topbar { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; z-index: 100; padding-top: max(12px, env(safe-area-inset-top)); background: linear-gradient(to bottom, var(--bg) 60%, transparent); cursor: default; }
.topbar-left { display: flex; gap: 2px; align-items: center; }
.topbar-title { flex: 1; text-align: center; font-family: 'DM Sans', sans-serif; font-size: 0.7rem; color: var(--text-light); letter-spacing: 0.04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 8px; animation: titleFade 0.4s ease; }
@keyframes titleFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.topbar-right { display: flex; gap: 2px; align-items: center; }
.tbtn { background: none; border: none; cursor: pointer; color: var(--text-light); padding: 10px; border-radius: 10px; transition: all 0.25s; opacity: 0.4; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.tbtn:hover { opacity: 1; color: var(--text-muted); background: var(--hover-bg); }
.tbtn:active { opacity: 1; transform: scale(0.92); }

/* ═══ Model Picker ═══ */
.model-picker-wrap { position: relative; }
.model-btn { opacity: 0.5 !important; padding: 6px 10px !important; }
.model-btn:hover { opacity: 0.8 !important; }
.model-badge {
  font-family: 'DM Sans', sans-serif; font-size: 0.62rem; font-weight: 500;
  letter-spacing: 0.04em; color: var(--text-muted); background: var(--tag-bg);
  padding: 3px 8px; border-radius: 6px; white-space: nowrap;
}
.model-dropdown {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--panel-bg); border: 1px solid var(--divider); border-radius: 14px;
  padding: 6px; min-width: 180px; box-shadow: 0 12px 40px var(--shadow-md), 0 2px 8px var(--shadow);
  z-index: 150; animation: dropdownIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); transform-origin: top right;
}
@keyframes dropdownIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.model-group-label { font-family: 'DM Sans', sans-serif; font-size: 0.58rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-light); padding: 8px 10px 4px; }
.model-group-divider { height: 1px; background: var(--divider); margin: 4px 8px; }
.model-opt { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: none; background: none; cursor: pointer; border-radius: 10px; transition: background 0.15s, transform 0.1s; text-align: left; }
.model-opt:hover { background: var(--hover-bg); }
.model-opt:active { transform: scale(0.98); }
.model-opt.active { background: var(--accent-bg); }
.model-opt-label { font-family: 'DM Sans', sans-serif; font-size: 0.82rem; color: var(--text); flex: 1; }
.model-check { color: var(--accent); font-size: 0.72rem; font-weight: 600; }

/* ═══ Thinking Indicator ═══ */
.topbar-thinking {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; gap: 4px; align-items: center; padding: 4px 12px;
  border-radius: 20px; background: var(--bg-secondary); border: 1px solid var(--divider);
  animation: thinkFade 0.35s cubic-bezier(0.16, 1, 0.3, 1); z-index: 1;
}
.t-dot-sm { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); opacity: 0.3; animation: breathe 1.4s ease infinite; }
.t-dot-sm:nth-child(2) { animation-delay: 0.2s; }
.t-dot-sm:nth-child(3) { animation-delay: 0.4s; }
@keyframes thinkFade { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

/* ═══ Canvas ═══ */
#canvas { max-width: 680px; width: 100%; margin: 0 auto; padding: 64px 24px 120px; min-height: 100dvh; }
#stream { display: flex; flex-direction: column; gap: 0; }
#stream.stream-fade { animation: streamFadeIn ease both; }
@keyframes streamFadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }

/* ═══ Stream Items ═══ */

/* Writing block wrapper */
.si-writing-wrap { position: relative; }
.si-writing-wrap.wave-in { animation: waterfallIn 0.4s ease both; }
.si-writing-wrap.stream-exit { animation: streamExit 0.35s ease forwards; }

/* Editable writing block */
.si-writing-editable {
  padding: 0 0 4px; white-space: pre-wrap; word-break: break-word;
  outline: none; border: none; min-height: 1.8em;
  border-radius: 4px; margin: 0 -4px; padding-left: 4px; padding-right: 4px;
  transition: background 0.25s ease;
  caret-color: var(--accent);
}
.si-writing-editable:focus {
  background: var(--bg-secondary);
}

/* Processing indicator — animated line under writing block */
.writing-processing {
  height: 2px; margin: 4px 0 8px; overflow: hidden;
  animation: processingFadeIn 0.3s ease;
}
.processing-line {
  height: 100%; width: 100%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: processingSlide 1.8s ease-in-out infinite;
  border-radius: 1px;
}
@keyframes processingSlide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes processingFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* AI Separator line — draws in elegantly before response */
.ai-separator {
  margin: 6px 0 2px;
  overflow: hidden;
  height: 1px;
}
.ai-separator-line {
  height: 100%;
  background: var(--divider);
  animation: separatorDraw 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: left;
}
@keyframes separatorDraw {
  0% { transform: scaleX(0); opacity: 0; }
  30% { opacity: 0.5; }
  100% { transform: scaleX(1); opacity: 1; }
}

/* User writing — non-editable fallback (loaded from past) */
.si-writing { padding: 0 0 4px; white-space: pre-wrap; word-break: break-word; animation: fadeIn 0.15s ease; }
.si-writing.wave-in { animation: waterfallIn 0.4s ease both; }
.si-writing.stream-exit { animation: streamExit 0.35s ease forwards; }

/* Merged header */
.si-merge-header { display: flex; align-items: center; gap: 12px; margin: 20px 0 16px; cursor: default; }
.si-merge-header.wave-in { animation: waterfallIn 0.4s ease both; }
.si-merge-header.stream-exit { animation: streamExit 0.35s ease forwards; }
.merge-line { flex: 1; height: 1px; background: var(--divider); }
.merge-label { font-family: 'DM Sans', sans-serif; font-size: 0.65rem; color: var(--text-light); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; padding: 2px 0; }

/* AI Annotation */
.si-annotation { display: flex; gap: 0; margin: 8px 0 12px; cursor: default; }
.si-annotation.wave-in { animation: waterfallIn 0.4s ease both; }
.si-annotation:not(.si-inserting):not(.stream-exit):not(.wave-in) { animation: aiFade 0.4s ease; }
.si-annotation.stream-exit { animation: streamExit 0.35s ease forwards; }
.anno-bar { width: 3px; border-radius: 2px; background: var(--annotation-border); opacity: 0.5; flex-shrink: 0; }
.anno-body { padding: 4px 0 4px 14px; font-size: 0.84rem; color: var(--text-muted); line-height: 1.6; }
.anno-text { white-space: pre-wrap; word-break: break-word; }
.anno-link { font-family: 'DM Sans', sans-serif; font-size: 0.68rem; color: var(--accent); cursor: pointer; margin-top: 4px; display: inline-block; text-decoration: underline; text-underline-offset: 2px; opacity: 0.8; }
.anno-link:hover { opacity: 1; }

/* AI Conversational */
.si-conv { margin: 10px 0 14px; padding: 14px 18px; background: var(--conv-bg); border-radius: 12px; cursor: default; font-size: 0.92rem; line-height: 1.65; }
.si-conv.wave-in { animation: waterfallIn 0.4s ease both; }
.si-conv:not(.si-inserting):not(.stream-exit):not(.wave-in) { animation: aiFade 0.4s ease; }
.si-conv.stream-exit { animation: streamExit 0.35s ease forwards; }

/* ═══ Insertion Animation — AI slides in with height reveal ═══ */
.si-inserting {
  animation: insertReveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: top;
}

@keyframes insertReveal {
  0% {
    opacity: 0;
    max-height: 0;
    margin-top: 0;
    margin-bottom: 0;
    padding-top: 0;
    padding-bottom: 0;
    transform: translateY(-8px);
    overflow: hidden;
  }
  40% {
    opacity: 0.3;
    max-height: 200px;
    overflow: hidden;
  }
  70% {
    opacity: 0.7;
    max-height: 600px;
  }
  100% {
    opacity: 1;
    max-height: 2000px;
    transform: translateY(0);
  }
}

/* ═══ Redo Button ═══ */
.redo-btn {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 8px; padding: 4px 10px;
  background: var(--accent-bg); border: 1px solid var(--accent-light);
  border-radius: 8px; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 0.68rem;
  color: var(--accent); letter-spacing: 0.02em;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  animation: redoAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.redo-btn:hover {
  background: var(--accent); color: white; border-color: var(--accent);
  transform: translateY(-1px); box-shadow: 0 2px 8px rgba(196,119,90,0.2);
}
.redo-btn:active { transform: scale(0.96); }
.redo-btn svg { flex-shrink: 0; }
@keyframes redoAppear {
  from { opacity: 0; transform: translateY(4px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ═══ Waterfall & Exit Animations ═══ */
@keyframes waterfallIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes streamExit {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

.conv-text { white-space: pre-wrap; word-break: break-word; }

/* ═══ Writing Input ═══ */
#writing-input { margin-top: 2px; cursor: text; }
#tinput {
  width: 100%; border: none; outline: none; background: transparent;
  font-family: 'Source Serif 4', Georgia, serif; font-size: inherit;
  color: var(--text); line-height: 1.8; resize: none;
  min-height: 48px; max-height: 300px; overflow-y: auto;
  caret-color: var(--accent);
}
#tinput::placeholder { color: var(--text-light); opacity: 0.35; font-style: italic; }

/* ═══ Thinking ═══ */
.thinking { display: flex; gap: 5px; padding: 8px 2px; }
.t-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: 0.25; animation: breathe 1.4s ease infinite; }
.t-dot:nth-child(2) { animation-delay: 0.2s; }
.t-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes breathe { 0%,100% { opacity: 0.15; transform: scale(0.8); } 50% { opacity: 0.55; transform: scale(1.15); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes aiFade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }

/* ═══ Send Hint ═══ */
#send-hint {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 16px; padding: 12px 20px;
  cursor: pointer; border-radius: 10px;
  background: var(--hover-bg); border: 1px solid var(--divider);
  transition: all 0.25s; opacity: 0.4;
  -webkit-tap-highlight-color: transparent;
}
#send-hint:hover { opacity: 0.7; background: var(--accent-bg); border-color: var(--accent-light); }
#send-hint:active { transform: scale(0.98); opacity: 1; }
.send-hint-text { font-family: 'DM Sans', sans-serif; font-size: 0.7rem; color: var(--text-muted); letter-spacing: 0.04em; }
.send-hint-key { font-family: 'DM Sans', sans-serif; font-size: 0.6rem; color: var(--text-light); background: var(--bg-secondary); padding: 2px 7px; border-radius: 4px; }

/* ═══ Error ═══ */
.error-bar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--error-bg); color: white; padding: 12px 18px; border-radius: 14px; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; z-index: 60; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.2); animation: errorSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); max-width: calc(100vw - 32px); cursor: default; }
@keyframes errorSlideIn { from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.95); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
.error-text { flex: 1; line-height: 1.4; }
.error-close { background: none; border: none; color: white; cursor: pointer; opacity: 0.7; display: flex; align-items: center; justify-content: center; padding: 4px; }
.error-close:hover { opacity: 1; }

/* ═══ Tools ═══ */
.tool-box { padding: 10px 0 0; }
.tool-head { font-family: 'DM Sans', sans-serif; font-size: 0.72rem; font-weight: 500; color: var(--text-muted); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.tool-chart { max-height: 220px; width: 100%; }
.tool-tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.tool-tbl { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.tool-tbl th { font-family: 'DM Sans', sans-serif; font-weight: 500; text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--divider); color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.tool-tbl td { padding: 8px 10px; border-bottom: 1px solid var(--divider); }
.tool-cl { list-style: none; }
.tool-cl li { display: flex; align-items: center; gap: 10px; padding: 7px 0; cursor: pointer; transition: opacity 0.15s; }
.cl-icon { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--divider); display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; color: transparent; }
.tool-cl li.done .cl-icon { background: var(--accent); border-color: var(--accent); color: #fff; }
.tool-cl li.done .cl-txt { text-decoration: line-through; color: var(--text-muted); }
.cl-txt { font-size: 0.9rem; }
.tool-prompt { background: var(--accent-bg); border: 1px solid var(--accent-light); border-radius: 12px; padding: 14px 18px; font-style: italic; color: var(--text-muted); font-size: 0.92rem; }
.tool-tracker { display: flex; gap: 8px; flex-wrap: wrap; }
.tr-metric { width: 100%; font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
.tr-pt { background: var(--tag-bg); border-radius: 10px; padding: 6px 14px; font-family: 'DM Sans', sans-serif; font-size: 0.78rem; color: var(--text-muted); display: flex; align-items: baseline; gap: 4px; }
.tr-val { font-weight: 600; color: var(--accent); font-size: 0.88rem; }
.tr-unit { opacity: 0.7; font-size: 0.7rem; }
.tr-date { opacity: 0.5; font-size: 0.62rem; margin-left: 4px; }
.tool-link-card { background: var(--accent-bg); border: 1px solid var(--accent-light); border-radius: 12px; padding: 12px 16px; cursor: pointer; transition: transform 0.15s; }
.tool-link-card:active { transform: scale(0.98); }
.tool-calendar { font-family: 'DM Sans', sans-serif; font-size: 0.84rem; }
.cal-event { padding: 5px 0; display: flex; gap: 10px; align-items: baseline; border-bottom: 1px solid var(--divider); }
.cal-event:last-child { border-bottom: none; }
.cal-date { color: var(--accent); font-weight: 500; font-size: 0.78rem; white-space: nowrap; }
.cal-title { color: var(--text-muted); }

/* ═══ Panel ═══ */
.panel-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.18); z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.panel-bg.open { opacity: 1; pointer-events: all; }
.panel { position: fixed; top: 0; right: -420px; width: 380px; max-width: 90vw; height: 100dvh; background: var(--panel-bg); border-left: 1px solid var(--panel-border); z-index: 201; transition: right 0.45s cubic-bezier(0.16,1,0.3,1); overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; cursor: default; }
.panel.open { right: 0; }
.p-head { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 16px; padding-top: max(20px, env(safe-area-inset-top)); border-bottom: 1px solid var(--divider); flex-shrink: 0; }
.p-title { font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.p-close { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 8px; border-radius: 8px; transition: background 0.15s; display: flex; align-items: center; justify-content: center; }
.p-close:hover { background: var(--hover-bg); }
.p-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.p-entries { opacity: 0; transform: translateY(6px); transition: opacity 0.35s ease, transform 0.35s ease; }
.p-loaded .p-entries { opacity: 1; transform: translateY(0); }
.p-loading { padding: 40px 0; display: flex; justify-content: center; animation: fadeIn 0.2s ease; }
.p-empty { color: var(--text-light); font-size: 0.88rem; padding: 40px 0; text-align: center; line-height: 1.6; opacity: 0; animation: fadeUp 0.4s ease 0.1s forwards; }
.fgrp { margin-bottom: 20px; }
.fname { font-family: 'DM Sans', sans-serif; font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-light); margin-bottom: 6px; padding-left: 4px; display: flex; align-items: center; gap: 6px; }
.ecard { display: flex; align-items: center; border-radius: 12px; transition: background 0.2s, transform 0.15s; margin-bottom: 2px; }
.ecard:hover { background: var(--hover-bg); transform: translateX(2px); }
.ecard-main { flex: 1; padding: 12px 8px 12px 14px; cursor: pointer; min-width: 0; }
.ecard-t { font-size: 0.92rem; color: var(--text); margin-bottom: 3px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ecard-meta { font-family: 'DM Sans', sans-serif; font-size: 0.68rem; color: var(--text-light); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ecard-date { white-space: nowrap; }
.tag { font-family: 'DM Sans', sans-serif; font-size: 0.6rem; background: var(--tag-bg); color: var(--tag-text); padding: 2px 9px; border-radius: 10px; white-space: nowrap; }
.ecard-del { background: none; border: none; cursor: pointer; color: var(--text-light); padding: 10px; border-radius: 8px; opacity: 0.3; transition: all 0.2s; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.ecard-del:hover { opacity: 0.7; color: var(--error-bg); }
.ecard-del.confirming { opacity: 1; color: var(--error-bg); background: rgba(192,57,43,0.1); }

/* ═══ Inline Image ═══ */
.si-image-wrap { margin: 8px 0; clear: both; }
.si-image-wrap::after { content: ''; display: table; clear: both; }
.si-image {
  position: relative; border-radius: 8px; overflow: visible;
  cursor: default; transition: box-shadow 0.25s ease;
  margin: 0 auto;
}
.si-image:hover { box-shadow: 0 2px 16px var(--shadow-md); }
.si-image.resizing { user-select: none; }
.si-image img {
  width: 100%; height: auto; display: block; border-radius: 8px;
  pointer-events: none; transition: border-radius 0.2s;
}

/* Float positioning */
.si-image.img-float-none { display: block; margin: 0 auto; }
.si-image.img-float-left { float: left; margin: 0 16px 8px 0; }
.si-image.img-float-right { float: right; margin: 0 0 8px 16px; }

/* Resize handle */
.img-resize-handle {
  position: absolute; right: -4px; top: 0; bottom: 0; width: 10px;
  cursor: ew-resize; background: transparent;
  transition: background 0.2s;
}
.img-resize-handle:hover, .si-image.resizing .img-resize-handle {
  background: linear-gradient(90deg, transparent, var(--accent) 40%, var(--accent) 60%, transparent);
  opacity: 0.5; border-radius: 4px;
}

/* Controls overlay */
.img-controls {
  position: absolute; top: -36px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 2px; padding: 4px;
  background: var(--panel-bg); border: 1px solid var(--divider);
  border-radius: 10px; box-shadow: 0 4px 16px var(--shadow-md);
  opacity: 0; pointer-events: none; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}
.img-controls.visible { opacity: 1; pointer-events: all; transform: translateX(-50%) translateY(0); }
.img-ctrl-btn {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); transition: all 0.15s;
}
.img-ctrl-btn:hover { background: var(--hover-bg); color: var(--text); }
.img-ctrl-btn.active { background: var(--accent-bg); color: var(--accent); }
.img-ctrl-btn.img-ctrl-delete:hover { background: rgba(192,57,43,0.1); color: var(--error-bg); }
.img-ctrl-divider { width: 1px; background: var(--divider); margin: 2px 2px; }

/* Drag-over state for writing input */
#writing-input.drag-over {
  background: var(--accent-bg);
  border: 2px dashed var(--accent-light);
  border-radius: 12px;
  transition: all 0.2s ease;
}

/* ═══ Import Panel ═══ */
.import-panel {
  position: fixed; top: 0; right: -480px; width: 440px; max-width: 95vw; height: 100dvh;
  background: var(--panel-bg); border-left: 1px solid var(--panel-border); z-index: 201;
  transition: right 0.45s cubic-bezier(0.16,1,0.3,1); overflow-y: auto;
  -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; cursor: default;
}
.import-panel.open { right: 0; }
.import-body { flex: 1; overflow-y: auto; padding: 20px; }
.import-desc {
  font-family: 'DM Sans', sans-serif; font-size: 0.82rem; color: var(--text-muted);
  line-height: 1.5; margin-bottom: 16px;
}
.import-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
.import-url-input {
  flex: 1; border: 1px solid var(--input-border); border-radius: 10px;
  padding: 10px 14px; font-family: 'DM Sans', sans-serif; font-size: 0.82rem;
  background: var(--bg); color: var(--text); outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.import-url-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(196,119,90,0.08); }
.import-url-input::placeholder { color: var(--text-light); }
.import-fetch-btn {
  padding: 10px 18px; border-radius: 10px; border: none;
  background: var(--accent); color: white; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500;
  transition: all 0.2s; white-space: nowrap;
  display: flex; align-items: center; justify-content: center;
}
.import-fetch-btn:hover { background: #b86a4f; }
.import-fetch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.import-error {
  font-family: 'DM Sans', sans-serif; font-size: 0.78rem; color: var(--error-bg);
  padding: 8px 12px; background: rgba(192,57,43,0.06); border-radius: 8px;
  margin-bottom: 12px; animation: fadeUp 0.2s ease;
}
.import-preview {
  border: 1px solid var(--divider); border-radius: 14px; padding: 16px;
  animation: fadeUp 0.3s ease;
}
.import-preview-title {
  font-size: 1rem; font-weight: 500; color: var(--text); margin-bottom: 4px;
}
.import-preview-count {
  font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: var(--text-muted);
  margin-bottom: 14px;
}
.import-preview-msgs {
  max-height: 300px; overflow-y: auto; margin-bottom: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.import-msg {
  padding: 8px 12px; border-radius: 8px; font-size: 0.82rem; line-height: 1.5;
}
.import-msg.user { background: var(--bg-secondary); }
.import-msg.assistant { background: var(--conv-bg); }
.import-msg-role {
  font-family: 'DM Sans', sans-serif; font-size: 0.62rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-light);
  display: block; margin-bottom: 3px;
}
.import-msg-text { color: var(--text-muted); font-size: 0.8rem; }
.import-more {
  font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: var(--text-light);
  text-align: center; padding: 6px;
}
.import-save-btn {
  width: 100%; padding: 12px; border-radius: 10px; border: none;
  background: var(--accent); color: white; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: all 0.2s;
}
.import-save-btn:hover { background: #b86a4f; }
.import-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ═══ Mobile ═══ */
@media (max-width: 680px) {
  body { font-size: 16px; }
  #canvas { padding: 56px 16px 100px; }
  .greeting-text { font-size: 1.28rem; }
  .si-conv { padding: 12px 14px; border-radius: 10px; }
  .anno-body { font-size: 0.8rem; }
  #topbar { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
  .tbtn { padding: 12px; }
  .panel { width: 88vw; }
  .import-panel { width: 95vw; }
  .p-body { padding: 16px; }
  .fgrp { margin-bottom: 16px; }
  .tool-chart { max-height: 180px; }
  .topbar-title { font-size: 0.62rem; }
  #send-hint { padding: 10px 16px; }
}
@media (max-width: 380px) {
  body { font-size: 15px; }
  #canvas { padding: 52px 12px 90px; }
  .greeting-text { font-size: 1.15rem; }
  .panel { width: 92vw; }
}
@media (min-width: 1024px) {
  body { font-size: 19px; }
  #canvas { padding: 80px 24px 120px; }
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 4px; }
::selection { background: var(--accent-light); color: var(--text); }

@media (hover: none) and (pointer: coarse) {
  .tbtn:hover, .ecard:hover, .p-close:hover, .login-btn:hover, .greeting-continue:hover { background: initial; opacity: initial; color: initial; transform: none; }
  .tbtn:active { opacity: 1; background: var(--hover-bg); }
  .ecard:active { background: var(--hover-bg); transform: translateX(2px); }
  #send-hint:hover { opacity: 0.4; background: var(--hover-bg); border-color: var(--divider); }
  #send-hint:active { opacity: 1; background: var(--accent-bg); border-color: var(--accent-light); }
  .ecard-del { opacity: 0.5; }
}
`

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface StreamItem {
  id?: string
  type: 'writing' | 'ai-annotation' | 'ai-conversational'
  content: string
  tone?: string
  linked_entry_id?: string | null
  tool_call?: any
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
}

// ═══════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async () => {
    if (!pw.trim()) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) onLogin()
      else setErr('Wrong password')
    } catch { setErr('Connection error') }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-content">
        <div className="login-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
        <h1 className="login-title">Smart Notebook</h1>
        <p className="login-sub">Your personal space</p>
        <div className="login-form">
          <input ref={inputRef} type="password" className="login-input" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} disabled={loading} />
          <button className="login-btn" onClick={submit} disabled={loading}>
            {loading ? <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>}
          </button>
        </div>
        {err && <p className="login-err">{err}</p>}
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

  // load_entry tool is handled by the parent (auto-loads the entry) — don't render anything for it
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
// SIDE PANEL WITH DELETE
// ═══════════════════════════════════════════

function SidePanel({ open, onClose, onLoadEntry, onDeleteEntry }: { open: boolean; onClose: () => void; onLoadEntry: (id: string) => void; onDeleteEntry: (id: string) => void }) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => { if (open) { loadEntries(); setConfirmDelete(null) } }, [open])
  const loadEntries = async () => { setLoading(true); try { const r = await fetch('/api/entries'); if (r.ok) { const d = await r.json(); setEntries(d.entries || []) } } catch {} setLoading(false) }

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
        <div className="p-body">
          {loading && <div className="p-loading"><div className="thinking"><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div></div>}
          {!loading && entries.length === 0 && <div className="p-empty">No entries yet. Start writing.</div>}
          {Object.entries(grouped).map(([folder, ents]) => (
            <div key={folder} className="fgrp">
              <div className="fname"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>{folder}</div>
              {ents.map(e => <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} onDelete={() => confirmDelete === e.id ? doDelete(e.id) : setConfirmDelete(e.id)} confirming={confirmDelete === e.id} />)}
            </div>
          ))}
          {uncategorized.length > 0 && <div className="fgrp"><div className="fname">Uncategorized</div>{uncategorized.map(e => <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} onDelete={() => confirmDelete === e.id ? doDelete(e.id) : setConfirmDelete(e.id)} confirming={confirmDelete === e.id} />)}</div>}
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
// MAIN APP — JOURNAL CANVAS
// ═══════════════════════════════════════════

export default function Home() {
  const [state, setState] = useState<AppState>({
    authed: false, loading: true, entryId: null, stream: [],
    busy: false, greetingVisible: true, greeting: '',
    recentEntryId: null, recentEntryTopic: null,
    continuationChecked: false, panelOpen: false,
    theme: 'light', error: null, entryTitle: null,
  })

  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentRef = useRef('')
  const allTextRef = useRef('') // all user text accumulated
  const busyRef = useRef(false)
  const streamEndRef = useRef<HTMLDivElement>(null)

  const s = useCallback((update: Partial<AppState> | ((prev: AppState) => AppState)) => {
    if (typeof update === 'function') setState(update)
    else setState(prev => ({ ...prev, ...update }))
  }, [])

  useEffect(() => { busyRef.current = state.busy }, [state.busy])

  // ─── Theme ───
  useEffect(() => {
    const saved = localStorage.getItem('sn-th')
    const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) { document.documentElement.setAttribute('data-theme', 'dark'); s({ theme: 'dark' }) }
  }, [s])

  // ─── Auth ───
  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/init')
      if (res.ok) {
        const data = await res.json()
        s({ authed: true, loading: false, greeting: data.greeting || 'Write something.', recentEntryId: data.recentEntryId, recentEntryTopic: data.recentEntryTopic })
      } else if (res.status === 401) {
        s({ authed: false, loading: false })
      } else {
        // Non-401 error — still let user in with a fallback greeting
        s({ authed: true, loading: false, greeting: 'Hey. Write something.' })
      }
    } catch { s({ authed: false, loading: false, error: 'Failed to connect' }) }
  }

  const onLogin = async () => { s({ loading: true }); await checkAuth() }

  const toggleTheme = () => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
    localStorage.setItem('sn-th', next)
    s({ theme: next })
  }

  const scrollToBottom = () => { setTimeout(() => streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80) }

  const focusInput = useCallback(() => {
    if (state.greetingVisible) s({ greetingVisible: false })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [state.greetingVisible, s])

  // ─── New entry ───
  const newEntry = () => {
    s({ entryId: null, stream: [], continuationChecked: false, greetingVisible: false, error: null, entryTitle: null })
    lastSentRef.current = ''
    allTextRef.current = ''
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // ─── Delete handler (called from panel) ───
  const onDeleteEntry = (id: string) => {
    // If we're viewing the deleted entry, reset to blank
    if (state.entryId === id) newEntry()
  }

  // ─── Load existing entry — rebuild as interleaved stream ───
  const loadEntry = async (entryId: string) => {
    try {
      const res = await fetch(`/api/entries/${entryId}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.entry) return

      // Convert messages to stream items IN ORDER (preserving the interleaving)
      const items: StreamItem[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        type: m.sender === 'user' ? 'writing' as const : m.message_type === 'annotation' ? 'ai-annotation' as const : 'ai-conversational' as const,
        content: m.content,
        tone: m.tone,
        linked_entry_id: m.linked_entry_id,
        tool_call: m.tool_call,
      }))

      // Rebuild allTextRef from user messages
      allTextRef.current = items.filter(i => i.type === 'writing').map(i => i.content).join('\n\n')
      lastSentRef.current = allTextRef.current

      setInput('')
      s({
        entryId,
        stream: items,
        panelOpen: false,
        error: null,
        greetingVisible: false,
        entryTitle: data.entry.title || null,
        continuationChecked: true, // Don't re-check continuation for loaded entries
      })
      setTimeout(() => {
        scrollToBottom()
        inputRef.current?.focus()
      }, 100)
    } catch {}
  }

  // ─── Continuation check ───
  const checkContinuation = async (text: string) => {
    if (state.continuationChecked || !text.trim()) return
    s({ continuationChecked: true })
    try {
      const res = await fetch('/api/continuation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const data = await res.json()
      if (data.isContinuation && data.entryId) {
        const items: StreamItem[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          type: m.sender === 'user' ? 'writing' as const : m.message_type === 'annotation' ? 'ai-annotation' as const : 'ai-conversational' as const,
          content: m.content, tone: m.tone, linked_entry_id: m.linked_entry_id, tool_call: m.tool_call,
        }))
        allTextRef.current = items.filter(i => i.type === 'writing').map(i => i.content).join('\n\n')
        lastSentRef.current = allTextRef.current
        s({ entryId: data.entryId, stream: items, entryTitle: data.entry?.title || null })
        scrollToBottom()
      }
    } catch {}
  }

  // ─── Commit current input into the stream and send to model ───
  const sendToModel = async (userRequested: boolean) => {
    const text = input.trim()
    if (busyRef.current || !text) return

    // Commit the current input as a writing block in the stream
    const writingItem: StreamItem = { type: 'writing', content: text }
    const newStream = [...state.stream, writingItem]

    // Update tracking
    allTextRef.current = (allTextRef.current ? allTextRef.current + '\n\n' : '') + text
    const delta = text // The input IS the delta since it was last cleared

    setInput('')
    s({ busy: true, error: null, stream: newStream })
    scrollToBottom()

    try {
      // Build session context from recent stream
      const recentContext = newStream.slice(-15).map(i => ({
        sender: i.type === 'writing' ? 'user' : 'ai',
        content: i.content,
        type: i.type === 'writing' ? 'user_message' : i.type === 'ai-annotation' ? 'annotation' : 'conversational',
      }))

      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: delta,
          entryId: state.entryId,
          sessionMessages: recentContext,
          userRequestedResponse: userRequested,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Something went wrong' }))
        s({ busy: false, error: err.error || 'Something went wrong' })
        return
      }

      const data = await res.json()

      // Build AI stream items — these go INLINE right after the writing block
      const aiItems: StreamItem[] = (data.responses || []).filter((r: any) => r.content?.trim()).map((r: any) => ({
        id: r.id,
        type: r.type === 'annotation' ? 'ai-annotation' as const : 'ai-conversational' as const,
        content: r.content,
        tone: r.tone,
        linked_entry_id: r.linked_entry_id,
      }))

      // Attach tool call to LAST AI item only
      if (data.toolCall && aiItems.length > 0) {
        aiItems[aiItems.length - 1].tool_call = data.toolCall
      } else if (data.toolCall && aiItems.length === 0) {
        aiItems.push({ type: 'ai-annotation', content: '', tool_call: data.toolCall })
      }

      s(prev => ({
        ...prev,
        entryId: data.entryId,
        entryTitle: data.entryTitle || prev.entryTitle,
        stream: [...prev.stream, ...aiItems],
        busy: false,
      }))

      lastSentRef.current = allTextRef.current
      if (aiItems.length > 0) scrollToBottom()

      // ─── Handle load_entry tool: auto-load past entry into view ───
      if (data.toolCall?.type === 'load_entry' && data.toolCall?.data?.entry_id) {
        setTimeout(() => loadEntry(data.toolCall.data.entry_id), 300)
      }
    } catch {
      s({ busy: false, error: 'Network error — check your connection' })
    }
  }

  // ─── Auto-trigger ───
  const resetAutoTrigger = () => {
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null }
  }

  const startAutoTrigger = (text: string) => {
    resetAutoTrigger()
    if (!text.trim()) return
    const trimmed = text.trimEnd()
    const lastChar = trimmed.charAt(trimmed.length - 1)
    const endsSentence = ['.', '!', '?'].includes(lastChar)
    const delay = endsSentence ? 3000 : 8000

    autoTimerRef.current = setTimeout(() => {
      const current = inputRef.current?.value?.trim() || ''
      if (current && !busyRef.current) {
        sendToModel(false) // auto = not user requested
      }
    }, delay)
  }

  // ─── Input change ───
  const onInputChange = (val: string) => {
    setInput(val)
    if (state.greetingVisible && val.trim()) s({ greetingVisible: false })
    if (!state.continuationChecked && val.trim().split(/\s+/).length >= 4) {
      checkContinuation(val.trim())
    }
    startAutoTrigger(val)
  }

  // ─── Manual send ───
  const manualSend = () => {
    resetAutoTrigger()
    if (!input.trim() || state.busy) return
    sendToModel(true)
  }

  // ─── Auto-resize ───
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 300) + 'px'
    }
  }, [input])

  // ─── Render ───
  if (state.loading) {
    return <div className="login-screen"><div className="thinking" style={{ justifyContent: 'center' }}><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div></div>
  }

  if (!state.authed) return <LoginScreen onLogin={onLogin} />

  return (
    <div id="app" onClick={focusInput}>
      {/* Top Bar */}
      <div id="topbar" onClick={e => e.stopPropagation()}>
        <button className="tbtn" onClick={newEntry} title="New entry">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        {state.entryTitle && <div className="topbar-title">{state.entryTitle}</div>}
        <div className="topbar-right">
          <button className="tbtn" onClick={toggleTheme} title="Toggle theme">
            {state.theme === 'dark'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
          </button>
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

      {/* Canvas — the journal page with interleaved writing and AI */}
      <div id="canvas">
        <div id="stream">
          {state.stream.map((item, i) => {
            if (item.type === 'writing') {
              return <div key={i} className="si-writing">{item.content}</div>
            }
            if (item.type === 'ai-annotation') {
              return (
                <div key={item.id || i} className="si-annotation" onClick={e => e.stopPropagation()}>
                  <div className="anno-bar" />
                  <div className="anno-body">
                    {item.content && <div className="anno-text">{item.content}</div>}
                    {item.linked_entry_id && <span className="anno-link" onClick={() => loadEntry(item.linked_entry_id!)}>see related entry</span>}
                    {item.tool_call && <ToolRender toolCall={item.tool_call} messageId={item.id} onLoadEntry={loadEntry} />}
                  </div>
                </div>
              )
            }
            // ai-conversational
            return (
              <div key={item.id || i} className="si-conv" onClick={e => e.stopPropagation()}>
                <div className="conv-text">{item.content}</div>
                {item.tool_call && <ToolRender toolCall={item.tool_call} messageId={item.id} onLoadEntry={loadEntry} />}
              </div>
            )
          })}
        </div>

        {/* Thinking */}
        {state.busy && <div className="thinking-inline"><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div>}

        {/* Live input — always at the bottom of the stream, part of the flow */}
        <div id="writing-input" onClick={e => e.stopPropagation()}>
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
            disabled={state.busy}
            autoFocus
          />
        </div>

        {/* Send hint */}
        {input.trim() && !state.busy && (
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

      <SidePanel open={state.panelOpen} onClose={() => s({ panelOpen: false })} onLoadEntry={loadEntry} onDeleteEntry={onDeleteEntry} />

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
.login-screen { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bg); padding: 24px; }
.login-content { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 340px; }
.login-icon { color: var(--accent); margin-bottom: 20px; opacity: 0; animation: fadeUp 0.7s ease 0.2s forwards; }
.login-title { font-size: 1.5rem; font-weight: 300; color: var(--text); margin-bottom: 6px; opacity: 0; animation: fadeUp 0.7s ease 0.35s forwards; }
.login-sub { font-family: 'DM Sans', sans-serif; font-size: 0.88rem; color: var(--text-muted); margin-bottom: 32px; opacity: 0; animation: fadeUp 0.6s ease 0.5s forwards; }
.login-form { display: flex; gap: 8px; width: 100%; opacity: 0; animation: fadeUp 0.6s ease 0.65s forwards; }
.login-input { flex: 1; border: 1px solid var(--input-border); border-radius: 14px; padding: 14px 18px; font-family: 'DM Sans', sans-serif; font-size: 16px; background: var(--input-bg); color: var(--text); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.login-input:focus { border-color: var(--accent-light); box-shadow: 0 0 0 3px rgba(196,119,90,0.08); }
.login-btn { width: 52px; height: 52px; border-radius: 14px; border: none; background: var(--accent); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; flex-shrink: 0; }
.login-btn:hover { transform: scale(1.04); }
.login-btn:active { transform: scale(0.96); }
.login-btn:disabled { opacity: 0.5; }
.login-err { color: var(--error-bg); font-size: 0.82rem; margin-top: 14px; font-family: 'DM Sans', sans-serif; }

/* ═══ Greeting ═══ */
#greeting-screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; background: var(--bg); padding: 24px; transition: opacity 0.7s ease, transform 0.7s ease; cursor: text; }
#greeting-screen.fading { opacity: 0; transform: translateY(-12px); pointer-events: none; }
.greeting-text { font-size: 1.45rem; font-weight: 300; color: var(--text); text-align: center; max-width: 480px; line-height: 1.5; opacity: 0; animation: fadeUp 0.9s ease 0.3s forwards; }
.greeting-continue { margin-top: 20px; font-family: 'DM Sans', sans-serif; font-size: 0.88rem; color: var(--text-muted); background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 10px; transition: color 0.2s, background 0.2s; opacity: 0; animation: fadeUp 0.7s ease 0.9s forwards; }
.greeting-continue:hover { color: var(--accent); background: var(--hover-bg); }
.greeting-hint { margin-top: 48px; font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: var(--text-light); letter-spacing: 0.05em; opacity: 0; animation: fadeUp 0.6s ease 1.4s forwards; text-transform: uppercase; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ═══ Top Bar ═══ */
#topbar { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; z-index: 100; padding-top: max(12px, env(safe-area-inset-top)); background: linear-gradient(to bottom, var(--bg) 60%, transparent); cursor: default; }
.topbar-title { flex: 1; text-align: center; font-family: 'DM Sans', sans-serif; font-size: 0.7rem; color: var(--text-light); letter-spacing: 0.04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 8px; }
.topbar-right { display: flex; gap: 2px; }
.tbtn { background: none; border: none; cursor: pointer; color: var(--text-light); padding: 10px; border-radius: 10px; transition: all 0.25s; opacity: 0.4; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.tbtn:hover { opacity: 1; color: var(--text-muted); background: var(--hover-bg); }
.tbtn:active { opacity: 1; transform: scale(0.92); }

/* ═══ Canvas ═══ */
#canvas { max-width: 680px; width: 100%; margin: 0 auto; padding: 64px 24px 120px; min-height: 100dvh; }
#stream { display: flex; flex-direction: column; gap: 0; }

/* ═══ Stream Items — INLINE ═══ */

/* User writing — looks like text on a page */
.si-writing { padding: 0 0 4px; white-space: pre-wrap; word-break: break-word; animation: fadeIn 0.15s ease; }

/* AI Annotation — margin note with accent bar, inline in the flow */
.si-annotation { display: flex; gap: 0; margin: 8px 0 12px; animation: aiFade 0.4s ease; cursor: default; }
.anno-bar { width: 3px; border-radius: 2px; background: var(--annotation-border); opacity: 0.5; flex-shrink: 0; }
.anno-body { padding: 4px 0 4px 14px; font-size: 0.84rem; color: var(--text-muted); line-height: 1.6; }
.anno-text { white-space: pre-wrap; word-break: break-word; }
.anno-link { font-family: 'DM Sans', sans-serif; font-size: 0.68rem; color: var(--accent); cursor: pointer; margin-top: 4px; display: inline-block; text-decoration: underline; text-underline-offset: 2px; opacity: 0.8; }
.anno-link:hover { opacity: 1; }

/* AI Conversational — gentle inline note, NOT a separate section */
.si-conv { margin: 10px 0 14px; padding: 14px 18px; background: var(--conv-bg); border-radius: 12px; animation: aiFade 0.4s ease; cursor: default; font-size: 0.92rem; line-height: 1.65; }
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
#tinput:disabled { opacity: 0.6; }

/* ═══ Thinking ═══ */
.thinking, .thinking-inline { display: flex; gap: 5px; padding: 8px 2px; }
.thinking-inline { margin: 8px 0; cursor: default; }
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
.error-bar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--error-bg); color: white; padding: 12px 18px; border-radius: 14px; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; z-index: 60; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.2); animation: aiFade 0.3s ease; max-width: calc(100vw - 32px); cursor: default; }
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
.panel-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.18); z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.35s; backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.panel-bg.open { opacity: 1; pointer-events: all; }
.panel { position: fixed; top: 0; right: -420px; width: 380px; max-width: 90vw; height: 100dvh; background: var(--panel-bg); border-left: 1px solid var(--panel-border); z-index: 201; transition: right 0.4s cubic-bezier(0.16,1,0.3,1); overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; cursor: default; }
.panel.open { right: 0; }
.p-head { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 16px; padding-top: max(20px, env(safe-area-inset-top)); border-bottom: 1px solid var(--divider); flex-shrink: 0; }
.p-title { font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.p-close { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 8px; border-radius: 8px; transition: background 0.15s; display: flex; align-items: center; justify-content: center; }
.p-close:hover { background: var(--hover-bg); }
.p-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.p-loading { padding: 40px 0; display: flex; justify-content: center; }
.p-empty { color: var(--text-light); font-size: 0.88rem; padding: 40px 0; text-align: center; line-height: 1.6; }
.fgrp { margin-bottom: 20px; }
.fname { font-family: 'DM Sans', sans-serif; font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-light); margin-bottom: 6px; padding-left: 4px; display: flex; align-items: center; gap: 6px; }
.ecard { display: flex; align-items: center; border-radius: 12px; transition: background 0.15s; margin-bottom: 2px; }
.ecard:hover { background: var(--hover-bg); }
.ecard-main { flex: 1; padding: 12px 8px 12px 14px; cursor: pointer; min-width: 0; }
.ecard-t { font-size: 0.92rem; color: var(--text); margin-bottom: 3px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ecard-meta { font-family: 'DM Sans', sans-serif; font-size: 0.68rem; color: var(--text-light); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ecard-date { white-space: nowrap; }
.tag { font-family: 'DM Sans', sans-serif; font-size: 0.6rem; background: var(--tag-bg); color: var(--tag-text); padding: 2px 9px; border-radius: 10px; white-space: nowrap; }
.ecard-del { background: none; border: none; cursor: pointer; color: var(--text-light); padding: 10px; border-radius: 8px; opacity: 0.3; transition: all 0.2s; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.ecard-del:hover { opacity: 0.7; color: var(--error-bg); }
.ecard-del.confirming { opacity: 1; color: var(--error-bg); background: rgba(192,57,43,0.1); }

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
  .p-body { padding: 16px; }
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
  .tbtn:hover, .ecard:hover, .p-close:hover, .login-btn:hover, .greeting-continue:hover { background: initial; opacity: initial; color: initial; transform: initial; }
  .tbtn:active { opacity: 1; background: var(--hover-bg); }
  .ecard:active { background: var(--hover-bg); }
  #send-hint:hover { opacity: 0.4; background: var(--hover-bg); border-color: var(--divider); }
  #send-hint:active { opacity: 1; background: var(--accent-bg); border-color: var(--accent-light); }
  .ecard-del { opacity: 0.5; }
}
`

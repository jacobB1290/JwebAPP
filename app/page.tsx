'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface AiInsert {
  id?: string
  type: 'annotation' | 'conversational'
  content: string
  tone?: string
  linked_entry_id?: string | null
  tool_call?: any
  timestamp: number
}

interface AppState {
  authed: boolean
  loading: boolean
  entryId: string | null
  aiInserts: AiInsert[]
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
  inputFocused: boolean
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

function ToolRender({ toolCall, messageId }: { toolCall: any; messageId?: string }) {
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

  return (
    <div className="tool-box">
      {toolCall.title && <div className="tool-head">{toolCall.title}</div>}
      {toolCall.type === 'chart' && <canvas ref={canvasRef} className="tool-chart" />}
      {toolCall.type === 'table' && (<div className="tool-tbl-wrap"><table className="tool-tbl">{data.headers && <thead><tr>{data.headers.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead>}<tbody>{(data.rows || []).map((row: any[], ri: number) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}</tbody></table></div>)}
      {toolCall.type === 'checklist' && <ChecklistTool items={data.items || []} onToggle={toggleCheck} />}
      {toolCall.type === 'prompt_card' && <div className="tool-prompt">{data.prompt}</div>}
      {toolCall.type === 'tracker' && (<div className="tool-tracker"><div className="tr-metric">{data.metric}</div>{(data.values || []).map((v: any, i: number) => <div key={i} className="tr-pt"><span className="tr-val">{v.value}</span><span className="tr-unit">{data.unit || ''}</span><span className="tr-date">{v.date || ''}</span></div>)}</div>)}
      {toolCall.type === 'link_card' && (<div className="tool-link-card"><div style={{ fontSize: '0.85rem' }}>{data.title || 'Past Entry'}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{data.date || ''}</div></div>)}
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
// AI INSERT RENDERERS
// ═══════════════════════════════════════════

function AiAnnotation({ item, onLoadEntry }: { item: AiInsert; onLoadEntry: (id: string) => void }) {
  return (
    <div className="ai-annotation" onClick={e => e.stopPropagation()}>
      <div className="anno-accent" />
      <div className="anno-inner">
        <div className="anno-content">{item.content}</div>
        {item.linked_entry_id && (
          <span className="anno-link" onClick={() => onLoadEntry(item.linked_entry_id!)}>see related entry</span>
        )}
        {item.tool_call && <ToolRender toolCall={item.tool_call} messageId={item.id} />}
      </div>
    </div>
  )
}

function AiConversational({ item, onLoadEntry }: { item: AiInsert; onLoadEntry: (id: string) => void }) {
  return (
    <div className="ai-conversational" onClick={e => e.stopPropagation()}>
      <div className="conv-marker">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /></svg>
      </div>
      <div className="conv-content">{item.content}</div>
      {item.tool_call && <ToolRender toolCall={item.tool_call} messageId={item.id} />}
    </div>
  )
}

// ═══════════════════════════════════════════
// SIDE PANEL
// ═══════════════════════════════════════════

function SidePanel({ open, onClose, onLoadEntry }: { open: boolean; onClose: () => void; onLoadEntry: (id: string) => void }) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (open) loadEntries() }, [open])
  const loadEntries = async () => { setLoading(true); try { const r = await fetch('/api/entries'); if (r.ok) { const d = await r.json(); setEntries(d.entries || []) } } catch {} setLoading(false) }

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
              {ents.map(e => <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} />)}
            </div>
          ))}
          {uncategorized.length > 0 && <div className="fgrp"><div className="fname">Uncategorized</div>{uncategorized.map(e => <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} />)}</div>}
        </div>
      </div>
    </>
  )
}

function EntryCard({ entry, onClick }: { entry: any; onClick: () => void }) {
  const date = new Date(entry.created_at || entry.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const tags = [...(entry.emotion_tags || []).slice(0, 2), ...(entry.topic_tags || []).slice(0, 2)]
  return (
    <div className="ecard" onClick={onClick}>
      <div className="ecard-t">{entry.title || 'Untitled'}</div>
      <div className="ecard-meta"><span className="ecard-date">{date}</span>{tags.map((t: string, i: number) => <span key={i} className="tag">{t}</span>)}</div>
    </div>
  )
}

// ═══════════════════════════════════════════
// MAIN APP — JOURNAL CANVAS
// ═══════════════════════════════════════════

export default function Home() {
  const [state, setState] = useState<AppState>({
    authed: false, loading: true, entryId: null, aiInserts: [],
    busy: false, greetingVisible: true, greeting: '',
    recentEntryId: null, recentEntryTopic: null,
    continuationChecked: false, panelOpen: false,
    theme: 'light', error: null, entryTitle: null,
    inputFocused: false,
  })

  // The user's continuous writing — ONE textarea, never fragmented
  const [writing, setWriting] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentRef = useRef('') // tracks what text has already been sent to the model
  const busyRef = useRef(false) // avoids stale closures
  const canvasRef = useRef<HTMLDivElement>(null)
  const aiZoneRef = useRef<HTMLDivElement>(null)

  const s = useCallback((update: Partial<AppState> | ((prev: AppState) => AppState)) => {
    if (typeof update === 'function') {
      setState(update)
    } else {
      setState(prev => ({ ...prev, ...update }))
    }
  }, [])

  // Keep busyRef in sync
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
        s({ authed: true, loading: false, greeting: data.greeting, recentEntryId: data.recentEntryId, recentEntryTopic: data.recentEntryTopic })
      } else if (res.status === 401) {
        s({ authed: false, loading: false })
      } else {
        const data = await res.json().catch(() => ({}))
        s({ authed: false, loading: false, error: data.error || 'Failed to connect' })
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

  // ─── Focus input — the core UX fix ───
  // Tapping anywhere on the canvas focuses the writing area
  const focusInput = useCallback(() => {
    if (state.greetingVisible) {
      s({ greetingVisible: false })
    }
    // Small delay to let greeting fade start, then focus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        // On mobile, scroll to input if needed
        inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 50)
  }, [state.greetingVisible, s])

  // ─── New entry ───
  const newEntry = () => {
    s({ entryId: null, aiInserts: [], continuationChecked: false, greetingVisible: false, error: null, entryTitle: null })
    lastSentRef.current = ''
    setWriting('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // ─── Load existing entry ───
  const loadEntry = async (entryId: string) => {
    try {
      const res = await fetch(`/api/entries/${entryId}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.entry) return

      // Reconstruct: user messages become the writing text, AI messages become inserts
      const userTexts: string[] = []
      const inserts: AiInsert[] = []

      for (const m of (data.messages || [])) {
        if (m.sender === 'user') {
          userTexts.push(m.content)
        } else {
          inserts.push({
            id: m.id,
            type: m.message_type === 'annotation' ? 'annotation' : 'conversational',
            content: m.content,
            tone: m.tone,
            linked_entry_id: m.linked_entry_id,
            tool_call: m.tool_call,
            timestamp: new Date(m.created_at || Date.now()).getTime(),
          })
        }
      }

      const fullText = userTexts.join('\n\n')
      setWriting(fullText)
      lastSentRef.current = fullText
      s({
        entryId,
        aiInserts: inserts,
        panelOpen: false,
        error: null,
        greetingVisible: false,
        entryTitle: data.entry.title || null,
      })
      setTimeout(() => {
        inputRef.current?.focus()
        // Move cursor to end
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.value.length
          inputRef.current.selectionEnd = inputRef.current.value.length
        }
      }, 100)
    } catch {}
  }

  // ─── Continuation check (runs once on first text) ───
  const checkContinuation = async (text: string) => {
    if (state.continuationChecked || !text.trim()) return
    s({ continuationChecked: true })
    try {
      const res = await fetch('/api/continuation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const data = await res.json()
      if (data.isContinuation && data.entryId) {
        // Load the continued entry's AI inserts, and prepend previous user text
        const userTexts: string[] = []
        const inserts: AiInsert[] = []
        for (const m of (data.messages || [])) {
          if (m.sender === 'user') userTexts.push(m.content)
          else inserts.push({
            id: m.id,
            type: m.message_type === 'annotation' ? 'annotation' : 'conversational',
            content: m.content, tone: m.tone, linked_entry_id: m.linked_entry_id, tool_call: m.tool_call,
            timestamp: new Date(m.created_at || Date.now()).getTime(),
          })
        }
        // Prepend old text to current writing
        const oldText = userTexts.join('\n\n')
        const combined = oldText ? oldText + '\n\n' + text : text
        setWriting(combined)
        lastSentRef.current = oldText // Only the old text has been "sent" already
        s({ entryId: data.entryId, aiInserts: inserts, entryTitle: data.entry?.title || null })
      }
    } catch {}
  }

  // ─── Send new text to LLM ───
  // This is the KEY design change: the user's textarea is NEVER cleared.
  // We just silently send the delta (new text since last send) to the backend.
  // The user keeps writing. AI inserts appear in a separate zone below.
  const sendToModel = async (currentText: string, userRequested: boolean) => {
    if (busyRef.current) return

    const delta = currentText.slice(lastSentRef.current.length).trim()
    if (!delta && !userRequested) return

    const textToSend = delta || currentText.trim()
    s({ busy: true, error: null })

    try {
      // Build session context from existing AI inserts (recent)
      const recentInserts = state.aiInserts.slice(-10).map(i => ({
        sender: 'ai',
        content: i.content,
        type: i.type,
      }))

      // Also include a summary of user's writing as context
      const sessionMessages = [
        ...recentInserts,
        { sender: 'user', content: textToSend, type: 'user_message' },
      ]

      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSend,
          entryId: state.entryId,
          sessionMessages,
          userRequestedResponse: userRequested,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Something went wrong' }))
        s({ busy: false, error: err.error || 'Something went wrong' })
        return
      }

      const data = await res.json()

      // Build new AI inserts
      const newInserts: AiInsert[] = (data.responses || [])
        .filter((r: any) => r.content?.trim())
        .map((r: any) => ({
          id: r.id,
          type: r.type === 'annotation' ? 'annotation' as const : 'conversational' as const,
          content: r.content,
          tone: r.tone,
          linked_entry_id: r.linked_entry_id,
          timestamp: Date.now(),
        }))

      // Attach tool call to last insert
      if (data.toolCall && newInserts.length > 0) {
        newInserts[newInserts.length - 1].tool_call = data.toolCall
      } else if (data.toolCall && newInserts.length === 0) {
        newInserts.push({ type: 'annotation', content: '', tool_call: data.toolCall, timestamp: Date.now() })
      }

      // Update state — AI inserts appear, user's text stays exactly as-is
      s(prev => ({
        ...prev,
        entryId: data.entryId,
        entryTitle: data.entryTitle || prev.entryTitle,
        aiInserts: [...prev.aiInserts, ...newInserts],
        busy: false,
      }))

      // Mark current text as "sent"
      lastSentRef.current = currentText

      // Scroll to show new AI inserts if any
      if (newInserts.length > 0) {
        setTimeout(() => {
          aiZoneRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 100)
      }
    } catch {
      s({ busy: false, error: 'Network error — check your connection' })
    }
  }

  // ─── Auto-trigger logic ───
  const resetAutoTrigger = () => {
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null }
  }

  const startAutoTrigger = (fullText: string) => {
    resetAutoTrigger()
    if (!fullText.trim() || fullText === lastSentRef.current) return

    // Determine delay based on whether the user just finished a sentence
    const trimmed = fullText.trimEnd()
    const lastChar = trimmed.charAt(trimmed.length - 1)
    const endsSentence = ['.', '!', '?'].includes(lastChar)
    const delay = endsSentence ? 3000 : 8000 // 3s after sentence end, 8s otherwise

    autoTimerRef.current = setTimeout(() => {
      // Re-check: only send if there's new unsent text and we're not busy
      const currentText = inputRef.current?.value || ''
      if (currentText.trim() && currentText !== lastSentRef.current && !busyRef.current) {
        sendToModel(currentText, false) // auto-trigger = NOT user requested
      }
    }, delay)
  }

  // ─── Input change handler ───
  const onWritingChange = (val: string) => {
    setWriting(val)

    // Fade greeting on first keystroke
    if (state.greetingVisible && val.trim()) {
      s({ greetingVisible: false })
    }

    // Check continuation on first few words (once)
    if (!state.continuationChecked && val.trim().split(/\s+/).length >= 4) {
      checkContinuation(val.trim())
    }

    // Start/reset auto-trigger
    startAutoTrigger(val)
  }

  // ─── Manual send (Ctrl+Enter or button) ───
  const manualSend = () => {
    resetAutoTrigger()
    const text = writing.trim()
    if (!text || state.busy) return
    sendToModel(writing, true) // user requested = true → AI WILL respond
  }

  // ─── Auto-resize textarea ───
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      const scrollHeight = inputRef.current.scrollHeight
      // Let it grow freely — this IS the journal page
      inputRef.current.style.height = scrollHeight + 'px'
    }
  }, [writing])

  // ─── Render ───
  if (state.loading) {
    return <div className="login-screen"><div className="thinking" style={{ justifyContent: 'center' }}><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div></div>
  }

  if (!state.authed) {
    return <LoginScreen onLogin={onLogin} />
  }

  const hasNewText = writing.trim() && writing !== lastSentRef.current

  return (
    <div id="app">
      {/* Top Bar */}
      <div id="topbar">
        <button className="tbtn" onClick={newEntry} title="New entry">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        {state.entryTitle && (
          <div className="topbar-title">{state.entryTitle}</div>
        )}
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

      {/* Greeting Overlay */}
      <div
        id="greeting-screen"
        className={!state.greetingVisible ? 'fading' : ''}
        style={!state.greetingVisible ? { pointerEvents: 'none' } : {}}
        onClick={focusInput}
      >
        <div className="greeting-text">{state.greeting}</div>
        {state.recentEntryId && state.recentEntryTopic && (
          <button className="greeting-continue" onClick={(e) => { e.stopPropagation(); loadEntry(state.recentEntryId!) }}>
            Continue: {state.recentEntryTopic}
          </button>
        )}
        <div className="greeting-hint">Tap anywhere to begin writing</div>
      </div>

      {/* Journal Canvas — this IS the notebook page */}
      <div id="canvas" ref={canvasRef} onClick={focusInput}>

        {/* THE WRITING AREA — always present, always at top of canvas flow */}
        <div id="writing-zone" onClick={e => e.stopPropagation()}>
          <textarea
            ref={inputRef}
            id="journal-input"
            placeholder={state.aiInserts.length > 0 || writing ? "Keep writing..." : "Start writing..."}
            value={writing}
            onChange={e => onWritingChange(e.target.value)}
            onFocus={() => s({ inputFocused: true })}
            onBlur={() => s({ inputFocused: false })}
            onKeyDown={e => {
              // Ctrl/Cmd+Enter = "pause & reflect" — manual send to get a response
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                manualSend()
              }
            }}
            disabled={state.busy}
            autoFocus
          />
        </div>

        {/* AI INSERTS — appear below the writing area, like margin notes */}
        {state.aiInserts.length > 0 && (
          <div id="ai-zone" ref={aiZoneRef} onClick={e => e.stopPropagation()}>
            <div className="ai-zone-divider">
              <span className="divider-line" />
              <span className="divider-label">notebook</span>
              <span className="divider-line" />
            </div>
            {state.aiInserts.map((item, i) => {
              if (item.type === 'annotation') return <AiAnnotation key={item.id || i} item={item} onLoadEntry={loadEntry} />
              return <AiConversational key={item.id || i} item={item} onLoadEntry={loadEntry} />
            })}
          </div>
        )}

        {/* Thinking indicator */}
        {state.busy && (
          <div className="thinking-inline" onClick={e => e.stopPropagation()}>
            <span className="t-dot" /><span className="t-dot" /><span className="t-dot" />
          </div>
        )}

        {/* Manual send hint — subtle, only shows when there's unsent text */}
        {hasNewText && !state.busy && (
          <div id="send-hint" onClick={e => { e.stopPropagation(); manualSend() }}>
            <span className="send-hint-text">press to reflect</span>
            <span className="send-hint-key">or Ctrl+Enter</span>
          </div>
        )}
      </div>

      {/* Error */}
      {state.error && (
        <div className="error-bar" onClick={e => e.stopPropagation()}>
          <span className="error-text">{state.error}</span>
          <button className="error-close" onClick={() => s({ error: null })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
      )}

      <SidePanel open={state.panelOpen} onClose={() => s({ panelOpen: false })} onLoadEntry={loadEntry} />

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
#app { min-height: 100dvh; }

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
#topbar { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; z-index: 100; padding-top: max(12px, env(safe-area-inset-top)); background: var(--bg); background: linear-gradient(to bottom, var(--bg) 60%, transparent); }
.topbar-title { flex: 1; text-align: center; font-family: 'DM Sans', sans-serif; font-size: 0.7rem; color: var(--text-light); letter-spacing: 0.04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 8px; }
.topbar-right { display: flex; gap: 2px; }
.tbtn { background: none; border: none; cursor: pointer; color: var(--text-light); padding: 10px; border-radius: 10px; transition: all 0.25s; opacity: 0.4; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.tbtn:hover { opacity: 1; color: var(--text-muted); background: var(--hover-bg); }
.tbtn:active { opacity: 1; transform: scale(0.92); }

/* ═══ Journal Canvas ═══ */
#canvas { max-width: 680px; width: 100%; margin: 0 auto; padding: 64px 24px 80px; min-height: 100dvh; cursor: text; }

/* ═══ Writing Zone — THE notebook page ═══ */
#writing-zone { cursor: text; }
#journal-input {
  width: 100%; border: none; outline: none; background: transparent;
  font-family: 'Source Serif 4', Georgia, serif; font-size: inherit;
  color: var(--text); line-height: 1.8; resize: none;
  min-height: 40vh; overflow: hidden;
  caret-color: var(--accent);
}
#journal-input::placeholder { color: var(--text-light); opacity: 0.4; font-style: italic; }
#journal-input:disabled { opacity: 0.7; }

/* ═══ AI Zone — inserts below the writing ═══ */
#ai-zone { margin-top: 24px; }
.ai-zone-divider { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.divider-line { flex: 1; height: 1px; background: var(--divider); }
.divider-label { font-family: 'DM Sans', sans-serif; font-size: 0.6rem; color: var(--text-light); letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.6; flex-shrink: 0; }

/* AI Annotation — margin note with accent bar */
.ai-annotation { display: flex; gap: 0; margin: 0 0 16px; animation: aiFade 0.5s ease; cursor: default; }
.anno-accent { width: 3px; border-radius: 2px; background: var(--annotation-border); opacity: 0.5; flex-shrink: 0; }
.anno-inner { padding: 6px 0 6px 16px; font-size: 0.86rem; color: var(--text-muted); line-height: 1.65; }
.anno-content { white-space: pre-wrap; word-break: break-word; }
.anno-link { font-family: 'DM Sans', sans-serif; font-size: 0.68rem; color: var(--accent); cursor: pointer; margin-top: 4px; display: inline-block; text-decoration: underline; text-underline-offset: 2px; opacity: 0.8; }
.anno-link:hover { opacity: 1; }

/* AI Conversational — gentle card, not a chat bubble */
.ai-conversational { margin: 0 0 16px; padding: 16px 20px; background: var(--conv-bg); border-radius: 14px; animation: aiFade 0.5s ease; position: relative; cursor: default; }
.conv-marker { position: absolute; top: -6px; left: 16px; width: 20px; height: 20px; border-radius: 50%; background: var(--bg); border: 2px solid var(--divider); display: flex; align-items: center; justify-content: center; color: var(--accent); }
.conv-content { white-space: pre-wrap; word-break: break-word; padding-top: 4px; font-size: 0.92rem; }

/* ═══ Thinking ═══ */
.thinking, .thinking-inline { display: flex; gap: 5px; padding: 8px 2px; }
.thinking-inline { margin: 16px 0 8px; cursor: default; }
.t-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: 0.25; animation: breathe 1.4s ease infinite; }
.t-dot:nth-child(2) { animation-delay: 0.2s; }
.t-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes breathe { 0%,100% { opacity: 0.15; transform: scale(0.8); } 50% { opacity: 0.55; transform: scale(1.15); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes aiFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* ═══ Send Hint ═══ */
#send-hint {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 24px; padding: 14px 24px;
  cursor: pointer; border-radius: 12px;
  background: var(--hover-bg); border: 1px solid var(--divider);
  transition: all 0.25s; opacity: 0.5;
  -webkit-tap-highlight-color: transparent;
}
#send-hint:hover { opacity: 0.8; background: var(--accent-bg); border-color: var(--accent-light); }
#send-hint:active { transform: scale(0.98); opacity: 1; }
.send-hint-text { font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: var(--text-muted); letter-spacing: 0.04em; }
.send-hint-key { font-family: 'DM Sans', sans-serif; font-size: 0.62rem; color: var(--text-light); background: var(--bg-secondary); padding: 2px 8px; border-radius: 4px; }

/* ═══ Error ═══ */
.error-bar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--error-bg); color: white; padding: 12px 18px; border-radius: 14px; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; z-index: 60; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.2); animation: aiFade 0.3s ease; max-width: calc(100vw - 32px); cursor: default; }
.error-text { flex: 1; line-height: 1.4; }
.error-close { background: none; border: none; color: white; cursor: pointer; opacity: 0.7; display: flex; align-items: center; justify-content: center; padding: 4px; }
.error-close:hover { opacity: 1; }

/* ═══ Tools ═══ */
.tool-box { padding: 12px 0 0; }
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
.ecard { padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: background 0.15s; margin-bottom: 2px; }
.ecard:hover { background: var(--hover-bg); }
.ecard-t { font-size: 0.92rem; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.ecard-meta { font-family: 'DM Sans', sans-serif; font-size: 0.68rem; color: var(--text-light); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ecard-date { white-space: nowrap; }
.tag { font-family: 'DM Sans', sans-serif; font-size: 0.6rem; background: var(--tag-bg); color: var(--tag-text); padding: 2px 9px; border-radius: 10px; white-space: nowrap; }

/* ═══ Mobile ═══ */
@media (max-width: 680px) {
  body { font-size: 16px; }
  #canvas { padding: 56px 16px 80px; }
  .greeting-text { font-size: 1.28rem; }
  .ai-conversational { padding: 14px 16px; border-radius: 12px; }
  .anno-inner { font-size: 0.82rem; }
  #topbar { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
  .tbtn { padding: 12px; }
  .panel { width: 88vw; }
  .p-body { padding: 16px; }
  .tool-chart { max-height: 180px; }
  .topbar-title { font-size: 0.62rem; }
  #journal-input { min-height: 50vh; }
  #send-hint { padding: 12px 20px; }
}
@media (max-width: 380px) {
  body { font-size: 15px; }
  #canvas { padding: 52px 12px 70px; }
  .greeting-text { font-size: 1.15rem; }
  .panel { width: 92vw; }
  #journal-input { min-height: 60vh; }
}
@media (min-width: 1024px) {
  body { font-size: 19px; }
  #canvas { padding: 80px 24px 100px; }
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 4px; }
::selection { background: var(--accent-light); color: var(--text); }

@media (hover: none) and (pointer: coarse) {
  .tbtn:hover, .ecard:hover, .p-close:hover, .login-btn:hover, .greeting-continue:hover { background: initial; opacity: initial; color: initial; transform: initial; }
  .tbtn:active { opacity: 1; background: var(--hover-bg); }
  .ecard:active { background: var(--hover-bg); }
  #send-hint:hover { opacity: 0.5; background: var(--hover-bg); border-color: var(--divider); }
  #send-hint:active { opacity: 1; background: var(--accent-bg); border-color: var(--accent-light); }
}
`

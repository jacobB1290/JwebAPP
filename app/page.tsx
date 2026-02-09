'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface Message {
  id?: string
  sender: 'user' | 'ai'
  content: string
  message_type: 'user_message' | 'conversational' | 'annotation'
  tone?: string
  linked_entry_id?: string | null
  tool_call?: any
}

interface AppState {
  authed: boolean
  loading: boolean
  entryId: string | null
  sessionMessages: Message[]
  busy: boolean
  greetingVisible: boolean
  greeting: string
  recentEntryId: string | null
  recentEntryTopic: string | null
  continuationChecked: boolean
  panelOpen: boolean
  theme: 'light' | 'dark'
  error: string | null
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
      if (res.ok) {
        onLogin()
      } else {
        setErr('Wrong password')
      }
    } catch {
      setErr('Connection error')
    }
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
          <input
            ref={inputRef}
            type="password"
            className="login-input"
            placeholder="Password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            disabled={loading}
          />
          <button className="login-btn" onClick={submit} disabled={loading}>
            {loading ? (
              <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            )}
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
        data: {
          labels: data.labels || [],
          datasets: (data.datasets || []).map((ds: any, i: number) => ({
            ...ds,
            backgroundColor: chartColor(i, 0.2),
            borderColor: chartColor(i, 1),
            borderWidth: 2,
            tension: 0.4,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { labels: { font: { family: 'DM Sans' } } } },
          scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.05)' } } },
        },
      })
    }
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [toolCall])

  const toggleCheck = async (idx: number) => {
    if (!messageId) return
    try {
      await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, itemIndex: idx }),
      })
    } catch {}
  }

  return (
    <div className="tool-box">
      {toolCall.title && <div className="tool-head">{toolCall.title}</div>}

      {toolCall.type === 'chart' && <canvas ref={canvasRef} className="tool-chart" />}

      {toolCall.type === 'table' && (
        <div className="tool-tbl-wrap">
          <table className="tool-tbl">
            {data.headers && (
              <thead><tr>{data.headers.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead>
            )}
            <tbody>
              {(data.rows || []).map((row: any[], ri: number) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toolCall.type === 'checklist' && (
        <ChecklistTool items={data.items || []} onToggle={toggleCheck} />
      )}

      {toolCall.type === 'prompt_card' && (
        <div className="tool-prompt">{data.prompt}</div>
      )}

      {toolCall.type === 'tracker' && (
        <div className="tool-tracker">
          <div className="tr-metric">{data.metric}</div>
          {(data.values || []).map((v: any, i: number) => (
            <div key={i} className="tr-pt">
              <span className="tr-val">{v.value}</span>
              <span className="tr-unit">{data.unit || ''}</span>
              <span className="tr-date">{v.date || ''}</span>
            </div>
          ))}
        </div>
      )}

      {toolCall.type === 'link_card' && (
        <div className="tool-link-card">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <div>
            <div style={{ fontSize: '0.85rem' }}>{data.title || 'Past Entry'}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{data.date || ''}</div>
          </div>
        </div>
      )}

      {toolCall.type === 'calendar_view' && (
        <div className="tool-calendar">
          {(data.events || []).map((ev: any, i: number) => (
            <div key={i} className="cal-event">
              <span className="cal-date">{ev.date}</span>
              <span className="cal-title">{ev.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChecklistTool({ items, onToggle }: { items: any[]; onToggle: (i: number) => void }) {
  const [state, setState] = useState(items)
  const toggle = (i: number) => {
    setState(prev => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item))
    onToggle(i)
  }
  return (
    <ul className="tool-cl">
      {state.map((item, i) => (
        <li key={i} className={item.checked ? 'done' : ''} onClick={() => toggle(i)}>
          <span className="cl-icon">
            {item.checked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <span className="cl-txt">{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

function chartColor(i: number, a: number) {
  const colors = [
    `rgba(196,119,90,${a})`, `rgba(154,176,142,${a})`, `rgba(178,148,120,${a})`,
    `rgba(132,120,160,${a})`, `rgba(180,130,140,${a})`,
  ]
  return colors[i % colors.length]
}

// ═══════════════════════════════════════════
// MESSAGE COMPONENT
// ═══════════════════════════════════════════

function MessageBubble({ msg, onLoadEntry }: { msg: Message; onLoadEntry: (id: string) => void }) {
  if (msg.sender === 'user' || msg.message_type === 'user_message') {
    return <div className="msg-user"><div className="msg-user-inner">{msg.content}</div></div>
  }

  if (msg.message_type === 'annotation') {
    return (
      <div className="msg-ai-anno">
        <div className="anno-content">{msg.content}</div>
        <div className="anno-foot">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          <span>note</span>
          {msg.linked_entry_id && (
            <>
              <span className="anno-dot">·</span>
              <span className="anno-link" onClick={() => onLoadEntry(msg.linked_entry_id!)}>linked entry</span>
            </>
          )}
        </div>
        {msg.tool_call && <ToolRender toolCall={msg.tool_call} messageId={msg.id} />}
      </div>
    )
  }

  // conversational
  return (
    <div className="msg-ai-conv">
      <div className="ai-mark">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <line x1="16" y1="8" x2="2" y2="22" />
          <line x1="17.5" y1="15" x2="9" y2="15" />
        </svg>
      </div>
      <div className="conv-content">{msg.content}</div>
      {msg.tool_call && <ToolRender toolCall={msg.tool_call} messageId={msg.id} />}
    </div>
  )
}

// ═══════════════════════════════════════════
// SIDE PANEL
// ═══════════════════════════════════════════

function SidePanel({
  open,
  onClose,
  onLoadEntry,
}: {
  open: boolean
  onClose: () => void
  onLoadEntry: (id: string) => void
}) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) loadEntries()
  }, [open])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/entries')
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
      }
    } catch {}
    setLoading(false)
  }

  // Group by folder
  const grouped: Record<string, any[]> = {}
  const uncategorized: any[] = []
  for (const e of entries) {
    if (e.folder_name) {
      if (!grouped[e.folder_name]) grouped[e.folder_name] = []
      grouped[e.folder_name].push(e)
    } else {
      uncategorized.push(e)
    }
  }

  return (
    <>
      <div className={`panel-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`panel ${open ? 'open' : ''}`}>
        <div className="p-head">
          <span className="p-title">Your Notebook</span>
          <button className="p-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-body">
          {loading && (
            <div className="p-loading">
              <div className="thinking"><span className="t-dot" /><span className="t-dot" /><span className="t-dot" /></div>
            </div>
          )}
          {!loading && entries.length === 0 && (
            <div className="p-empty">No entries yet. Start writing to create your first entry.</div>
          )}
          {Object.entries(grouped).map(([folder, ents]) => (
            <div key={folder} className="fgrp">
              <div className="fname">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {folder}
              </div>
              {ents.map(e => (
                <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} />
              ))}
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div className="fgrp">
              <div className="fname">Uncategorized</div>
              {uncategorized.map(e => (
                <EntryCard key={e.id} entry={e} onClick={() => { onLoadEntry(e.id); onClose() }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function EntryCard({ entry, onClick }: { entry: any; onClick: () => void }) {
  const date = new Date(entry.created_at || entry.updated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const emotionTags = (entry.emotion_tags || []).slice(0, 2)
  const topicTags = (entry.topic_tags || []).slice(0, 2)

  return (
    <div className="ecard" onClick={onClick}>
      <div className="ecard-t">{entry.title || 'Untitled'}</div>
      <div className="ecard-meta">
        <span className="ecard-date">{date}</span>
        {emotionTags.length > 0 && (
          <span className="ecard-dot">·</span>
        )}
        {emotionTags.map((t: string, i: number) => (
          <span key={`e-${i}`} className="tag tag-emotion">{t}</span>
        ))}
        {topicTags.map((t: string, i: number) => (
          <span key={`t-${i}`} className="tag tag-topic">{t}</span>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// NEW ENTRY BUTTON
// ═══════════════════════════════════════════

function NewEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="new-entry-btn" onClick={onClick} title="New entry">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  )
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

export default function Home() {
  const [state, setState] = useState<AppState>({
    authed: false,
    loading: true,
    entryId: null,
    sessionMessages: [],
    busy: false,
    greetingVisible: true,
    greeting: '',
    recentEntryId: null,
    recentEntryTopic: null,
    continuationChecked: false,
    panelOpen: false,
    theme: 'light',
    error: null,
  })
  const [input, setInput] = useState('')
  const streamRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentRef = useRef('')

  const s = useCallback((update: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...update }))
  }, [])

  // ─── Init theme ───
  useEffect(() => {
    const saved = localStorage.getItem('sn-th')
    const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark')
      s({ theme: 'dark' })
    }
  }, [s])

  // ─── Check auth on load ───
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/init')
      if (res.ok) {
        const data = await res.json()
        s({
          authed: true,
          loading: false,
          greeting: data.greeting,
          recentEntryId: data.recentEntryId,
          recentEntryTopic: data.recentEntryTopic,
        })
      } else if (res.status === 401) {
        s({ authed: false, loading: false })
      } else {
        const data = await res.json().catch(() => ({}))
        s({ authed: false, loading: false, error: data.error || 'Failed to connect' })
      }
    } catch {
      s({ authed: false, loading: false, error: 'Failed to connect' })
    }
  }

  const onLogin = async () => {
    s({ loading: true })
    await checkAuth()
  }

  // ─── Theme toggle ───
  const toggleTheme = () => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    localStorage.setItem('sn-th', next)
    s({ theme: next })
  }

  // ─── Scroll to bottom ───
  const scrollToBottom = () => {
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 80)
  }

  // ─── Fade greeting ───
  const fadeGreeting = () => {
    if (!state.greetingVisible) return
    s({ greetingVisible: false })
  }

  // ─── New entry ───
  const newEntry = () => {
    s({
      entryId: null,
      sessionMessages: [],
      continuationChecked: false,
      greetingVisible: true,
      error: null,
    })
    lastSentRef.current = ''
    setInput('')
    inputRef.current?.focus()
  }

  // ─── Load entry ───
  const loadEntry = async (entryId: string) => {
    try {
      const res = await fetch(`/api/entries/${entryId}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.entry) return
      fadeGreeting()
      s({
        entryId,
        sessionMessages: (data.messages || []).map((m: any) => ({
          id: m.id, sender: m.sender, content: m.content,
          message_type: m.message_type, tone: m.tone,
          linked_entry_id: m.linked_entry_id, tool_call: m.tool_call,
        })),
        panelOpen: false,
        error: null,
      })
      scrollToBottom()
    } catch {}
  }

  // ─── Continuation check ───
  const checkContinuation = async (text: string) => {
    if (state.continuationChecked || !text.trim()) return
    s({ continuationChecked: true })
    try {
      const res = await fetch('/api/continuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (data.isContinuation && data.entryId) {
        s({
          entryId: data.entryId,
          sessionMessages: (data.messages || []).map((m: any) => ({
            id: m.id, sender: m.sender, content: m.content,
            message_type: m.message_type, tone: m.tone,
            linked_entry_id: m.linked_entry_id, tool_call: m.tool_call,
          })),
        })
        scrollToBottom()
      }
    } catch {}
  }

  // ─── Send message ───
  const sendMessage = async (text: string, userRequested: boolean) => {
    if (state.busy || !text.trim()) return
    s({ busy: true, error: null })

    const userMsg: Message = {
      sender: 'user', content: text, message_type: 'user_message',
    }
    const updated = [...state.sessionMessages, userMsg]
    s({ sessionMessages: updated })
    scrollToBottom()

    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          entryId: state.entryId,
          sessionMessages: updated.map(m => ({ sender: m.sender, content: m.content, type: m.message_type })),
          userRequestedResponse: userRequested,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Something went wrong' }))
        s({ busy: false, error: err.error || 'Something went wrong' })
        return
      }

      const data = await res.json()
      const aiMsgs: Message[] = (data.responses || []).map((r: any) => ({
        id: r.id, sender: 'ai' as const, content: r.content,
        message_type: r.type || 'conversational',
        tone: r.tone, linked_entry_id: r.linked_entry_id,
      }))

      // Attach tool call to last AI message if present
      if (data.toolCall && aiMsgs.length > 0) {
        aiMsgs[aiMsgs.length - 1].tool_call = data.toolCall
      } else if (data.toolCall && aiMsgs.length === 0) {
        aiMsgs.push({
          sender: 'ai', content: '', message_type: 'annotation',
          tool_call: data.toolCall,
        })
      }

      s({
        entryId: data.entryId,
        sessionMessages: [...updated, ...aiMsgs],
        busy: false,
      })
      lastSentRef.current = text
      scrollToBottom()
    } catch (e: any) {
      s({ busy: false, error: 'Network error — check your connection' })
    }
  }

  // ─── Auto-trigger ───
  const resetAutoTrigger = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }

  const startAutoTrigger = (text: string) => {
    resetAutoTrigger()
    if (!text.trim() || text === lastSentRef.current) return
    const lastChar = text.charAt(text.length - 1)
    const delay = ['.', '!', '?'].includes(lastChar) ? 2500 : 6000
    autoTimerRef.current = setTimeout(() => {
      if (input.trim() && input !== lastSentRef.current && !state.busy) {
        sendMessage(input.trim(), false)
        setInput('')
      }
    }, delay)
  }

  // ─── Input change ───
  const onInputChange = (val: string) => {
    setInput(val)
    fadeGreeting()
    if (!state.continuationChecked && val.trim().split(/\s+/).length >= 4) {
      checkContinuation(val.trim())
    }
    startAutoTrigger(val)
  }

  // ─── Break / Send ───
  const doBreak = () => {
    resetAutoTrigger()
    const text = input.trim()
    if (!text) return
    fadeGreeting()
    sendMessage(text, true)
    setInput('')
  }

  // ─── Auto-resize textarea ───
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  // ─── Render ───
  if (state.loading) {
    return (
      <div className="login-screen">
        <div className="thinking" style={{ justifyContent: 'center' }}>
          <span className="t-dot" /><span className="t-dot" /><span className="t-dot" />
        </div>
      </div>
    )
  }

  if (!state.authed) {
    return <LoginScreen onLogin={onLogin} />
  }

  return (
    <div id="app">
      {/* Top Bar */}
      <div id="topbar">
        <NewEntryButton onClick={newEntry} />
        <div className="topbar-right">
          <button className="tbtn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {state.theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button className="tbtn tbtn-entries" onClick={() => s({ panelOpen: true })} title="Browse entries" aria-label="Browse entries">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div
        id="greeting-screen"
        className={!state.greetingVisible ? 'fading' : ''}
        style={!state.greetingVisible ? { pointerEvents: 'none' } : {}}
      >
        <div className="greeting-text">{state.greeting}</div>
        {state.recentEntryId && state.recentEntryTopic && (
          <button className="greeting-continue" onClick={() => loadEntry(state.recentEntryId!)}>
            Continue: {state.recentEntryTopic}
          </button>
        )}
        <div className="greeting-hint">Start typing below to begin</div>
      </div>

      {/* Writing Area */}
      <div id="writing-area">
        <div id="stream" ref={streamRef}>
          {state.sessionMessages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} onLoadEntry={loadEntry} />
          ))}
          {state.busy && (
            <div className="thinking">
              <span className="t-dot" /><span className="t-dot" /><span className="t-dot" />
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="error-bar">
          <span className="error-text">{state.error}</span>
          <button className="error-close" onClick={() => s({ error: null })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <div id="input-area">
        <div id="input-box">
          <textarea
            ref={inputRef}
            id="tinput"
            rows={1}
            placeholder="What's on your mind..."
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doBreak() }
              if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); doBreak() }
            }}
            disabled={state.busy}
            autoFocus
          />
          <button id="bbtn" onClick={doBreak} disabled={state.busy || !input.trim()} title="Send (Ctrl+Enter)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="send-hint">Ctrl+Enter or Shift+Enter to send</div>
      </div>

      {/* Side Panel */}
      <SidePanel open={state.panelOpen} onClose={() => s({ panelOpen: false })} onLoadEntry={loadEntry} />

      <style jsx global>{styles}</style>
    </div>
  )
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════

const styles = `
/* ═══ Theme Variables ═══ */
:root {
  --bg: #FAF7F2;
  --bg-secondary: #F3EDE4;
  --text: #2C2520;
  --text-muted: #8A7E74;
  --text-light: #B5AA9E;
  --accent: #C4775A;
  --accent-light: #E8C4B4;
  --accent-bg: #FDF5F0;
  --user-bubble-bg: #F0EAE0;
  --user-bubble-border: #E4DDD3;
  --ai-bubble-bg: #EDE8DF;
  --ai-bubble-border: #DDD6CA;
  --annotation-border: #C4775A;
  --divider: #E4DDD3;
  --shadow: rgba(44,37,32,0.06);
  --shadow-md: rgba(44,37,32,0.1);
  --panel-bg: #FAF7F2;
  --panel-border: #E4DDD3;
  --input-bg: #FFFFFF;
  --input-border: #E4DDD3;
  --tag-bg: #F0EAE0;
  --tag-text: #8A7E74;
  --tag-emotion-bg: #FDF5F0;
  --tag-emotion-text: #C4775A;
  --hover-bg: #F0EAE0;
  --error-bg: #c0392b;
}
[data-theme="dark"] {
  --bg: #1A1714;
  --bg-secondary: #242018;
  --text: #E8E0D6;
  --text-muted: #8A7E74;
  --text-light: #5A524A;
  --accent: #D4896B;
  --accent-light: #6B4A3A;
  --accent-bg: #2A2018;
  --user-bubble-bg: #2A2520;
  --user-bubble-border: #3A342E;
  --ai-bubble-bg: #252018;
  --ai-bubble-border: #3A342E;
  --annotation-border: #D4896B;
  --divider: #3A342E;
  --shadow: rgba(0,0,0,0.2);
  --shadow-md: rgba(0,0,0,0.3);
  --panel-bg: #1A1714;
  --panel-border: #3A342E;
  --input-bg: #242018;
  --input-border: #3A342E;
  --tag-bg: #2A2520;
  --tag-text: #8A7E74;
  --tag-emotion-bg: #2A2018;
  --tag-emotion-text: #D4896B;
  --hover-bg: #2A2520;
  --error-bg: #a93226;
}

/* ═══ Reset ═══ */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 18px;
  line-height: 1.7;
  color: var(--text);
  background: var(--bg);
  transition: background 0.4s ease, color 0.4s ease;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
}
#app { min-height: 100dvh; display: flex; flex-direction: column; }

/* ═══ Spinner ═══ */
.spin { animation: spinAnim 0.8s linear infinite; }
@keyframes spinAnim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ═══ Login ═══ */
.login-screen {
  min-height: 100dvh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; background: var(--bg);
  padding: 24px;
}
.login-content {
  display: flex; flex-direction: column; align-items: center;
  width: 100%; max-width: 340px;
}
.login-icon {
  color: var(--accent); margin-bottom: 20px;
  opacity: 0; animation: fadeUp 0.7s ease 0.2s forwards;
}
.login-title {
  font-size: 1.5rem; font-weight: 300; color: var(--text);
  margin-bottom: 6px; letter-spacing: -0.01em;
  opacity: 0; animation: fadeUp 0.7s ease 0.35s forwards;
}
.login-sub {
  font-family: 'DM Sans', sans-serif; font-size: 0.88rem;
  color: var(--text-muted); margin-bottom: 32px;
  opacity: 0; animation: fadeUp 0.6s ease 0.5s forwards;
}
.login-form {
  display: flex; gap: 8px; width: 100%;
  opacity: 0; animation: fadeUp 0.6s ease 0.65s forwards;
}
.login-input {
  flex: 1; border: 1px solid var(--input-border); border-radius: 14px;
  padding: 14px 18px; font-family: 'DM Sans', sans-serif; font-size: 16px;
  background: var(--input-bg); color: var(--text); outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.login-input:focus {
  border-color: var(--accent-light);
  box-shadow: 0 0 0 3px rgba(196,119,90,0.08);
}
.login-btn {
  width: 52px; height: 52px; border-radius: 14px; border: none;
  background: var(--accent); color: white; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, opacity 0.2s; flex-shrink: 0;
}
.login-btn:hover { transform: scale(1.04); }
.login-btn:active { transform: scale(0.96); }
.login-btn:disabled { opacity: 0.5; }
.login-err {
  color: var(--error-bg); font-size: 0.82rem; margin-top: 14px;
  font-family: 'DM Sans', sans-serif;
}

/* ═══ Greeting ═══ */
#greeting-screen {
  position: fixed; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; z-index: 50;
  background: var(--bg); padding: 24px;
  transition: opacity 0.7s ease, transform 0.7s ease;
}
#greeting-screen.fading {
  opacity: 0; transform: translateY(-12px); pointer-events: none;
}
.greeting-text {
  font-size: 1.45rem; font-weight: 300; color: var(--text);
  text-align: center; max-width: 480px; line-height: 1.5;
  opacity: 0; animation: fadeUp 0.9s ease 0.3s forwards;
}
.greeting-continue {
  margin-top: 20px; font-family: 'DM Sans', sans-serif;
  font-size: 0.88rem; color: var(--text-muted);
  background: none; border: none; cursor: pointer;
  padding: 8px 16px; border-radius: 10px;
  transition: color 0.2s, background 0.2s;
  opacity: 0; animation: fadeUp 0.7s ease 0.9s forwards;
}
.greeting-continue:hover { color: var(--accent); background: var(--hover-bg); }
.greeting-hint {
  margin-top: 48px; font-family: 'DM Sans', sans-serif;
  font-size: 0.72rem; color: var(--text-light); letter-spacing: 0.05em;
  opacity: 0; animation: fadeUp 0.6s ease 1.4s forwards;
  text-transform: uppercase;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ═══ Top Bar ═══ */
#topbar {
  position: fixed; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; z-index: 100;
  padding-top: max(12px, env(safe-area-inset-top));
}
.topbar-right { display: flex; gap: 2px; }
.tbtn {
  background: none; border: none; cursor: pointer; color: var(--text-light);
  padding: 10px; border-radius: 10px;
  transition: all 0.25s; opacity: 0.4;
  -webkit-tap-highlight-color: transparent; display: flex;
  align-items: center; justify-content: center;
}
.tbtn:hover { opacity: 1; color: var(--text-muted); background: var(--hover-bg); }
.tbtn:active { opacity: 1; transform: scale(0.92); }
.new-entry-btn {
  background: none; border: none; cursor: pointer; color: var(--text-light);
  padding: 10px; border-radius: 10px;
  transition: all 0.25s; opacity: 0.4;
  -webkit-tap-highlight-color: transparent; display: flex;
  align-items: center; justify-content: center;
}
.new-entry-btn:hover { opacity: 1; color: var(--accent); background: var(--hover-bg); }
.new-entry-btn:active { transform: scale(0.92); }

/* ═══ Writing Area ═══ */
#writing-area {
  flex: 1; display: flex; flex-direction: column;
  max-width: 680px; width: 100%; margin: 0 auto;
  padding: 72px 20px 190px;
}
#stream { flex: 1; display: flex; flex-direction: column; gap: 16px; }

/* ═══ Messages ═══ */
.msg-user {
  align-self: flex-end; max-width: 82%;
  animation: msgSlide 0.3s ease;
}
.msg-user-inner {
  background: var(--user-bubble-bg);
  border: 1px solid var(--user-bubble-border);
  border-radius: 20px 20px 6px 20px;
  padding: 14px 20px;
  box-shadow: 0 1px 4px var(--shadow);
  white-space: pre-wrap; word-break: break-word;
}
.msg-ai-conv {
  align-self: flex-start; max-width: 82%;
  background: var(--ai-bubble-bg);
  border: 1px solid var(--ai-bubble-border);
  border-radius: 20px 20px 20px 6px;
  padding: 14px 20px;
  box-shadow: 0 1px 4px var(--shadow);
  animation: aiFade 0.45s ease;
}
.ai-mark {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  color: var(--accent); opacity: 0.6;
}
.conv-content { white-space: pre-wrap; word-break: break-word; }
.msg-ai-anno {
  align-self: flex-start; max-width: 78%;
  padding: 10px 16px 10px 18px;
  border-left: 3px solid var(--annotation-border);
  font-size: 0.87rem; color: var(--text-muted); line-height: 1.65;
  animation: aiFade 0.45s ease;
}
.anno-content { white-space: pre-wrap; word-break: break-word; }
.anno-foot {
  margin-top: 8px; font-family: 'DM Sans', sans-serif; font-size: 0.66rem;
  color: var(--text-light); display: flex; align-items: center; gap: 5px;
}
.anno-dot { opacity: 0.5; }
.anno-link {
  color: var(--accent); cursor: pointer; transition: opacity 0.2s;
  text-decoration: underline; text-underline-offset: 2px;
}
.anno-link:hover { opacity: 0.7; }

/* ═══ Tools ═══ */
.tool-box { padding: 12px 0 0; }
.tool-head {
  font-family: 'DM Sans', sans-serif; font-size: 0.72rem; font-weight: 500;
  color: var(--text-muted); margin-bottom: 10px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.tool-chart { max-height: 220px; width: 100%; }
.tool-tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -4px; padding: 0 4px; }
.tool-tbl { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.tool-tbl th {
  font-family: 'DM Sans', sans-serif; font-weight: 500;
  text-align: left; padding: 8px 10px;
  border-bottom: 2px solid var(--divider);
  color: var(--text-muted); font-size: 0.72rem;
  text-transform: uppercase; letter-spacing: 0.04em;
  white-space: nowrap;
}
.tool-tbl td { padding: 8px 10px; border-bottom: 1px solid var(--divider); }
.tool-cl { list-style: none; }
.tool-cl li {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 0; cursor: pointer; transition: opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.tool-cl li:hover { opacity: 0.8; }
.cl-icon {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--divider);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; flex-shrink: 0;
  color: transparent;
}
.tool-cl li.done .cl-icon {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.tool-cl li.done .cl-txt {
  text-decoration: line-through; color: var(--text-muted);
}
.cl-txt { font-size: 0.9rem; }
.tool-prompt {
  background: var(--accent-bg); border: 1px solid var(--accent-light);
  border-radius: 12px; padding: 14px 18px;
  font-style: italic; color: var(--text-muted); font-size: 0.92rem;
}
.tool-tracker { display: flex; gap: 8px; flex-wrap: wrap; }
.tr-metric {
  width: 100%; font-family: 'DM Sans', sans-serif;
  font-size: 0.72rem; color: var(--text-light);
  text-transform: uppercase; letter-spacing: 0.04em;
  margin-bottom: 2px;
}
.tr-pt {
  background: var(--tag-bg); border-radius: 10px;
  padding: 6px 14px; font-family: 'DM Sans', sans-serif;
  font-size: 0.78rem; color: var(--text-muted);
  display: flex; align-items: baseline; gap: 4px;
}
.tr-val { font-weight: 600; color: var(--accent); font-size: 0.88rem; }
.tr-unit { opacity: 0.7; font-size: 0.7rem; }
.tr-date { opacity: 0.5; font-size: 0.62rem; margin-left: 4px; }
.tool-link-card {
  background: var(--accent-bg); border: 1px solid var(--accent-light);
  border-radius: 12px; padding: 12px 16px; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  transition: transform 0.15s;
}
.tool-link-card:active { transform: scale(0.98); }
.tool-calendar { font-family: 'DM Sans', sans-serif; font-size: 0.84rem; }
.cal-event {
  padding: 5px 0; display: flex; gap: 10px; align-items: baseline;
  border-bottom: 1px solid var(--divider);
}
.cal-event:last-child { border-bottom: none; }
.cal-date { color: var(--accent); font-weight: 500; font-size: 0.78rem; white-space: nowrap; }
.cal-title { color: var(--text-muted); }

/* ═══ Thinking ═══ */
.thinking { align-self: flex-start; display: flex; gap: 5px; padding: 12px 6px; }
.t-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--accent); opacity: 0.25;
  animation: breathe 1.4s ease infinite;
}
.t-dot:nth-child(2) { animation-delay: 0.2s; }
.t-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes breathe {
  0%,100% { opacity: 0.15; transform: scale(0.8); }
  50% { opacity: 0.55; transform: scale(1.15); }
}
@keyframes msgSlide {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes aiFade {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ═══ Error ═══ */
.error-bar {
  position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%);
  background: var(--error-bg); color: white; padding: 12px 18px;
  border-radius: 14px; font-family: 'DM Sans', sans-serif;
  font-size: 0.82rem; z-index: 60;
  display: flex; align-items: center; gap: 14px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
  animation: msgSlide 0.3s ease;
  max-width: calc(100vw - 32px);
}
.error-text { flex: 1; line-height: 1.4; }
.error-close {
  background: none; border: none; color: white;
  cursor: pointer; opacity: 0.7; display: flex;
  align-items: center; justify-content: center;
  padding: 4px; flex-shrink: 0;
}
.error-close:hover { opacity: 1; }

/* ═══ Input ═══ */
#input-area {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: linear-gradient(transparent 0%, var(--bg) 30%);
  padding: 20px 16px; z-index: 40;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}
#input-box {
  max-width: 680px; margin: 0 auto; display: flex;
  align-items: flex-end; gap: 8px;
  background: var(--input-bg); border: 1px solid var(--input-border);
  border-radius: 18px; padding: 12px 14px;
  box-shadow: 0 2px 20px var(--shadow-md);
  transition: border-color 0.25s, box-shadow 0.25s;
}
#input-box:focus-within {
  border-color: var(--accent-light);
  box-shadow: 0 2px 24px var(--shadow-md), 0 0 0 3px rgba(196,119,90,0.07);
}
#tinput {
  flex: 1; border: none; outline: none; background: transparent;
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 16px; color: var(--text); line-height: 1.6;
  resize: none; max-height: 200px; overflow-y: auto;
  min-height: 24px;
}
#tinput::placeholder { color: var(--text-light); }
#bbtn {
  background: none; border: none; cursor: pointer;
  color: var(--text-light); padding: 6px;
  transition: color 0.2s, transform 0.15s;
  flex-shrink: 0; display: flex; align-items: center;
  justify-content: center; border-radius: 10px;
}
#bbtn:hover { color: var(--accent); }
#bbtn:active { transform: scale(0.92); }
#bbtn:disabled { opacity: 0.2; pointer-events: none; }
.send-hint {
  text-align: center; margin-top: 4px;
  font-family: 'DM Sans', sans-serif; font-size: 0.58rem;
  color: var(--text-light); opacity: 0.5;
  max-width: 680px; margin-left: auto; margin-right: auto;
}

/* ═══ Panel ═══ */
.panel-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,0.18); z-index: 200;
  opacity: 0; pointer-events: none; transition: opacity 0.35s;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.panel-bg.open { opacity: 1; pointer-events: all; }
.panel {
  position: fixed; top: 0; right: -420px; width: 380px; max-width: 90vw;
  height: 100dvh; background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  z-index: 201; transition: right 0.4s cubic-bezier(0.16,1,0.3,1);
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  display: flex; flex-direction: column;
}
.panel.open { right: 0; }
.p-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 20px 16px;
  padding-top: max(20px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--divider); flex-shrink: 0;
}
.p-title {
  font-family: 'DM Sans', sans-serif; font-size: 0.8rem;
  font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-muted);
}
.p-close {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 8px; border-radius: 8px;
  transition: background 0.15s; display: flex;
  align-items: center; justify-content: center;
}
.p-close:hover { background: var(--hover-bg); }
.p-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.p-loading { padding: 40px 0; display: flex; justify-content: center; }
.p-empty {
  color: var(--text-light); font-size: 0.88rem;
  padding: 40px 0; text-align: center; line-height: 1.6;
}
.fgrp { margin-bottom: 20px; }
.fname {
  font-family: 'DM Sans', sans-serif; font-size: 0.7rem;
  font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-light);
  margin-bottom: 6px; padding-left: 4px;
  display: flex; align-items: center; gap: 6px;
}
.ecard {
  padding: 12px 14px; border-radius: 12px; cursor: pointer;
  transition: background 0.15s; margin-bottom: 2px;
  -webkit-tap-highlight-color: transparent;
}
.ecard:hover { background: var(--hover-bg); }
.ecard:active { background: var(--hover-bg); }
.ecard-t { font-size: 0.92rem; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.ecard-meta {
  font-family: 'DM Sans', sans-serif; font-size: 0.68rem;
  color: var(--text-light); display: flex; align-items: center;
  gap: 4px; flex-wrap: wrap;
}
.ecard-date { white-space: nowrap; }
.ecard-dot { opacity: 0.4; }
.tag {
  font-family: 'DM Sans', sans-serif; font-size: 0.6rem;
  background: var(--tag-bg); color: var(--tag-text);
  padding: 2px 9px; border-radius: 10px; white-space: nowrap;
}
.tag-emotion { background: var(--tag-emotion-bg); color: var(--tag-emotion-text); }

/* ═══ Mobile — Primary ═══ */
@media (max-width: 680px) {
  body { font-size: 16px; }
  #writing-area { padding: 64px 14px 170px; }
  .greeting-text { font-size: 1.28rem; }
  .msg-user, .msg-ai-conv { max-width: 90%; }
  .msg-user-inner { padding: 12px 16px; border-radius: 18px 18px 4px 18px; }
  .msg-ai-conv { padding: 12px 16px; border-radius: 18px 18px 18px 4px; }
  .msg-ai-anno { max-width: 90%; font-size: 0.84rem; }
  #input-area { padding: 14px 12px; padding-bottom: max(14px, env(safe-area-inset-bottom)); }
  #input-box { padding: 10px 12px; border-radius: 16px; }
  .panel { width: 88vw; }
  .p-body { padding: 16px; }
  .login-title { font-size: 1.35rem; }
  #topbar { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
  .tbtn { padding: 12px; }
  .new-entry-btn { padding: 12px; }
  .send-hint { font-size: 0.55rem; }
  .tool-chart { max-height: 180px; }
}

/* ═══ Small Mobile ═══ */
@media (max-width: 380px) {
  body { font-size: 15px; }
  #writing-area { padding: 56px 10px 160px; }
  .greeting-text { font-size: 1.15rem; }
  .msg-user, .msg-ai-conv { max-width: 92%; }
  .msg-user-inner { padding: 10px 14px; }
  .msg-ai-conv { padding: 10px 14px; }
  #input-box { padding: 8px 10px; border-radius: 14px; }
  .panel { width: 92vw; }
}

/* ═══ Large Desktop ═══ */
@media (min-width: 1024px) {
  #tinput { font-size: 18px; }
  #writing-area { padding: 80px 20px 190px; }
}

/* ═══ Scrollbar ═══ */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-light); }

/* ═══ Selection ═══ */
::selection { background: var(--accent-light); color: var(--text); }

/* ═══ Touch optimizations ═══ */
@media (hover: none) and (pointer: coarse) {
  .tbtn:hover, .new-entry-btn:hover, .ecard:hover, .p-close:hover,
  .login-btn:hover, #bbtn:hover, .tool-cl li:hover, .greeting-continue:hover {
    background: initial; opacity: initial; color: initial; transform: initial;
  }
  .tbtn:active { opacity: 1; background: var(--hover-bg); }
  .new-entry-btn:active { opacity: 1; color: var(--accent); }
  .ecard:active { background: var(--hover-bg); }
  .tool-cl li:active { opacity: 0.8; }
}
`

import { NextRequest, NextResponse } from 'next/server'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel Pro allows up to 60s; Hobby up to 10s. This route needs time for Chromium.
export const maxDuration = 60

// ═══════════════════════════════════════════
// Chromium + Puppeteer — works on both Vercel and local dev
//
// On Vercel:  @sparticuz/chromium-min downloads a minimal Chromium binary
//             from a remote tar at first invocation (~40MB), caches it in /tmp
// Locally:    Uses playwright-core's local Chromium if available, else falls
//             back to chromium-min the same way.
// ═══════════════════════════════════════════

const CHROMIUM_REMOTE_TAR =
  'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'

async function getBrowser() {
  const chromiumMin = (await import('@sparticuz/chromium-min')).default
  const puppeteer = (await import('puppeteer-core')).default

  const execPath = await chromiumMin.executablePath(CHROMIUM_REMOTE_TAR)

  const browser = await puppeteer.launch({
    args: chromiumMin.args,
    defaultViewport: { width: 1440, height: 900 },
    executablePath: execPath,
    headless: true,
  })

  return browser
}

// ─── Supported sources ───
type ConversationSource = 'genspark' | 'gemini'

function detectSource(hostname: string): ConversationSource | null {
  if (hostname.includes('genspark.ai')) return 'genspark'
  if (hostname.includes('gemini.google.com')) return 'gemini'
  return null
}

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const body = await request.json()
    const { url } = body

    if (!url?.trim()) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.trim())
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    const source = detectSource(parsedUrl.hostname)
    if (!source) {
      return NextResponse.json({
        error: 'URL must be from genspark.ai or gemini.google.com',
      }, { status: 400 })
    }

    // Extract conversation data using headless Chromium
    const result = source === 'gemini'
      ? await extractGeminiConversation(url.trim())
      : await extractGensparkConversation(url.trim())

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (!result.messages || result.messages.length === 0) {
      return NextResponse.json({
        error: 'No conversation messages found. The page may require login, or the conversation format is not supported.',
      }, { status: 400 })
    }

    return NextResponse.json({
      title: result.title || 'Imported Conversation',
      messages: result.messages,
      messageCount: result.messages.length,
      model: result.model || null,
      source,
      // Compaction metadata — lets the frontend show "X older messages recovered"
      wasCompacted: result.wasCompacted || false,
      compactedMessageCount: result.compactedMessageCount || 0,
    })
  } catch (err: any) {
    console.error('Import preview error:', err?.message || err)
    return NextResponse.json({
      error: 'Failed to load the conversation. The page may be temporarily unavailable — please try again.',
    }, { status: 500 })
  }
}

// ═══════════════════════════════════════════
// GENSPARK EXTRACTION
// Opens the Genspark page in headless Chromium,
// waits for Nuxt to hydrate, reads window.__NUXT__.
// ═══════════════════════════════════════════

interface ExtractResult {
  title?: string
  model?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  error?: string
  /** True if the conversation had a compacted history that was expanded */
  wasCompacted?: boolean
  /** Number of messages recovered from the compaction summary */
  compactedMessageCount?: number
}

// ═══════════════════════════════════════════
// COMPACTION PARSER
// When Genspark compacts a long conversation, it collapses older messages
// into a single "user" message that starts with "**Conversation History**:"
// and ends with a row of asterisks ("**************************************************").
// Each original message is prefixed with one of:
//   **User Message**: ...
//   **Assistant Response**: ...
//   **Tool Result**: ...
// This parser expands that summary back into individual messages.
// ═══════════════════════════════════════════

function parseCompactedHistory(compactedContent: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Strip the header line "**Conversation History**:\n"
  let body = compactedContent
  if (body.startsWith('**Conversation History**:')) {
    body = body.replace(/^\*\*Conversation History\*\*:\s*\n/, '')
  }

  // Strip the trailing separator (a row of asterisks)
  body = body.replace(/\n\*{10,}\s*$/, '').trimEnd()

  // Split into segments using the message-type headers as delimiters.
  // We match `**User Message**:`, `**Assistant Response**:`, or `**Tool Result**:`
  // at the start of a line, splitting on the newline before each header.
  const segments: Array<{ type: string; content: string }> = []

  const parts = body.split(/\n(?=\*\*(?:User Message|Assistant Response|Tool Result)\*\*:)/g)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('**User Message**:')) {
      const content = trimmed.replace(/^\*\*User Message\*\*:\s*/, '').trim()
      if (content) segments.push({ type: 'user', content })
    } else if (trimmed.startsWith('**Assistant Response**:')) {
      const content = trimmed.replace(/^\*\*Assistant Response\*\*:\s*/, '').trim()
      if (content) segments.push({ type: 'assistant', content })
    } else if (trimmed.startsWith('**Tool Result**:')) {
      // Tool results are part of the assistant's turn — append to the previous
      // assistant message, or create a standalone assistant message.
      const content = trimmed.replace(/^\*\*Tool Result\*\*:\s*/, '').trim()
      if (content) {
        // Try to merge with previous assistant message
        const lastSeg = segments[segments.length - 1]
        if (lastSeg && lastSeg.type === 'assistant') {
          lastSeg.content += '\n\n[Tool Result]\n' + content
        } else {
          // Standalone tool result — treat as assistant
          segments.push({ type: 'assistant', content: '[Tool Result]\n' + content })
        }
      }
    }
    // Ignore anything that doesn't match a known header
  }

  // Merge consecutive messages from the same role (sometimes the compaction
  // produces multiple tool-result blocks between user messages).
  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const seg of segments) {
    const role: 'user' | 'assistant' = seg.type === 'user' ? 'user' : 'assistant'
    const last = merged[merged.length - 1]
    if (last && last.role === role) {
      last.content += '\n\n' + seg.content
    } else {
      merged.push({ role, content: seg.content })
    }
  }

  return merged
}

async function extractGensparkConversation(url: string): Promise<ExtractResult> {
  let browser
  try {
    browser = await getBrowser()
    const page = await browser.newPage()

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
      // @ts-ignore
      window.chrome = { runtime: {} }
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await new Promise(r => setTimeout(r, 6000))

    try {
      await page.waitForSelector('.chat-wrapper, .j-chat-agent, .general-chat-wrapper', { timeout: 5000 })
    } catch {
      // Continue — data might still be in __NUXT__
    }

    const result = await page.evaluate(() => {
      try {
        const nuxt = (window as any).__NUXT__
        if (nuxt?.data?.project?.data?.session_state?.messages) {
          const project = nuxt.data.project.data
          const messages = project.session_state.messages

          const parsed: Array<{ role: string; content: string }> = []
          // Track whether the first message is a compaction summary
          let compactedContent: string | null = null

          for (let idx = 0; idx < messages.length; idx++) {
            const m = messages[idx]
            if (!m.role || !m.content) continue

            let content: string
            if (typeof m.content === 'string') {
              content = m.content
            } else if (Array.isArray(m.content)) {
              // Handle multipart content (text + images)
              const parts: string[] = []
              for (const part of m.content) {
                if (part.type === 'text' && part.text) {
                  parts.push(part.text)
                } else if (part.type === 'image_url' && part.image_url?.url) {
                  parts.push(`![image](${part.image_url.url})`)
                }
              }
              content = parts.length > 0 ? parts.join('\n') : '[Image attachment]'
            } else {
              continue
            }

            // Detect compaction summary — always the first message, starts with
            // "**Conversation History**:" and ends with a row of asterisks.
            if (idx === 0 && content.trimStart().startsWith('**Conversation History**:')) {
              compactedContent = content.trim()
              // Don't add the raw compaction blob as a message — it will be parsed
              // server-side and prepended as individual messages.
              continue
            }

            if (m.role === 'user' || m.role === 'assistant') {
              parsed.push({ role: m.role, content: content.trim() })
            }
          }

          return {
            title: project.name || null,
            model: project.chat_model || null,
            messages: parsed,
            compactedContent,
          }
        }

        // Fallback: try Pinia stores
        const pinia = (window as any).__pinia
        if (pinia?._s) {
          for (const entry of pinia._s) {
            const store = entry[1]
            if (store && (store.messages || store.conversation)) {
              const msgs = store.messages || store.conversation
              if (Array.isArray(msgs) && msgs.length > 0) {
                return {
                  title: store.title || store.name || null,
                  model: store.model || null,
                  messages: msgs
                    .filter((m: any) => m.role && m.content)
                    .map((m: any) => ({
                      role: m.role === 'user' ? 'user' : 'assistant',
                      content: typeof m.content === 'string' ? m.content : String(m.content),
                    })),
                  compactedContent: null,
                }
              }
            }
          }
        }

        return { error: 'no_data', title: document.title || null }
      } catch (e: any) {
        return { error: 'extract_failed: ' + e.message }
      }
    })

    await page.close()

    // ─── Expand compacted history into individual messages ───
    const extractResult = result as ExtractResult & { compactedContent?: string | null }
    if (extractResult.compactedContent && extractResult.messages) {
      const olderMessages = parseCompactedHistory(extractResult.compactedContent)
      if (olderMessages.length > 0) {
        // Prepend older messages before the current conversation
        extractResult.messages = [...olderMessages, ...extractResult.messages]
        extractResult.wasCompacted = true
        extractResult.compactedMessageCount = olderMessages.length
      }
      delete (extractResult as any).compactedContent
    }

    return extractResult
  } catch (e: any) {
    console.error('Genspark extraction error:', e.message)
    return { error: 'Failed to load the page: ' + e.message }
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
    }
  }
}

// ═══════════════════════════════════════════
// GOOGLE GEMINI EXTRACTION
// Opens the Gemini share page in headless Chromium,
// waits for the Angular SPA to render, reads the
// share-turn-viewer web components for conversation data.
// ═══════════════════════════════════════════

async function extractGeminiConversation(url: string): Promise<ExtractResult> {
  let browser
  try {
    browser = await getBrowser()
    const page = await browser.newPage()

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })

    // Wait for the Gemini SPA to render — it uses Angular + web components
    await new Promise(r => setTimeout(r, 8000))

    // Try to wait for the share content to appear
    try {
      await page.waitForSelector('share-turn-viewer, message-content, .query-text', { timeout: 8000 })
    } catch {
      // Continue — try extraction anyway
    }

    const result = await page.evaluate(() => {
      try {
        const messages: Array<{ role: string; content: string }> = []

        // Gemini share pages use web components: share-turn-viewer wraps each turn
        const turns = document.querySelectorAll('share-turn-viewer')

        if (turns.length > 0) {
          for (const turn of turns) {
            // User query — inside user-query > .query-text
            const queryEl = turn.querySelector('.query-text')
            if (queryEl) {
              const text = queryEl.textContent?.trim()
              if (text) {
                // Clean up — Gemini sometimes prepends "You said" in the parent
                const cleaned = text.replace(/^You said\s*/i, '').trim()
                messages.push({ role: 'user', content: cleaned || text })
              }
            }

            // AI response — inside message-content
            const responseEl = turn.querySelector('message-content')
            if (responseEl) {
              const text = responseEl.textContent?.trim()
              if (text) {
                messages.push({ role: 'assistant', content: text })
              }
            }

            // Also check for images in responses
            const images = turn.querySelectorAll('message-content img[src]')
            if (images.length > 0) {
              const lastMsg = messages[messages.length - 1]
              if (lastMsg && lastMsg.role === 'assistant') {
                const imgUrls = Array.from(images).map((img: any) => img.src).filter(Boolean)
                if (imgUrls.length > 0) {
                  lastMsg.content += '\n' + imgUrls.map((u: string) => `![image](${u})`).join('\n')
                }
              }
            }
          }
        } else {
          // Fallback: try individual elements
          const queries = document.querySelectorAll('.query-text')
          const responses = document.querySelectorAll('message-content')

          for (let i = 0; i < Math.max(queries.length, responses.length); i++) {
            if (queries[i]) {
              const text = queries[i].textContent?.trim()
              if (text) {
                const cleaned = text.replace(/^You said\s*/i, '').trim()
                messages.push({ role: 'user', content: cleaned || text })
              }
            }
            if (responses[i]) {
              const text = responses[i].textContent?.trim()
              if (text) messages.push({ role: 'assistant', content: text })
            }
          }
        }

        // Extract title from the share page header
        // Gemini puts the title in a specific location on share pages
        let title: string | null = null
        const headerEls = document.querySelectorAll('share-viewer .title, [class*="share-title"], h1')
        for (const el of headerEls) {
          const text = el.textContent?.trim()
          if (text && text.length > 2 && text.length < 200 && !text.includes('Gemini')) {
            title = text
            break
          }
        }

        // Fallback: extract from page metadata or body text
        if (!title) {
          const bodyText = document.body?.innerText || ''
          // Look for the title pattern in the share page
          const titleMatch = bodyText.match(/^(.+?)\nhttps:\/\/gemini\.google\.com/m)
          if (titleMatch) {
            title = titleMatch[1].trim()
          }
        }

        return {
          title: title || null,
          model: 'Gemini',
          messages,
        }
      } catch (e: any) {
        return { error: 'extract_failed: ' + e.message }
      }
    })

    await page.close()

    // Clean the title — remove URL and metadata suffix if present
    if (result.title) {
      result.title = result.title
        .replace(/\s*https:\/\/gemini\.google\.com\S*/g, '')
        .replace(/\s*Created with.*$/s, '')
        .trim()
    }

    return result as ExtractResult
  } catch (e: any) {
    console.error('Gemini extraction error:', e.message)
    return { error: 'Failed to load the Gemini page: ' + e.message }
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
    }
  }
}

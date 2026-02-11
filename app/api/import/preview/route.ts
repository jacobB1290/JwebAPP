import { NextRequest, NextResponse } from 'next/server'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Extract messages from a Genspark shared conversation page
// Genspark pages are SPAs but the shared/public pages render server-side HTML
// containing conversation data we can parse.

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { url } = await request.json()

    if (!url?.trim()) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    }

    // Validate URL is from genspark.ai
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.trim())
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    if (!parsedUrl.hostname.includes('genspark.ai')) {
      return NextResponse.json({ error: 'URL must be from genspark.ai' }, { status: 400 })
    }

    // Fetch the page
    const res = await fetch(url.trim(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch page (${res.status}). Make sure the conversation is set to public.` }, { status: 400 })
    }

    const html = await res.text()

    // Try to extract conversation data from the HTML
    const messages = extractMessages(html)

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No conversation messages found. Make sure the link is a shared public conversation.' }, { status: 400 })
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    let title = titleMatch ? titleMatch[1].replace(/\s*[-|]\s*Genspark.*$/i, '').trim() : 'Imported Conversation'
    if (!title || title === 'Genspark') title = 'Imported Conversation'

    return NextResponse.json({
      title,
      messages,
      messageCount: messages.length,
    })
  } catch (err: any) {
    console.error('Import preview error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to process the conversation link' }, { status: 500 })
  }
}

function extractMessages(html: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Strategy 1: Look for JSON data embedded in the page (common in SSR/hydration)
  // Genspark often embeds conversation data in a __NEXT_DATA__ or similar script tag
  const jsonPatterns = [
    /__NEXT_DATA__.*?<\/script>/s,
    /window\.__INITIAL_STATE__\s*=\s*({.*?});?\s*<\/script>/s,
    /window\.__data\s*=\s*({.*?});?\s*<\/script>/s,
    /<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs,
    /<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
  ]

  for (const pattern of jsonPatterns) {
    const matches = html.match(pattern)
    if (matches) {
      for (const match of Array.isArray(matches) ? matches : [matches[0]]) {
        try {
          // Extract JSON from the match
          const jsonStr = match
            .replace(/<\/?script[^>]*>/gi, '')
            .replace(/^window\.__\w+__\s*=\s*/, '')
            .replace(/;?\s*$/, '')
            .trim()
          
          if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
            const data = JSON.parse(jsonStr)
            const extracted = extractFromJson(data)
            if (extracted.length > 0) return extracted
          }
        } catch {
          // JSON parse failed, continue to next pattern
        }
      }
    }
  }

  // Strategy 2: Parse HTML structure for conversation elements
  // Look for common patterns in the rendered HTML

  // Pattern: user messages and AI messages with distinguishing classes
  const userPatterns = [
    /class="[^"]*(?:user|human|query|question|input)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /data-role="user"[^>]*>([\s\S]*?)<\/div>/gi,
    /class="[^"]*message-user[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ]

  const aiPatterns = [
    /class="[^"]*(?:assistant|ai|response|answer|output)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /data-role="assistant"[^>]*>([\s\S]*?)<\/div>/gi,
    /class="[^"]*message-assistant[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ]

  // Strategy 3: Generic conversation block detection
  // Look for alternating blocks of text that look like a conversation
  const conversationBlocks = html.match(
    /<div[^>]*class="[^"]*(?:message|chat|conversation|turn)[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi
  ) || []

  for (const block of conversationBlocks) {
    const isUser = /(?:user|human|query|question|you)/i.test(block)
    const isAi = /(?:assistant|ai|response|answer|genspark|bot)/i.test(block)
    const text = stripHtml(block)
    
    if (text.trim().length > 2) {
      if (isUser && !isAi) {
        messages.push({ role: 'user', content: text.trim() })
      } else if (isAi) {
        messages.push({ role: 'assistant', content: text.trim() })
      }
    }
  }

  // Strategy 4: Fall back to extracting all meaningful text blocks
  // as a last resort, treat the page as a series of text blocks
  if (messages.length === 0) {
    // Look for markdown-rendered content or pre-formatted text
    const contentBlocks = html.match(/<(?:p|div|article|section)[^>]*>([^<]{20,})<\/(?:p|div|article|section)>/gi) || []
    let isUserTurn = true
    
    for (const block of contentBlocks) {
      const text = stripHtml(block).trim()
      if (text.length > 10 && !text.includes('cookie') && !text.includes('Copyright')) {
        messages.push({
          role: isUserTurn ? 'user' : 'assistant',
          content: text,
        })
        isUserTurn = !isUserTurn
      }
    }
  }

  return messages
}

function extractFromJson(data: any, depth = 0): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (depth > 10) return []
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  if (Array.isArray(data)) {
    // Check if this array contains message-like objects
    const hasMessages = data.some(item => 
      item && typeof item === 'object' && 
      (item.role || item.sender || item.type) && 
      (item.content || item.text || item.message)
    )

    if (hasMessages) {
      for (const item of data) {
        if (!item || typeof item !== 'object') continue
        const role = item.role || item.sender || item.type || ''
        const content = item.content || item.text || item.message || ''
        
        if (typeof content === 'string' && content.trim()) {
          const isUser = /user|human|query|question/i.test(String(role))
          const isAi = /assistant|ai|bot|system|genspark|model/i.test(String(role))
          
          if (isUser) messages.push({ role: 'user', content: content.trim() })
          else if (isAi) messages.push({ role: 'assistant', content: content.trim() })
        }
      }
    }

    if (messages.length === 0) {
      for (const item of data) {
        const sub = extractFromJson(item, depth + 1)
        if (sub.length > 0) return sub
      }
    }
  } else if (data && typeof data === 'object') {
    // Look for message arrays in object properties
    const messageKeys = ['messages', 'conversation', 'chat', 'turns', 'history', 'data', 'items', 'results', 'pageProps', 'props']
    
    for (const key of messageKeys) {
      if (data[key]) {
        const sub = extractFromJson(data[key], depth + 1)
        if (sub.length > 0) return sub
      }
    }

    // Recursively check all properties
    if (messages.length === 0) {
      for (const key of Object.keys(data)) {
        if (typeof data[key] === 'object' && data[key] !== null) {
          const sub = extractFromJson(data[key], depth + 1)
          if (sub.length > 0) return sub
        }
      }
    }
  }

  return messages
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

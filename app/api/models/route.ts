import { NextRequest, NextResponse } from 'next/server'
import { getAvailableModels } from '@/lib/llm'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  return NextResponse.json({
    models: getAvailableModels(),
    default: 'claude-sonnet-4.5',
  })
}

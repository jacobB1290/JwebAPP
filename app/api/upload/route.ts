import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Upload image — accepts base64 data and stores in Supabase storage
// Returns a public URL for the image

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { image, filename, contentType } = await request.json()

    if (!image) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 })
    }

    // Decode base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Generate unique filename
    const ext = (contentType || 'image/png').split('/')[1] || 'png'
    const name = filename || `img-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
    const path = `notebook-images/${name}`

    // Try uploading to Supabase storage
    // If bucket doesn't exist or storage isn't set up, fall back to returning the base64 as a data URL
    try {
      const { data, error } = await supabase.storage
        .from('notebook')
        .upload(path, buffer, {
          contentType: contentType || 'image/png',
          upsert: true,
        })

      if (error) throw error

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('notebook')
        .getPublicUrl(path)

      return NextResponse.json({
        url: urlData.publicUrl,
        path,
        stored: 'supabase',
      })
    } catch (storageErr: any) {
      // If storage fails (bucket not created, etc.), return the data URL directly
      // This is fine for personal use and small images
      console.warn('Supabase storage unavailable, using inline data URL:', storageErr?.message)
      
      const dataUrl = `data:${contentType || 'image/png'};base64,${base64Data}`
      return NextResponse.json({
        url: dataUrl,
        stored: 'inline',
      })
    }
  } catch (err: any) {
    console.error('Upload error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}

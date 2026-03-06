import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: dealer } = await supabase
      .from('dealers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!dealer) return NextResponse.json({ error: 'No dealer profile' }, { status: 404 })

    const { id } = await params
    const body = await req.json()
    const { photos, aiAnalysis } = body as {
      photos: { filename: string; data: string }[]  // base64 JPEG data
      aiAnalysis?: unknown
    }

    if (!photos?.length) {
      return NextResponse.json({ error: 'No photos to save' }, { status: 400 })
    }

    const processedUrls: string[] = []

    for (const photo of photos) {
      const buffer = Buffer.from(photo.data, 'base64')
      const storagePath = `${dealer.id}/${id}/${photo.filename}`

      const { error: uploadError } = await supabase.storage
        .from('processed-photos')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('processed-photos')
        .getPublicUrl(storagePath)

      processedUrls.push(urlData.publicUrl)
    }

    // Update inventory record
    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        photo_status: 'processed',
        processed_photo_urls: processedUrls,
        ai_analysis: aiAnalysis || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('dealer_id', dealer.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      saved: processedUrls.length,
      urls: processedUrls,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

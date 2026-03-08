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
    const { filename, data } = body as { filename: string; data: string }

    if (!filename || !data) {
      return NextResponse.json({ error: 'Missing filename or data' }, { status: 400 })
    }

    const buffer = Buffer.from(data, 'base64')
    const storagePath = `${dealer.id}/${id}/${filename}`

    const { error: uploadError } = await supabase.storage
      .from('processed-photos')
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('processed-photos')
      .getPublicUrl(storagePath)

    // Append to processed_photo_urls array in inventory
    const { data: vehicle } = await supabase
      .from('inventory')
      .select('processed_photo_urls')
      .eq('id', id)
      .eq('dealer_id', dealer.id)
      .single()

    const existingUrls: string[] = vehicle?.processed_photo_urls || []
    // Replace if same filename exists, otherwise append
    const existingIdx = existingUrls.findIndex(u => u.includes(filename))
    if (existingIdx >= 0) {
      existingUrls[existingIdx] = urlData.publicUrl
    } else {
      existingUrls.push(urlData.publicUrl)
    }

    await supabase
      .from('inventory')
      .update({
        processed_photo_urls: existingUrls,
        photo_status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('dealer_id', dealer.id)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

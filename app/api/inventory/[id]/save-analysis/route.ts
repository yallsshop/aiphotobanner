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
    const { aiAnalysis } = body as {
      aiAnalysis: {
        photos: { url: string; classification: string; confidence: number; banner_text: string; features: string[]; condition_notes?: string; enhancement_suggestions?: unknown[] }[]
        exterior_features: string[]
        interior_features: string[]
        seo_description: string
      }
    }

    if (!aiAnalysis) {
      return NextResponse.json({ error: 'No analysis data' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        ai_analysis: aiAnalysis,
        photo_status: 'analyzed',
      })
      .eq('id', id)
      .eq('dealer_id', dealer.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ saved: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface FeedVehicle {
  vin: string
  heading: string
  price: number
  miles: number
  stock_no: string
  exterior_color: string
  interior_color: string
  dom: number
  carfax_1_owner: boolean
  carfax_clean_title: boolean
  vdp_url: string
  media: {
    photo_links: string[]
  }
  build: {
    year: number
    make: string
    model: string
    trim: string
    body_type: string
    engine: string
    transmission: string
    drivetrain: string
    fuel_type: string
    doors: number
    cylinders: number
    std_seating: string
    highway_mpg: number
    city_mpg: number
  }
}

export async function POST(req: Request) {
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

    const { vehicles } = await req.json() as { vehicles: FeedVehicle[] }

    const rows = vehicles.map((v) => ({
      dealer_id: dealer.id,
      vin: v.vin,
      stock_no: v.stock_no,
      heading: v.heading,
      year: v.build?.year,
      make: v.build?.make,
      model: v.build?.model,
      trim: v.build?.trim,
      body_type: v.build?.body_type,
      engine: v.build?.engine,
      transmission: v.build?.transmission,
      drivetrain: v.build?.drivetrain,
      fuel_type: v.build?.fuel_type,
      exterior_color: v.exterior_color,
      interior_color: v.interior_color,
      miles: v.miles,
      doors: v.build?.doors,
      cylinders: v.build?.cylinders,
      seating: v.build?.std_seating,
      highway_mpg: v.build?.highway_mpg,
      city_mpg: v.build?.city_mpg,
      carfax_1_owner: v.carfax_1_owner ?? false,
      carfax_clean_title: v.carfax_clean_title ?? true,
      dom: v.dom ?? 0,
      photo_urls: v.media?.photo_links ?? [],
      vdp_url: v.vdp_url,
      raw_data: v,
    }))

    const { data, error } = await supabase
      .from('inventory')
      .upsert(rows, { onConflict: 'dealer_id,vin' })
      .select('id, vin, heading')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ imported: data?.length ?? 0, vehicles: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

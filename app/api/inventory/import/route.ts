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

// Bill Collins / flat dealer feed format
interface BillCollinsFeedVehicle {
  vin: string
  name?: string
  year?: number
  make?: string
  model?: string
  trim?: string
  bodyStyle?: string
  engine?: string
  transmission?: string
  fuelType?: string
  driveType?: string
  exteriorColor?: string
  interiorColor?: string
  stockNumber?: string
  mileage?: string | number
  msrp?: number
  cpo?: boolean
  carfax_1_owner?: boolean
  carfax_clean_title?: boolean
  features?: string[]
  photoUrls?: string[]
  dealerName?: string
  comments?: string
  detailUrl?: string
}

type AnyFeedVehicle = FeedVehicle | BillCollinsFeedVehicle

function isBillCollinsFormat(v: AnyFeedVehicle): v is BillCollinsFeedVehicle {
  return !('build' in v) && ('year' in v || 'make' in v || 'model' in v)
}

function parseMileage(mileage: string | number | undefined): number {
  if (mileage === undefined || mileage === null) return 0
  if (typeof mileage === 'number') return mileage
  const match = mileage.match(/[\d,]+/)
  return match ? parseInt(match[0].replace(/,/g, ''), 10) : 0
}

function normalizeBillCollins(v: BillCollinsFeedVehicle) {
  return {
    vin: v.vin,
    stock_no: v.stockNumber || '',
    heading: v.name || `${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.trim || ''}`.trim(),
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    body_type: v.bodyStyle,
    engine: v.engine,
    transmission: v.transmission,
    drivetrain: v.driveType,
    fuel_type: v.fuelType,
    exterior_color: v.exteriorColor,
    interior_color: v.interiorColor,
    miles: parseMileage(v.mileage),
    carfax_1_owner: v.carfax_1_owner ?? false,
    carfax_clean_title: v.carfax_clean_title ?? false,
    dom: 0,
    photo_urls: v.photoUrls ?? [],
    vdp_url: v.detailUrl || '',
    features: v.features ?? [],
    raw_data: v,
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

    const { vehicles } = await req.json() as { vehicles: AnyFeedVehicle[] }

    const rows = vehicles.map((v) => {
      if (isBillCollinsFormat(v)) {
        const normalized = normalizeBillCollins(v)
        return {
          dealer_id: dealer.id,
          ...normalized,
        }
      }

      // Original MarketCheck-style format
      const fv = v as FeedVehicle
      return {
        dealer_id: dealer.id,
        vin: fv.vin,
        stock_no: fv.stock_no,
        heading: fv.heading,
        year: fv.build?.year,
        make: fv.build?.make,
        model: fv.build?.model,
        trim: fv.build?.trim,
        body_type: fv.build?.body_type,
        engine: fv.build?.engine,
        transmission: fv.build?.transmission,
        drivetrain: fv.build?.drivetrain,
        fuel_type: fv.build?.fuel_type,
        exterior_color: fv.exterior_color,
        interior_color: fv.interior_color,
        miles: fv.miles,
        doors: fv.build?.doors,
        cylinders: fv.build?.cylinders,
        seating: fv.build?.std_seating,
        highway_mpg: fv.build?.highway_mpg,
        city_mpg: fv.build?.city_mpg,
        carfax_1_owner: fv.carfax_1_owner ?? false,
        carfax_clean_title: fv.carfax_clean_title ?? true,
        dom: fv.dom ?? 0,
        photo_urls: fv.media?.photo_links ?? [],
        vdp_url: fv.vdp_url,
        raw_data: fv,
      }
    })

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

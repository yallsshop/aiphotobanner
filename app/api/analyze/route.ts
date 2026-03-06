import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! })

const BATCH_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    photos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.NUMBER, description: 'Photo index (0-based)' },
          classification: {
            type: Type.STRING,
            description: 'Photo type: exterior_front, exterior_rear, exterior_side, interior_front, interior_rear, dashboard, engine, wheels, trunk, detail, other',
          },
          confidence: { type: Type.NUMBER, description: 'Confidence 0-1' },
          banner_text: {
            type: Type.STRING,
            description: 'UNIQUE top banner text for THIS specific photo. Max 40 chars. ALL CAPS. Pipe-separated. Must NOT repeat text used on other photos.',
          },
          features_visible: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Features actually visible in this specific photo',
          },
          condition_notes: { type: Type.STRING },
        },
        required: ['index', 'classification', 'confidence', 'banner_text', 'features_visible'],
      },
    },
    exterior_features: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Complete list of ALL exterior features across all photos. For the EXTERIOR FEATURES overlay image.',
    },
    interior_features: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Complete list of ALL interior features across all photos. For the INTERIOR FEATURES overlay image.',
    },
  },
  required: ['photos', 'exterior_features', 'interior_features'],
}

interface VehicleContext {
  year?: number; make?: string; model?: string; trim?: string
  engine?: string; transmission?: string; drivetrain?: string
  exterior_color?: string; interior_color?: string; miles?: number
  body_type?: string; fuel_type?: string; doors?: number
  cylinders?: number; seating?: string; highway_mpg?: number
  city_mpg?: number; carfax_1_owner?: boolean
  carfax_clean_title?: boolean; dom?: number
}

function buildBatchPrompt(vehicleContext?: VehicleContext, photoCount?: number): string {
  let prompt = `You are analyzing ${photoCount || 'multiple'} photos of the SAME vehicle for a car dealership photo banner system. Each photo gets a top banner with unique text.

CRITICAL RULES:
1. NEVER include price, MSRP, or dollar amounts
2. Each photo's banner_text must be UNIQUE — no two photos share the same text
3. banner_text is MAX 40 characters, ALL CAPS, pipe-separated (e.g. "DIESEL | Z71 | LEATHER")
4. Photo 0 (hero/first photo) gets the vehicle's TOP 2-3 selling points
5. Each subsequent photo: text MUST be specific to what's shown in THAT photo:
   - Steering wheel close-up → "CRUISE CONTROL | HEATED WHEEL"
   - Engine bay → "3.5L V6 ECOBOOST | 400HP"
   - Rear/tailgate → "POWER TAILGATE | TOW HITCH"
   - Dashboard → "12\" TOUCHSCREEN | CARPLAY"
   - Wheels → "20\" CHROME WHEELS | AWD"
   - Interior wide → "LEATHER | PANORAMIC ROOF"
   - Trunk/cargo → "POWER LIFTGATE | 87 CU FT"
6. Generate complete exterior_features and interior_features lists from ALL photos combined
7. Be concise but descriptive — dealership customers scan quickly`

  if (vehicleContext) {
    const specs = []
    if (vehicleContext.year && vehicleContext.make && vehicleContext.model) {
      specs.push(`Vehicle: ${vehicleContext.year} ${vehicleContext.make} ${vehicleContext.model} ${vehicleContext.trim || ''}`.trim())
    }
    if (vehicleContext.engine) specs.push(`Engine: ${vehicleContext.engine}`)
    if (vehicleContext.transmission) specs.push(`Trans: ${vehicleContext.transmission}`)
    if (vehicleContext.drivetrain) specs.push(`Drivetrain: ${vehicleContext.drivetrain}`)
    if (vehicleContext.exterior_color) specs.push(`Ext: ${vehicleContext.exterior_color}`)
    if (vehicleContext.interior_color) specs.push(`Int: ${vehicleContext.interior_color}`)
    if (vehicleContext.miles) specs.push(`Miles: ${vehicleContext.miles.toLocaleString()}`)
    if (vehicleContext.body_type) specs.push(`Body: ${vehicleContext.body_type}`)
    if (vehicleContext.fuel_type) specs.push(`Fuel: ${vehicleContext.fuel_type}`)
    if (vehicleContext.highway_mpg && vehicleContext.city_mpg) specs.push(`MPG: ${vehicleContext.city_mpg} city / ${vehicleContext.highway_mpg} hwy`)
    if (vehicleContext.carfax_1_owner) specs.push('CARFAX 1-Owner')
    if (vehicleContext.carfax_clean_title) specs.push('Clean Title')
    if (vehicleContext.dom !== undefined && vehicleContext.dom < 15) specs.push('Just Arrived')

    prompt += `\n\nVEHICLE SPECS (enrich analysis with these):\n${specs.join('\n')}`
    prompt += `\n\nCombine what you SEE with what you KNOW. E.g. if you see leather seats AND know it's Platinum trim, use "PLATINUM | LEATHER".`
  }

  return prompt
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    return {
      data: Buffer.from(buffer).toString('base64'),
      mimeType: res.headers.get('content-type') || 'image/jpeg',
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.GOOGLE_GENAI_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_GENAI_API_KEY not configured' }, { status: 500 })
    }

    const body = await req.json()
    const { images, imageUrls, vehicleContext } = body as {
      images?: { data: string; mimeType: string; name: string }[]
      imageUrls?: string[]
      vehicleContext?: VehicleContext
    }

    // Collect all image data
    const imageData: { data: string; mimeType: string; ref: string }[] = []

    if (images?.length) {
      for (const img of images) {
        imageData.push({ data: img.data, mimeType: img.mimeType, ref: img.name })
      }
    } else if (imageUrls?.length) {
      for (const url of imageUrls) {
        const img = await fetchImageAsBase64(url)
        if (img) {
          imageData.push({ ...img, ref: url })
        }
      }
    }

    if (!imageData.length) {
      return NextResponse.json({ error: 'No valid images' }, { status: 400 })
    }

    // Build multi-image content array
    const contents: Array<{ inlineData: { mimeType: string; data: string } } | string> = []
    for (let i = 0; i < imageData.length; i++) {
      contents.push({ inlineData: { mimeType: imageData[i].mimeType, data: imageData[i].data } })
      contents.push(`[Photo ${i}]`)
    }
    contents.push(buildBatchPrompt(vehicleContext, imageData.length))

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: BATCH_ANALYSIS_SCHEMA,
      },
    })

    const parsed = JSON.parse(response.text || '{}')

    // Map results back to original refs
    const results = parsed.photos?.map((p: { index: number; classification: string; confidence: number; banner_text: string; features_visible: string[]; condition_notes?: string }) => ({
      ref: imageData[p.index]?.ref,
      analysis: {
        classification: p.classification,
        confidence: p.confidence,
        banner_text: p.banner_text,
        features: p.features_visible,
        condition_notes: p.condition_notes,
      },
    })) || []

    return NextResponse.json({
      results,
      exterior_features: parsed.exterior_features || [],
      interior_features: parsed.interior_features || [],
    })
  } catch (error) {
    console.error('Analysis error:', error)
    const message = error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

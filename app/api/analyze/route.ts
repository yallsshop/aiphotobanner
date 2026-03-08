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
            description: 'Top banner text for THIS photo. Max 40 chars. ALL CAPS. Pipe-separated selling points. Must be UNIQUE per photo.',
          },
          features_visible: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Features actually visible in this specific photo',
          },
          condition_notes: { type: Type.STRING },
          enhancement_suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING, description: 'Short label: "Remove paper mats", "Replace background", "Enhance lighting", "Remove clutter", etc.' },
                instruction: { type: Type.STRING, description: 'Detailed AI editing instruction to send to an image generation model. Be specific about what to change and what to preserve.' },
                priority: { type: Type.STRING, description: 'high = significantly improves listing quality, medium = nice improvement, low = minor polish' },
              },
              required: ['action', 'instruction', 'priority'],
            },
            description: 'Suggested AI photo enhancements for this image. Look for: paper floor mats, messy backgrounds, poor lighting, dealer stickers/plates, clutter in frame, dark interiors. Only suggest if there is something genuinely worth fixing.',
          },
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
    seo_description: {
      type: Type.STRING,
      description: 'SEO-optimized vehicle description for VDP pages (AutoTrader, CarGurus, etc). Plain text paragraph, no bullets or formatting. 150-300 words. Highlight key selling points, features, condition, and ownership history naturally. Write in a warm, professional dealership tone.',
    },
  },
  required: ['photos', 'exterior_features', 'interior_features', 'seo_description'],
}

interface VehicleContext {
  year?: number; make?: string; model?: string; trim?: string
  engine?: string; transmission?: string; drivetrain?: string
  exterior_color?: string; interior_color?: string; miles?: number
  body_type?: string; fuel_type?: string; doors?: number
  cylinders?: number; seating?: string; highway_mpg?: number
  city_mpg?: number; carfax_1_owner?: boolean
  carfax_clean_title?: boolean; dom?: number
  features?: string[]
}

// Hot-button features that customers actively search for
const SELLING_POINT_HINTS = [
  'HEATED SEATS', 'HEATED STEERING WHEEL', 'COOLED SEATS', 'VENTILATED SEATS',
  'APPLE CARPLAY', 'ANDROID AUTO', 'WIRELESS CARPLAY',
  'LEATHER', 'PREMIUM LEATHER', 'LEATHER SEATS',
  'PANORAMIC ROOF', 'SUNROOF', 'MOONROOF',
  'BACKUP CAMERA', 'SURROUND VIEW', '360 CAMERA',
  'BLIND SPOT MONITORING', 'LANE KEEP ASSIST', 'ADAPTIVE CRUISE',
  'NAVIGATION', 'BUILT-IN NAV',
  'REMOTE START', 'PUSH BUTTON START', 'KEYLESS ENTRY',
  'POWER LIFTGATE', 'HANDS-FREE LIFTGATE',
  'THIRD ROW', '3RD ROW SEATING',
  'AWD', '4WD', 'ALL WHEEL DRIVE',
  'TURBO', 'TWIN TURBO', 'ECOBOOST',
  'TOW PACKAGE', 'TRAILER TOW',
  'LED HEADLIGHTS', 'PREMIUM AUDIO', 'BOSE', 'HARMAN KARDON', 'B&O',
  'WIRELESS CHARGING', 'USB-C',
  'PARKING SENSORS', 'SELF PARKING',
  'HEADS UP DISPLAY', 'HUD',
  'PREMIUM WHEELS', 'CHROME WHEELS',
  'LOW MILES', 'ONE OWNER', 'CLEAN TITLE', 'CERTIFIED',
]

function buildBatchPrompt(vehicleContext?: VehicleContext, photoCount?: number, descriptionMustHaves?: string, customFeatures?: string, customInstructions?: string): string {
  let prompt = `You are a car dealership photo banner AI. You analyze ${photoCount || 'multiple'} photos of the SAME vehicle and generate compelling, ACCURATE banner text that highlights SELLING POINTS customers care about.

ABSOLUTE RULES:
1. NEVER include price, MSRP, or dollar amounts
2. NEVER fabricate features — ONLY mention features that are:
   a) VISIBLE in the specific photo, OR
   b) CONFIRMED in the vehicle specs provided below
3. Each photo's banner_text must be UNIQUE — no two photos share the same text
4. banner_text: MAX 40 characters, ALL CAPS, pipe-separated (e.g. "AWD | HEATED SEATS | LEATHER")
5. If you can see or confirm a hot-button feature, PRIORITIZE it over generic descriptions
6. NEVER use profanity or abbreviations that could be misread as profanity
7. Every word in banner_text must be a SPECIFIC, SEARCHABLE feature or trust signal — not a description of the photo itself

HOT-BUTTON FEATURES (prioritize these when confirmed):
${SELLING_POINT_HINTS.join(', ')}

=== BANNED PHRASES — NEVER USE THESE ===
These are FILLER that describes the photo instead of selling the car. If you catch yourself writing any of these, STOP and replace with a real feature:
- "SLEEK REAR DESIGN", "BOLD FRONT STYLING", "ELEGANT SIDE VIEW", "SLEEK PROFILE"
- "DRIVER-FOCUSED INTERIOR", "COMFORTABLE REAR CABIN", "SPACIOUS TRUNK"
- "GENEROUS CARGO SPACE", "MODERN DASHBOARD", "STYLISH DESIGN"
- "SHARP DESIGN", "CLEAN LINES", "PREMIUM LOOK", "ELEGANT DESIGN"
- "FRONT PASSENGER SEAT", "REAR SEAT VIEW", "SIDE VIEW"
- Any phrase that describes WHAT the photo shows rather than a FEATURE the car has

=== BANNED OBVIOUS FEATURES — EVERY CAR HAS THESE ===
Never waste banner space on: POWER WINDOWS, POWER LOCKS, CUP HOLDERS, SEAT BELTS, AIR CONDITIONING, FLOOR MATS, SUN VISORS, DOME LIGHT, GLOVE BOX, TRUNK RELEASE, MULTI-FUNCTION STEERING WHEEL

=== THE TEST ===
Before writing banner_text, ask: "Would a buyer search for this on AutoTrader?"
- "AWD" → YES (buyers filter by this)
- "HEATED SEATS" → YES (buyers search for this)
- "COMFORTABLE REAR CABIN" → NO (nobody types this)
- "POWER WINDOWS" → NO (every car has this)
- "CHROME TRIM" → NO (not a search term)

PHOTO-SPECIFIC BANNER STRATEGY:
- Photo 0 (hero shot): Vehicle's TOP 2-3 confirmed selling points (e.g. "AWD | LEATHER | LOW MILES")
- Exterior photos: drivetrain (AWD/4WD/FWD), LED HEADLIGHTS, PREMIUM WHEELS, TOW PACKAGE — confirmed features
- Interior/dashboard: CARPLAY | LEATHER | HEATED SEATS | NAVIGATION | PANO ROOF — real features
- Rear/trunk: POWER LIFTGATE, CARGO LINER, SPLIT-FOLD SEATS — functional features
- Engine bay: TURBO, ECOBOOST, V6, HYBRID — engine specs
- Detail shots: Read the BRAND NAME on what you see (e.g. "HARMAN KARDON", "B&O", "BOSE") — do NOT generically say "PREMIUM AUDIO" if you can read the brand. Look for seat control buttons and name the feature: "HEATED SEATS" not "SEAT CONTROLS", "MEMORY SEATS" not "POWER ADJUSTABLE SEATING"

WHAT MAKES GREAT BANNER TEXT:
- "AWD | PANO ROOF | HEATED SEATS" (specific, searchable selling points)
- "ECOBOOST | LEATHER | CARPLAY" (features customers filter by)
- "ONE OWNER | CLEAN TITLE | 22K MI" (trust signals)
- "HARMAN KARDON | HEATED SEATS" (brand name from detail shot)
- "LED HEADLIGHTS | M SPORT PKG" (visible confirmed features)

WHAT MAKES BAD BANNER TEXT (NEVER DO THIS):
- "ELEGANT SIDE VIEW | CHROME ACCENTS" (describes the photo angle)
- "MODERN DASHBOARD | WOODGRAIN TRIM" (generic, not searchable)
- "BOLD FRONT STYLING | LED HEADLIGHTS" (half filler, half feature)
- "COMFORTABLE REAR CABIN" (vague, could be any car)
- "DRIVER-FOCUSED INTERIOR" (marketing fluff, not a feature)
- "POWER WINDOW CONTROLS" (every car has this)
- "MULTI-FUNCTION STEERING WHEEL" (every modern car has this)

When you see an interior shot, look for:
- Touchscreen size, CarPlay/Android Auto icons on the screen
- Seat material (leather vs cloth), heated/cooled seat BUTTONS specifically
- Brand names on speakers (Harman Kardon, B&O, Bose, JBL, Revel)
- Panoramic roof visible through glass
- Digital instrument cluster / heads-up display

When you see an exterior shot, look for:
- Badge/emblem indicating trim level or AWD/4WD
- LED headlight/taillight design
- Roof rails, tow hitch, premium wheels
- Model-specific package badges (M Sport, AMG Line, F Sport, etc.)`

  if (vehicleContext) {
    const specs = []
    if (vehicleContext.year && vehicleContext.make && vehicleContext.model) {
      specs.push(`Vehicle: ${vehicleContext.year} ${vehicleContext.make} ${vehicleContext.model} ${vehicleContext.trim || ''}`.trim())
    }
    if (vehicleContext.engine) specs.push(`Engine: ${vehicleContext.engine}`)
    if (vehicleContext.transmission) specs.push(`Trans: ${vehicleContext.transmission}`)
    if (vehicleContext.drivetrain) specs.push(`Drivetrain: ${vehicleContext.drivetrain}`)
    if (vehicleContext.exterior_color) specs.push(`Ext Color: ${vehicleContext.exterior_color}`)
    if (vehicleContext.interior_color) specs.push(`Int Color: ${vehicleContext.interior_color}`)
    if (vehicleContext.miles) specs.push(`Miles: ${vehicleContext.miles.toLocaleString()}`)
    if (vehicleContext.body_type) specs.push(`Body: ${vehicleContext.body_type}`)
    if (vehicleContext.fuel_type) specs.push(`Fuel: ${vehicleContext.fuel_type}`)
    if (vehicleContext.highway_mpg && vehicleContext.city_mpg) specs.push(`MPG: ${vehicleContext.city_mpg} city / ${vehicleContext.highway_mpg} hwy`)
    if (vehicleContext.carfax_1_owner) specs.push('CARFAX: 1-Owner (USE THIS as selling point)')
    if (vehicleContext.carfax_clean_title) specs.push('CARFAX: Clean Title (USE THIS as selling point)')
    if (vehicleContext.dom !== undefined && vehicleContext.dom < 15) specs.push('JUST ARRIVED (USE THIS as selling point)')
    if (vehicleContext.miles && vehicleContext.miles < 30000) specs.push(`LOW MILES: ${vehicleContext.miles.toLocaleString()} (USE THIS as selling point)`)

    prompt += `\n\n=== CONFIRMED VEHICLE SPECS (these are FACTS you can use) ===\n${specs.join('\n')}`

    // Derive known features from trim/engine data
    const knownFeatures: string[] = []
    const trimLower = (vehicleContext.trim || '').toLowerCase()
    const engineLower = (vehicleContext.engine || '').toLowerCase()

    if (vehicleContext.drivetrain?.toUpperCase().includes('AWD') || vehicleContext.drivetrain?.toUpperCase().includes('4WD')) {
      knownFeatures.push(`${vehicleContext.drivetrain.toUpperCase()} — confirmed, use on hero/exterior`)
    }
    if (engineLower.includes('turbo') || engineLower.includes('ecoboost')) {
      knownFeatures.push('TURBO/ECOBOOST — confirmed from engine specs')
    }
    if (trimLower.includes('reserve') || trimLower.includes('premier') || trimLower.includes('platinum') || trimLower.includes('limited')) {
      knownFeatures.push(`${vehicleContext.trim?.toUpperCase()} TRIM — luxury trim likely has leather, heated seats, premium audio`)
    }

    if (knownFeatures.length > 0) {
      prompt += `\n\n=== DERIVED SELLING POINTS (high confidence) ===\n${knownFeatures.join('\n')}`
    }

    if (vehicleContext.features && vehicleContext.features.length > 0) {
      prompt += `\n\n=== CONFIRMED FEATURES FROM DEALER FEED (use these as banner text) ===\n${vehicleContext.features.join(', ')}\nThese are CONFIRMED features. Prioritize these in banner_text over guesses.`
    }

    prompt += `\n\nCombine what you SEE in photos with these CONFIRMED specs. The specs are your source of truth — never contradict them. Use the trim level to infer likely features (e.g. Reserve trim Lincoln = leather + heated seats + premium audio), but note them as "likely" in features_visible if not directly seen.`
  }

  // Custom features pasted by the user (window sticker text, dealer feature list, etc.)
  if (customFeatures) {
    prompt += `\n\n=== DEALER-PROVIDED FEATURE LIST (HIGH PRIORITY — THESE ARE CONFIRMED) ===
The dealer pasted these features directly. These are CONFIRMED and should be your PRIMARY source for banner text. Distribute these across photos so each banner is unique:

${customFeatures}

STRATEGY: You have ${photoCount || 'multiple'} photos. Map the top ${Math.min(3, photoCount || 3)} buyer-priority features to the hero shot. Then distribute remaining features across other photos so NO two banners repeat the same feature. Prioritize features buyers actually search for (heated seats, AWD, CarPlay, pano roof, etc.) over basic specs.`
  }

  // Custom instructions from the user
  if (customInstructions) {
    prompt += `\n\n=== DEALER CUSTOM INSTRUCTIONS (FOLLOW THESE) ===
${customInstructions}`
  }

  prompt += `\n\n=== BANNER TEXT DISTRIBUTION STRATEGY ===
You are creating banners for ${photoCount || 'multiple'} photos of the SAME car. The BIGGEST mistake is being repetitive.

RULES FOR UNIQUENESS:
1. Before writing ANY banner_text, first make a mental list of ALL confirmed features from specs + dealer-provided list + what you see
2. Rank them by buyer priority (what would someone filter/search for on AutoTrader?)
3. Assign the top 2-3 to photo 0 (hero shot)
4. Distribute the rest across remaining photos — EACH photo gets DIFFERENT features
5. If you run out of unique features, use trust signals: "LOW MILES", "ONE OWNER", "CLEAN TITLE", "JUST ARRIVED"
6. NEVER repeat a feature that already appeared on another photo's banner

BUYER-FOCUSED MINDSET:
Think about what the consumer WORRIES about when buying a used car:
- Is it reliable? → "CLEAN TITLE | ONE OWNER | LOW MILES"
- Does it have the tech I want? → "CARPLAY | WIRELESS CHARGING | NAV"
- Is it comfortable? → "HEATED SEATS | PANO ROOF | LEATHER"
- Can it do what I need? → "AWD | TOW PKG | 3RD ROW"
- Is it worth the money? → Name the PREMIUM features that justify the price`

  prompt += `\n\n=== SEO DESCRIPTION INSTRUCTIONS ===
Write a compelling SEO-optimized vehicle description for the "seo_description" field.
This will be used on VDP pages (AutoTrader, CarGurus, Cars.com, dealer websites).
RULES:
- Plain text paragraph only. NO bullets, NO line breaks, NO markdown, NO HTML.
- 150-300 words, natural flowing sentences.
- Lead with the year/make/model/trim and top selling points.
- Mention key features confirmed from photos and specs (drivetrain, engine, tech, safety, comfort).
- Include ownership history (1-owner, clean title) and mileage if notable.
- Use keywords buyers search for naturally (not stuffed).
- Professional, warm dealership tone — like a knowledgeable salesperson writing the listing.
- Do NOT include price, payment info, or dealer-specific promotions.`

  if (descriptionMustHaves?.trim()) {
    prompt += `\n\nDEALERSHIP REQUIRED TEXT — You MUST naturally incorporate the following into the description:\n"${descriptionMustHaves.trim()}"`
  }

  prompt += `\n\n=== PHOTO ENHANCEMENT SUGGESTIONS ===
For each photo, check if AI image editing could improve the listing quality. Add enhancement_suggestions ONLY when there's a real issue worth fixing. Common things to look for:

HIGH priority:
- Paper floor mats / "THANKS FOR COMING IN" dealer mats visible — suggest removing them
- Messy or cluttered backgrounds (other cars, trash, people walking by)
- Dark/underexposed interior shots — suggest brightening

MEDIUM priority:
- Plain/ugly parking lot background on exterior shots — suggest replacing with clean showroom or studio backdrop
- Reflections of photographer or equipment visible
- Minor clutter in trunk/cargo area (bags, tools)

LOW priority:
- Slightly dull paint that could be enhanced
- Minor color/exposure corrections

For each suggestion, write a DETAILED instruction that could be sent directly to an AI image editor. Example:
- action: "Remove paper mats"
  instruction: "Remove the white paper floor mats from the driver and passenger footwells. Replace them with clean, dark carpeted floor that matches the rest of the interior. Keep everything else exactly the same."
- action: "Replace background"
  instruction: "Replace the parking lot background with a clean, professional automotive studio backdrop — neutral gray gradient with soft lighting. Keep the vehicle exactly as-is including reflections on the paint."

Do NOT suggest enhancements for photos that already look clean and professional.`

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
    const { images, imageUrls, vehicleContext, descriptionMustHaves, customFeatures, customInstructions, windowSticker } = body as {
      images?: { data: string; mimeType: string; name: string }[]
      imageUrls?: string[]
      vehicleContext?: VehicleContext
      descriptionMustHaves?: string
      customFeatures?: string
      customInstructions?: string
      windowSticker?: { data: string; mimeType: string }
    }

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

    const contents: Array<{ inlineData: { mimeType: string; data: string } } | string> = []

    // Add window sticker first if provided — gives AI full feature context before seeing photos
    if (windowSticker?.data) {
      contents.push({ inlineData: { mimeType: windowSticker.mimeType, data: windowSticker.data } })
      contents.push('[WINDOW STICKER — Read ALL features, packages, and options from this sticker. Use these as CONFIRMED features for banner text.]')
    }

    for (let i = 0; i < imageData.length; i++) {
      contents.push({ inlineData: { mimeType: imageData[i].mimeType, data: imageData[i].data } })
      contents.push(`[Photo ${i}]`)
    }
    contents.push(buildBatchPrompt(vehicleContext, imageData.length, descriptionMustHaves, customFeatures, customInstructions))

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: BATCH_ANALYSIS_SCHEMA,
      },
    })

    const parsed = JSON.parse(response.text || '{}')

    const results = parsed.photos?.map((p: { index: number; classification: string; confidence: number; banner_text: string; features_visible: string[]; condition_notes?: string; enhancement_suggestions?: { action: string; instruction: string; priority: string }[] }) => ({
      ref: imageData[p.index]?.ref,
      analysis: {
        classification: p.classification,
        confidence: p.confidence,
        banner_text: p.banner_text,
        features: p.features_visible,
        condition_notes: p.condition_notes,
        enhancement_suggestions: p.enhancement_suggestions || [],
      },
    })) || []

    return NextResponse.json({
      results,
      exterior_features: parsed.exterior_features || [],
      interior_features: parsed.interior_features || [],
      seo_description: parsed.seo_description || '',
    })
  } catch (error) {
    console.error('Analysis error:', error)
    const message = error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

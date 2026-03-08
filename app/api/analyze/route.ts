import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import {
  MODELS, MODEL_SETTINGS, SELLING_POINT_HINTS,
  ANALYSIS_SYSTEM_INSTRUCTION,
  buildAnalysisSystemPrompt, buildDistributionStrategy,
  buildSeoInstructions, ENHANCEMENT_SUGGESTIONS_PROMPT,
  buildCustomFeaturesPrompt, buildCustomInstructionsPrompt,
} from '@/lib/ai-prompts'
import {
  classifySegment, detectTrimTier, normalizeFeature,
  rankFeaturesForPhoto, buildRankingPromptContext,
  type ExtractedFeature, type PhotoType, type RankingContext,
} from '@/lib/feature-ranker'

// Allow up to 5 minutes for large photo sets analyzed in batches
export const maxDuration = 300

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

// SELLING_POINT_HINTS, prompts, and content rules are now in lib/ai-prompts.ts

function buildBatchPrompt(vehicleContext?: VehicleContext, photoCount?: number, descriptionMustHaves?: string, customFeatures?: string, customInstructions?: string, segmentPriorityBlock?: string): string {
  let prompt = buildAnalysisSystemPrompt(photoCount)

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
    prompt += buildCustomFeaturesPrompt(customFeatures, photoCount)
  }

  // Custom instructions from the user
  if (customInstructions) {
    prompt += buildCustomInstructionsPrompt(customInstructions)
  }

  prompt += buildDistributionStrategy(photoCount)
  prompt += buildSeoInstructions(descriptionMustHaves)
  prompt += ENHANCEMENT_SUGGESTIONS_PROMPT

  // Inject segment-aware priority guidance if available
  if (segmentPriorityBlock) {
    prompt += segmentPriorityBlock
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

    // Process in batches of 8 to avoid output token truncation
    const ANALYSIS_BATCH = 8
    type PhotoResult = { index: number; classification: string; confidence: number; banner_text: string; features_visible: string[]; condition_notes?: string; enhancement_suggestions?: { action: string; instruction: string; priority: string }[] }
    const allPhotoResults: { ref: string; analysis: { classification: string; confidence: number; banner_text: string; features: string[]; condition_notes?: string; enhancement_suggestions?: { action: string; instruction: string; priority: string }[] } }[] = []
    let allExteriorFeatures: string[] = []
    let allInteriorFeatures: string[] = []
    let seoDescription = ''

    // Pre-classify segment to inject priority guidance into prompts
    let segmentPriorityBlock = ''
    if (vehicleContext?.make || vehicleContext?.model) {
      const preClassification = classifySegment({
        make: vehicleContext.make,
        model: vehicleContext.model,
        bodyType: vehicleContext.body_type,
        fuelType: vehicleContext.fuel_type,
        drivetrain: vehicleContext.drivetrain,
        trim: vehicleContext.trim,
      })
      // Import segment rules dynamically
      const segData = (await import('@/lib/knowledge-base/segment-priority-rules.json')).default.segments[preClassification.segment] as {
        leadPriorities: string[]; tableStakes: string[]; mustMentionSpecs: string[]; valueAngles: string[]
      } | undefined
      if (segData) {
        segmentPriorityBlock = `\n\n=== SEGMENT-AWARE PRIORITY GUIDANCE ===
Vehicle Segment: ${preClassification.segment}
${preClassification.modifiers.length > 0 ? `Modifiers: ${preClassification.modifiers.join(', ')}` : ''}

BUYER PRIORITIES for this segment (in order):
${segData.leadPriorities.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

TABLE STAKES — do NOT lead with these (every competitor has them):
${segData.tableStakes.join(', ')}

MUST-MENTION SPECS (for SEO description):
${segData.mustMentionSpecs.join(', ')}

VALUE ANGLES for this buyer:
${segData.valueAngles.join(', ')}

Use this priority order when choosing which features go in banner_text.`
      }
    }

    const batches: { data: string; mimeType: string; ref: string; globalIndex: number }[][] = []
    for (let i = 0; i < imageData.length; i += ANALYSIS_BATCH) {
      batches.push(imageData.slice(i, i + ANALYSIS_BATCH).map((d, j) => ({ ...d, globalIndex: i + j })))
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]
      const isFirstBatch = batchIdx === 0
      const isLastBatch = batchIdx === batches.length - 1

      const contents: Array<{ inlineData: { mimeType: string; data: string } } | string> = []

      // Window sticker on first batch only
      if (isFirstBatch && windowSticker?.data) {
        contents.push({ inlineData: { mimeType: windowSticker.mimeType, data: windowSticker.data } })
        contents.push('[WINDOW STICKER — Read ALL features, packages, and options from this sticker. Use these as CONFIRMED features for banner text.]')
      }

      for (let i = 0; i < batch.length; i++) {
        contents.push({ inlineData: { mimeType: batch[i].mimeType, data: batch[i].data } })
        contents.push(`[Photo ${i}]`)
      }

      // Tell it about already-used banner texts to avoid repetition across batches
      let batchPrompt = buildBatchPrompt(vehicleContext, batch.length, isLastBatch ? descriptionMustHaves : undefined, customFeatures, customInstructions, segmentPriorityBlock)
      if (allPhotoResults.length > 0) {
        const usedTexts = allPhotoResults.map(r => r.analysis.banner_text).join(', ')
        batchPrompt += `\n\n=== ALREADY USED BANNER TEXTS (DO NOT REPEAT) ===\nPrevious photos already use: ${usedTexts}\nYou MUST use DIFFERENT features/text for these photos.`
      }
      if (!isLastBatch) {
        batchPrompt += `\n\nNOTE: seo_description can be empty "" for this batch — it will be generated in a later batch.`
      }

      contents.push(batchPrompt)

      const response = await ai.models.generateContent({
        model: MODELS.analysis,
        contents,
        config: {
          systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: BATCH_ANALYSIS_SCHEMA,
          maxOutputTokens: MODEL_SETTINGS.analysis.maxOutputTokens,
          thinkingConfig: MODEL_SETTINGS.analysis.thinkingConfig,
        },
      })

      const parsed = JSON.parse(response.text || '{}')

      const batchResults = parsed.photos?.map((p: PhotoResult) => ({
        ref: batch[p.index]?.ref,
        analysis: {
          classification: p.classification,
          confidence: p.confidence,
          banner_text: p.banner_text,
          features: p.features_visible,
          condition_notes: p.condition_notes,
          enhancement_suggestions: p.enhancement_suggestions || [],
        },
      })) || []

      allPhotoResults.push(...batchResults)

      // Merge features from all batches
      if (parsed.exterior_features?.length) {
        allExteriorFeatures = [...new Set([...allExteriorFeatures, ...parsed.exterior_features])]
      }
      if (parsed.interior_features?.length) {
        allInteriorFeatures = [...new Set([...allInteriorFeatures, ...parsed.interior_features])]
      }
      if (parsed.seo_description && isLastBatch) {
        seoDescription = parsed.seo_description
      }
    }

    // ── Post-process: apply knowledge-base ranking to refine banner text ──
    let segmentInfo: { segment: string; modifiers: string[] } | undefined
    if (vehicleContext?.make || vehicleContext?.model) {
      const classification = classifySegment({
        make: vehicleContext.make,
        model: vehicleContext.model,
        bodyType: vehicleContext.body_type,
        fuelType: vehicleContext.fuel_type,
        drivetrain: vehicleContext.drivetrain,
        trim: vehicleContext.trim,
      })
      const trimTier = detectTrimTier(vehicleContext.trim)
      segmentInfo = classification

      // Collect all confirmed features from structured data + AI extraction
      const allRawFeatures: string[] = [
        ...allExteriorFeatures,
        ...allInteriorFeatures,
        ...(vehicleContext.features || []),
      ]
      // Normalize to canonical names
      const canonicalFeatures: ExtractedFeature[] = []
      const seen = new Set<string>()
      for (const raw of allRawFeatures) {
        const canonical = normalizeFeature(raw)
        if (canonical && !seen.has(canonical)) {
          seen.add(canonical)
          canonicalFeatures.push({
            feature: canonical,
            source: 'structured_data',
            confidence: 0.9,
            visibleInPhoto: false,
          })
        }
      }
      // Add trust signals from vehicle context
      if (vehicleContext.carfax_1_owner) {
        const f = normalizeFeature('one owner')
        if (f && !seen.has(f)) { seen.add(f); canonicalFeatures.push({ feature: f, source: 'trust_signal', confidence: 1.0, visibleInPhoto: false }) }
      }
      if (vehicleContext.carfax_clean_title) {
        const f = normalizeFeature('clean title')
        if (f && !seen.has(f)) { seen.add(f); canonicalFeatures.push({ feature: f, source: 'trust_signal', confidence: 1.0, visibleInPhoto: false }) }
      }
      if (vehicleContext.miles && vehicleContext.miles < 30000) {
        const f = normalizeFeature('low miles')
        if (f && !seen.has(f)) { seen.add(f); canonicalFeatures.push({ feature: f, source: 'trust_signal', confidence: 1.0, visibleInPhoto: false }) }
      }
      if (vehicleContext.drivetrain?.toUpperCase().includes('AWD')) {
        const f = normalizeFeature('awd')
        if (f && !seen.has(f)) { seen.add(f); canonicalFeatures.push({ feature: f, source: 'structured_data', confidence: 1.0, visibleInPhoto: false }) }
      }
      if (vehicleContext.drivetrain?.toUpperCase().includes('4WD')) {
        const f = normalizeFeature('4wd')
        if (f && !seen.has(f)) { seen.add(f); canonicalFeatures.push({ feature: f, source: 'structured_data', confidence: 1.0, visibleInPhoto: false }) }
      }

      // Re-rank each photo's banner text using the knowledge base
      const usedFeatures: string[] = []
      for (const result of allPhotoResults) {
        // Also add features AI found in this specific photo
        const photoFeatures = [...canonicalFeatures]
        for (const visibleRaw of (result.analysis.features || [])) {
          const canonical = normalizeFeature(visibleRaw)
          if (canonical && !seen.has(canonical)) {
            photoFeatures.push({ feature: canonical, source: 'visible_in_photo', confidence: 0.85, visibleInPhoto: true })
          }
        }

        // Map AI classification to our photo type
        const photoType = (result.analysis.classification || 'other') as PhotoType

        const ctx: RankingContext = {
          segment: classification.segment,
          modifiers: classification.modifiers,
          photoType,
          trimTier: trimTier,
          alreadyUsedFeatures: usedFeatures,
        }

        const ranking = rankFeaturesForPhoto(photoFeatures, ctx)

        // Use KB-ranked banner if it produced a meaningful result
        if (ranking.bannerText && ranking.bannerText !== 'QUALITY PRE-OWNED') {
          result.analysis.banner_text = ranking.bannerText
        }

        // Track used features for uniqueness across photos
        for (const f of ranking.rankedFeatures.slice(0, 3)) {
          usedFeatures.push(f.feature)
        }
      }
    }

    return NextResponse.json({
      results: allPhotoResults,
      exterior_features: allExteriorFeatures,
      interior_features: allInteriorFeatures,
      seo_description: seoDescription,
      segment: segmentInfo?.segment,
      modifiers: segmentInfo?.modifiers,
    })
  } catch (error) {
    console.error('Analysis error:', error)
    const message = error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { join } from 'path'
import { GoogleGenAI } from '@google/genai'

// Point fontconfig at bundled fonts so librsvg resolves InterBlack / InterBold
process.env.FONTCONFIG_PATH = join(process.cwd(), 'fonts')

interface BannerRequest {
  imageUrl: string
  topText: string
  brandColor: string
  secondaryColor: string
  logoUrl?: string
  dealerName: string
  phone?: string
  mode?: 'standard' | 'exterior_features' | 'interior_features' | 'ai_banner'
  featuresList?: string[]
  vehicleName?: string
  aiModel?: 'pro' | 'flash'
}

// Profanity + garbage filter — catches truncation artifacts and inappropriate text
const BANNED_WORDS = [
  'shit', 'fuck', 'damn', 'ass', 'hell', 'bitch', 'crap', 'dick', 'piss',
]
const FILLER_PHRASES = [
  'SLEEK REAR DESIGN', 'BOLD FRONT STYLING', 'ELEGANT SIDE VIEW',
  'SLEEK PROFILE', 'DRIVER-FOCUSED', 'COMFORTABLE REAR',
  'SPACIOUS TRUNK', 'GENEROUS CARGO', 'MODERN DASHBOARD',
  'STYLISH DESIGN', 'PREMIUM LOOK', 'ELEGANT DESIGN',
  'BOLD STYLING', 'SHARP DESIGN', 'CLEAN LINES',
]

function sanitizeBannerText(text: string): string {
  let cleaned = text.toUpperCase().trim()

  // Check each word for profanity
  const words = cleaned.split(/[\s|]+/)
  for (const word of words) {
    if (BANNED_WORDS.some(b => word.toLowerCase().includes(b))) {
      // Remove the offending segment
      cleaned = cleaned.replace(new RegExp(`\\|?\\s*${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|?`, 'gi'), ' | ')
    }
  }

  // Clean up orphaned pipes
  cleaned = cleaned.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s*\|\s*\|\s*/g, ' | ').trim()

  return cleaned || 'QUALITY PRE-OWNED'
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 }
}

function darkenHex(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const darken = (c: number) => Math.max(0, Math.round(c * (1 - amount)))
  return `rgb(${darken(r)},${darken(g)},${darken(b)})`
}

function createTopBannerSvg(width: number, height: number, text: string, brandColor: string, textColor: string): Buffer {
  const fontSize = Math.min(Math.round(height * 0.48), Math.max(18, Math.floor(width / (text.length * 0.55))))
  const darkerColor = darkenHex(brandColor, 0.25)

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${darkerColor}" />
        <stop offset="50%" stop-color="${brandColor}" />
        <stop offset="100%" stop-color="${darkerColor}" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#topGrad)"/>
    <rect width="${width}" height="1" y="${height - 1}" fill="#ffffff" fill-opacity="0.15"/>
    <text x="${width / 2}" y="${height / 2 + fontSize * 0.35}"
          font-family="Arial, Helvetica, sans-serif" font-weight="900"
          font-size="${fontSize}px" fill="${textColor}"
          text-anchor="middle" letter-spacing="2">
      ${escapeXml(text)}
    </text>
  </svg>`

  return Buffer.from(svg)
}

function createBottomBannerSvg(
  width: number,
  height: number,
  dealerName: string,
  phone: string,
  brandColor: string,
): Buffer {
  const accentHeight = Math.max(3, Math.round(height * 0.06))
  const nameFontSize = Math.round(height * 0.28)
  const phoneFontSize = Math.round(height * 0.2)
  const shipFontSize = Math.round(height * 0.26)
  const subFontSize = Math.round(height * 0.18)

  const leftX = 16
  const nameY = accentHeight + nameFontSize + Math.round((height - accentHeight) * 0.15)
  const phoneY = nameY + phoneFontSize + 4

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${accentHeight}" fill="${brandColor}" y="0"/>
    <rect width="${width}" height="${height - accentHeight}" fill="#0d0d0d" y="${accentHeight}"/>

    <text x="${leftX}" y="${nameY}"
          font-family="Arial, Helvetica, sans-serif" font-weight="700"
          font-size="${nameFontSize}px" fill="#ffffff" fill-opacity="0.95"
          letter-spacing="1">
      ${escapeXml(dealerName.toUpperCase())}
    </text>
    ${phone ? `<text x="${leftX}" y="${phoneY}"
          font-family="Arial, Helvetica, sans-serif" font-weight="400"
          font-size="${phoneFontSize}px" fill="${brandColor}" fill-opacity="0.9"
          letter-spacing="0.5">
      ${escapeXml(phone)}
    </text>` : ''}

    <text x="${width - 16}" y="${nameY}"
          font-family="Arial, Helvetica, sans-serif" font-weight="900"
          font-size="${shipFontSize}px" fill="${brandColor}"
          text-anchor="end" letter-spacing="1">
      SHIPPING NATIONWIDE
    </text>
    <text x="${width - 16}" y="${phoneY}"
          font-family="Arial, Helvetica, sans-serif" font-weight="600"
          font-size="${subFontSize}px" fill="#ffffff" fill-opacity="0.7"
          text-anchor="end" letter-spacing="0.5">
      BUY FROM ANYWHERE
    </text>
  </svg>`

  return Buffer.from(svg)
}

function createFeatureOverlaySvg(
  width: number,
  height: number,
  title: string,
  features: string[],
  brandColor: string,
): Buffer {
  const padding = 40
  const titleSize = 32
  const featureSize = 18
  const lineHeight = 28
  const startY = Math.max(height * 0.2, 80)

  const featureLines = features.map((f, i) => {
    const y = startY + titleSize + 30 + (i * lineHeight)
    return `<text x="${padding + 12}" y="${y}"
          font-family="Arial, Helvetica, sans-serif" font-weight="600"
          font-size="${featureSize}px" fill="#ffffff" letter-spacing="0.5">
      ${escapeXml('\u2022  ' + f.toUpperCase())}
    </text>`
  }).join('\n')

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#000000" fill-opacity="0.65"/>
    <rect x="${padding - 8}" y="${startY - titleSize}" width="4" height="${titleSize + 20 + features.length * lineHeight}" fill="${brandColor}" rx="2"/>
    <text x="${padding + 12}" y="${startY}"
          font-family="Arial, Helvetica, sans-serif" font-weight="900"
          font-size="${titleSize}px" fill="${brandColor}" letter-spacing="3">
      ${escapeXml(title)}
    </text>
    ${featureLines}
  </svg>`

  return Buffer.from(svg)
}

async function createAiBanner(
  imageBase64: string,
  mimeType: string,
  topText: string,
  dealerName: string,
  phone: string,
  brandColor: string,
  vehicleName?: string,
  aiModel: 'pro' | 'flash' = 'pro',
): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY
  if (!apiKey) return null

  const ai = new GoogleGenAI({ apiKey })

  const headline = sanitizeBannerText(topText)
  const dealerLine = `${dealerName.toUpperCase()}${phone ? '  |  ' + phone : ''}`
  const vehicleLabel = vehicleName ? vehicleName.toUpperCase() : ''

  const modelId = aiModel === 'flash' ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview'

  const prompt = `You are a professional automotive graphic designer creating a car dealership listing photo.

TASK: Add professional dealership banner overlays to this vehicle photo.

=== WHAT TO ADD ===
1. TOP BANNER BAR: A solid colored banner bar across the ENTIRE top edge of the image (about 8-10% of image height).
   - Background color: ${brandColor} (with a subtle gradient darker at edges)
   - Text in the center: "${headline}" in bold white uppercase letters
   ${vehicleLabel ? `- Below or beside the headline, smaller: "${vehicleLabel}"` : ''}

2. BOTTOM BANNER BAR: A dark/black banner bar across the ENTIRE bottom edge (about 6-8% of image height).
   - Left side: "${dealerLine}" in white text
   - Right side: "SHIPPING NATIONWIDE" in ${brandColor} colored text
   - Below that: "BUY FROM ANYWHERE" in smaller grey text

=== ABSOLUTE RULES — CRITICAL ===
- The vehicle in the photo must remain COMPLETELY UNCHANGED — same exact color, angle, reflections, shadows, badges, wheels, everything
- Do NOT alter, retouch, recolor, move, resize, or modify the vehicle in ANY way
- Do NOT change the background or environment behind the vehicle
- ONLY add the two banner bars (top and bottom) as opaque overlays on top of the existing image
- The banners must be clean, sharp, and professional — like a real dealership overlay
- Text must be perfectly legible and correctly spelled
- The banner bars should be opaque (not transparent) — they cover whatever is behind them
- Keep the aspect ratio exactly the same as the input image

Think of this like placing sticker overlays on top of a photo — the photo underneath stays perfectly intact.`

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        { inlineData: { mimeType, data: imageBase64 } },
        prompt,
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          imageSize: '1K',
        },
      },
    })

    const parts = response.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64')
      }
    }
    return null
  } catch (err) {
    console.error('AI banner generation failed:', err)
    return null
  }
}

async function createAiFeatureOverlay(
  imageBase64: string,
  mimeType: string,
  title: string,
  features: string[],
  brandColor: string,
  aiModel: 'pro' | 'flash' = 'pro',
): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY
  if (!apiKey) return null

  const ai = new GoogleGenAI({ apiKey })
  const modelId = aiModel === 'flash' ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview'

  const featureList = features.slice(0, 15).map(f => `• ${f.toUpperCase()}`).join('\n')

  const prompt = `You are a professional automotive graphic designer. Add a feature list overlay to this vehicle photo.

=== WHAT TO CREATE ===
Add a semi-transparent dark overlay on the LEFT SIDE of the image (about 40-50% of width) with:

1. TITLE at the top: "${title}" in large bold ${brandColor} colored text
2. A thin vertical accent line in ${brandColor} on the left edge of the overlay
3. FEATURE LIST below the title, each on its own line in white text:
${featureList}

=== STYLE RULES ===
- The overlay should be dark (black at ~65% opacity) so the car is dimly visible behind it
- The right side of the image should show the vehicle clearly (no overlay there)
- Text must be crisp, clean, perfectly spelled, and easy to read
- Use a clean sans-serif font (like Helvetica or Arial)
- Title should be noticeably larger than the feature items
- Feature items should have bullet points (•) and consistent spacing
- The overall look should be premium and professional — like a luxury car brochure
- Keep the image the EXACT same size and aspect ratio as the input

=== ABSOLUTE RULES ===
- Do NOT modify the vehicle photo itself — only ADD the overlay on top
- All text must be EXACTLY as specified above — no rewording, no extra text
- Keep it clean and minimal — no decorative elements beyond what's specified`

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        { inlineData: { mimeType, data: imageBase64 } },
        prompt,
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          imageSize: '1K',
        },
      },
    })

    const parts = response.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64')
      }
    }
    return null
  } catch (err) {
    console.error('AI feature overlay generation failed:', err)
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as BannerRequest

    const imgRes = await fetch(body.imageUrl, { signal: AbortSignal.timeout(15000) })
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`)

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
    const image = sharp(imgBuffer)
    const metadata = await image.metadata()
    const origWidth = metadata.width || 1280
    const origHeight = metadata.height || 960

    // Normalize to landscape orientation — ensures consistent banner layout
    const isPortrait = origHeight > origWidth
    const width = isPortrait ? Math.max(origWidth, Math.round(origHeight * 1.33)) : origWidth
    const height = isPortrait ? Math.round(width * 0.75) : origHeight

    const brandColor = body.brandColor || '#d4a053'
    const textColor = body.secondaryColor || '#ffffff'

    if (body.mode === 'exterior_features' || body.mode === 'interior_features') {
      const title = body.mode === 'exterior_features' ? 'EXTERIOR FEATURES' : 'INTERIOR FEATURES'
      const features = body.featuresList || []

      // Try AI-generated feature overlay first
      if (body.aiModel) {
        const base64 = imgBuffer.toString('base64')
        const aiResult = await createAiFeatureOverlay(
          base64, 'image/jpeg', title, features, brandColor, body.aiModel,
        )
        if (aiResult) {
          const finalBuffer = await sharp(aiResult).jpeg({ quality: 92 }).toBuffer()
          return new Response(new Uint8Array(finalBuffer), {
            headers: {
              'Content-Type': 'image/jpeg',
              'Content-Disposition': `inline; filename="${body.mode}.jpg"`,
            },
          })
        }
        console.warn('AI feature overlay failed, falling back to SVG')
      }

      // SVG fallback
      const normalizedPhoto = await sharp(imgBuffer)
        .resize(width, height, { fit: 'contain', background: { r: 30, g: 30, b: 30 } })
        .toBuffer()

      const overlaySvg = createFeatureOverlaySvg(width, height, title, features.slice(0, 15), brandColor)

      const result = await sharp(normalizedPhoto)
        .composite([{ input: overlaySvg, top: 0, left: 0 }])
        .jpeg({ quality: 90 })
        .toBuffer()

      return new Response(new Uint8Array(result), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `inline; filename="${body.mode}.jpg"`,
        },
      })
    }

    // AI Banner mode — uses Nano Banana Pro for premium overlays
    if (body.mode === 'ai_banner') {
      const imgData = Buffer.from(await (await fetch(body.imageUrl, { signal: AbortSignal.timeout(15000) })).arrayBuffer())
      const base64 = imgData.toString('base64')

      const aiResult = await createAiBanner(
        base64,
        'image/jpeg',
        body.topText,
        body.dealerName,
        body.phone || '',
        brandColor,
        body.vehicleName,
        body.aiModel || 'pro',
      )

      if (aiResult) {
        // Ensure consistent JPEG output
        const finalBuffer = await sharp(aiResult)
          .jpeg({ quality: 92 })
          .toBuffer()

        return new Response(new Uint8Array(finalBuffer), {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="ai-bannered.jpg"',
          },
        })
      }

      // Fallback to standard mode if AI generation fails
      console.warn('AI banner failed, falling back to standard mode')
    }

    // Standard banner mode
    // Taller top bar (9%) to cover existing dealer watermarks on source photos
    const topHeight = Math.round(height * 0.09)
    const bottomHeight = Math.round(height * 0.065)
    const photoHeight = height - topHeight - bottomHeight

    // Sanitize banner text
    const cleanText = sanitizeBannerText(body.topText)

    // Resize/fit the original photo into the middle area
    const resizedPhoto = await sharp(imgBuffer)
      .resize(width, photoHeight, { fit: 'cover', position: 'centre' })
      .toBuffer()

    const topSvg = createTopBannerSvg(width, topHeight, cleanText, brandColor, textColor)
    const bottomSvg = createBottomBannerSvg(width, bottomHeight, body.dealerName, body.phone || '', brandColor)

    // Create canvas at normalized dimensions
    const canvas = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })

    const composites: sharp.OverlayOptions[] = [
      { input: topSvg, top: 0, left: 0 },
      { input: resizedPhoto, top: topHeight, left: 0 },
      { input: bottomSvg, top: topHeight + photoHeight, left: 0 },
    ]

    const result = await canvas
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer()

    return new Response(new Uint8Array(result), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'inline; filename="bannered.jpg"',
      },
    })
  } catch (error) {
    console.error('Banner creation error:', error)
    const message = error instanceof Error ? error.message : 'Banner creation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

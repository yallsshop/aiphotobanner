import { NextResponse } from 'next/server'
import sharp from 'sharp'

interface BannerRequest {
  imageUrl: string
  topText: string
  brandColor: string
  secondaryColor: string
  logoUrl?: string
  dealerName: string
  phone?: string
  mode?: 'standard' | 'exterior_features' | 'interior_features'
  featuresList?: string[]
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function createTopBannerSvg(width: number, text: string, brandColor: string, textColor: string): Buffer {
  const height = 64
  const fontSize = Math.min(36, Math.max(22, Math.floor(width / (text.length * 0.55))))

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${brandColor}" />
        <stop offset="85%" stop-color="${brandColor}" />
        <stop offset="100%" stop-color="${brandColor}" stop-opacity="0.85" />
      </linearGradient>
      <filter id="shadow" x="-2%" y="-5%" width="104%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#topGrad)" filter="url(#shadow)"/>
    <text x="${width / 2}" y="${height / 2 + fontSize * 0.35}"
          font-family="Arial Black, Impact, sans-serif" font-weight="900"
          font-size="${fontSize}px" fill="${textColor}"
          text-anchor="middle" letter-spacing="2">
      ${escapeXml(text)}
    </text>
  </svg>`

  return Buffer.from(svg)
}

function createBottomBannerSvg(
  width: number,
  dealerName: string,
  phone: string,
  brandColor: string,
  hasLogo: boolean,
): Buffer {
  const height = 56
  const accentHeight = 3
  const logoSpace = hasLogo ? 50 : 0
  const leftTextX = 16 + logoSpace

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- Accent line -->
    <rect width="${width}" height="${accentHeight}" fill="${brandColor}" y="0"/>
    <!-- Dark background -->
    <rect width="${width}" height="${height - accentHeight}" fill="#000000" fill-opacity="0.82" y="${accentHeight}"/>

    ${hasLogo ? `<!-- Logo placeholder area -->
    <rect x="12" y="${accentHeight + 8}" width="36" height="36" rx="4" fill="#ffffff" fill-opacity="0.15"/>` : ''}

    <!-- Dealer name left -->
    <text x="${leftTextX}" y="${accentHeight + 24}"
          font-family="Arial, Helvetica, sans-serif" font-weight="700"
          font-size="14px" fill="#ffffff" fill-opacity="0.95">
      ${escapeXml(dealerName.toUpperCase())}
    </text>
    ${phone ? `<text x="${leftTextX}" y="${accentHeight + 42}"
          font-family="Arial, Helvetica, sans-serif" font-weight="400"
          font-size="12px" fill="#ffffff" fill-opacity="0.7">
      ${escapeXml(phone)}
    </text>` : ''}

    <!-- Right side: shipping text -->
    <text x="${width - 16}" y="${accentHeight + 22}"
          font-family="Arial Black, Impact, sans-serif" font-weight="900"
          font-size="16px" fill="${brandColor}"
          text-anchor="end" letter-spacing="1">
      SHIPPING NATIONWIDE
    </text>
    <text x="${width - 16}" y="${accentHeight + 42}"
          font-family="Arial, Helvetica, sans-serif" font-weight="600"
          font-size="12px" fill="#ffffff" fill-opacity="0.8"
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
    <!-- Dark overlay -->
    <rect width="${width}" height="${height}" fill="#000000" fill-opacity="0.65"/>
    <!-- Left accent bar -->
    <rect x="${padding - 8}" y="${startY - titleSize}" width="4" height="${titleSize + 20 + features.length * lineHeight}" fill="${brandColor}" rx="2"/>
    <!-- Title -->
    <text x="${padding + 12}" y="${startY}"
          font-family="Arial Black, Impact, sans-serif" font-weight="900"
          font-size="${titleSize}px" fill="${brandColor}" letter-spacing="3">
      ${escapeXml(title)}
    </text>
    <!-- Features list -->
    ${featureLines}
  </svg>`

  return Buffer.from(svg)
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as BannerRequest

    // Fetch the source image
    const imgRes = await fetch(body.imageUrl, { signal: AbortSignal.timeout(15000) })
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`)

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
    const image = sharp(imgBuffer)
    const metadata = await image.metadata()
    const width = metadata.width || 1280
    const height = metadata.height || 960

    const brandColor = body.brandColor || '#d4a053'
    const textColor = body.secondaryColor || '#ffffff'

    if (body.mode === 'exterior_features' || body.mode === 'interior_features') {
      // Feature overlay mode
      const title = body.mode === 'exterior_features' ? 'EXTERIOR FEATURES' : 'INTERIOR FEATURES'
      const features = body.featuresList || []

      const overlaySvg = createFeatureOverlaySvg(width, height, title, features.slice(0, 15), brandColor)

      const result = await image
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

    // Standard banner mode
    const topSvg = createTopBannerSvg(width, body.topText, brandColor, textColor)
    const bottomSvg = createBottomBannerSvg(width, body.dealerName, body.phone || '', brandColor, !!body.logoUrl)

    // Extend image canvas to add banners
    const topHeight = 64
    const bottomHeight = 56
    const totalHeight = topHeight + height + bottomHeight

    // Create the final composite
    const canvas = sharp({
      create: {
        width,
        height: totalHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })

    const composites: sharp.OverlayOptions[] = [
      // Top banner
      { input: topSvg, top: 0, left: 0 },
      // Original photo
      { input: imgBuffer, top: topHeight, left: 0 },
      // Bottom banner
      { input: bottomSvg, top: topHeight + height, left: 0 },
    ]

    // Add dealer logo to bottom banner if available
    if (body.logoUrl) {
      try {
        const logoRes = await fetch(body.logoUrl, { signal: AbortSignal.timeout(10000) })
        if (logoRes.ok) {
          const logoBuf = Buffer.from(await logoRes.arrayBuffer())
          const resizedLogo = await sharp(logoBuf)
            .resize(36, 36, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer()

          composites.push({
            input: resizedLogo,
            top: topHeight + height + 3 + 8,
            left: 12,
          })
        }
      } catch {
        // Logo fetch failed, skip it
      }
    }

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

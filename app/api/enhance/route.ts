import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! })

interface EnhanceRequest {
  imageUrl: string
  instruction: string
  model?: 'flash' | 'pro'
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
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

    const body = await req.json() as EnhanceRequest

    if (!body.imageUrl || !body.instruction) {
      return NextResponse.json({ error: 'imageUrl and instruction required' }, { status: 400 })
    }

    const imageData = await fetchImageAsBase64(body.imageUrl)
    if (!imageData) {
      return NextResponse.json({ error: 'Failed to fetch source image' }, { status: 400 })
    }

    const modelId = body.model === 'pro'
      ? 'gemini-3-pro-image-preview'
      : 'gemini-3.1-flash-image-preview'

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          inlineData: {
            mimeType: imageData.mimeType,
            data: imageData.data,
          },
        },
        `You are a professional automotive photo editor. Edit this vehicle photo according to this instruction:\n\n${body.instruction}\n\nIMPORTANT RULES:\n- Keep the vehicle EXACTLY as it is — same make, model, color, angle\n- Only modify what the instruction asks for\n- Maintain photorealistic quality suitable for a car dealership listing\n- Do NOT add text, watermarks, or logos to the image\n- Produce a clean, professional result`,
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          imageSize: '1K',
        },
      },
    })

    // Extract the generated image
    const parts = response.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data!, 'base64')
        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': part.inlineData.mimeType || 'image/png',
            'Content-Disposition': 'inline; filename="enhanced.png"',
          },
        })
      }
    }

    return NextResponse.json({ error: 'No image generated — model may have refused the edit' }, { status: 500 })
  } catch (error) {
    console.error('Enhancement error:', error)
    const message = error instanceof Error ? error.message : 'Enhancement failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { MODELS, MODEL_SETTINGS, INVENTORY_PARSE_PROMPT } from '@/lib/ai-prompts'

export const maxDuration = 120

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! })

const VEHICLE_ARRAY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    vehicles: {
      type: Type.ARRAY,
      description: 'Array of vehicles extracted from the file',
      items: {
        type: Type.OBJECT,
        properties: {
          vin: { type: Type.STRING, description: 'Vehicle Identification Number (17 chars). Leave empty string if not found.' },
          year: { type: Type.NUMBER, description: 'Model year (e.g. 2024)' },
          make: { type: Type.STRING, description: 'Manufacturer (e.g. Ford, Toyota, BMW)' },
          model: { type: Type.STRING, description: 'Model name (e.g. F-150, Camry, X5)' },
          trim: { type: Type.STRING, description: 'Trim level (e.g. XLT, SE, M Sport)' },
          stockNumber: { type: Type.STRING, description: 'Dealer stock number' },
          mileage: { type: Type.NUMBER, description: 'Odometer reading in miles' },
          exteriorColor: { type: Type.STRING, description: 'Exterior color' },
          interiorColor: { type: Type.STRING, description: 'Interior color' },
          bodyStyle: { type: Type.STRING, description: 'Body type (Sedan, SUV, Truck, Coupe, etc.)' },
          engine: { type: Type.STRING, description: 'Engine description' },
          transmission: { type: Type.STRING, description: 'Transmission type' },
          driveType: { type: Type.STRING, description: 'Drivetrain (FWD, RWD, AWD, 4WD)' },
          fuelType: { type: Type.STRING, description: 'Fuel type (Gasoline, Diesel, Electric, Hybrid)' },
          price: { type: Type.NUMBER, description: 'Asking/listed price in dollars' },
          photoUrls: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'URLs of vehicle photos if present in the data',
          },
          detailUrl: { type: Type.STRING, description: 'URL to vehicle detail page if present' },
          features: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of vehicle features/options',
          },
        },
        required: ['vin', 'year', 'make', 'model'],
      },
    },
  },
  required: ['vehicles'],
}

// Parse prompt imported from lib/ai-prompts.ts

export async function POST(req: Request) {
  try {
    if (!process.env.GOOGLE_GENAI_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_GENAI_API_KEY not configured' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read file content
    let fileContent: string
    const fileName = file.name.toLowerCase()

    // For text-based files, read as text
    if (
      fileName.endsWith('.csv') ||
      fileName.endsWith('.tsv') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.xml') ||
      fileName.endsWith('.html') ||
      fileName.endsWith('.json') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.yml') ||
      fileName.endsWith('.yaml')
    ) {
      fileContent = await file.text()
    } else {
      // For binary files (xlsx, xls, pdf, etc.), read as base64
      const buffer = await file.arrayBuffer()
      fileContent = `[Binary file: ${file.name}, type: ${file.type}, size: ${file.size} bytes]\n\nBase64 content (first 100KB):\n${Buffer.from(buffer.slice(0, 100000)).toString('base64')}`
    }

    // Truncate very large files to avoid token limits (keep first ~500KB of text)
    const MAX_CHARS = 500000
    if (fileContent.length > MAX_CHARS) {
      fileContent = fileContent.slice(0, MAX_CHARS) + '\n\n[... content truncated due to size ...]'
    }

    const prompt = `${INVENTORY_PARSE_PROMPT}

File name: ${file.name}
File type: ${file.type || 'unknown'}

--- FILE CONTENT START ---
${fileContent}
--- FILE CONTENT END ---`

    const response = await ai.models.generateContent({
      model: MODELS.parse,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: VEHICLE_ARRAY_SCHEMA,
        maxOutputTokens: MODEL_SETTINGS.parse.maxOutputTokens,
      },
    })

    const parsed = JSON.parse(response.text || '{"vehicles": []}')
    const vehicles = parsed.vehicles || []

    if (vehicles.length === 0) {
      return NextResponse.json(
        { error: 'No vehicles could be extracted from this file. Make sure it contains car/vehicle inventory data.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ vehicles, count: vehicles.length })
  } catch (error) {
    console.error('Parse error:', error)
    const message = error instanceof Error ? error.message : 'File parsing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

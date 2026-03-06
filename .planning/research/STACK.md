# Technology Stack

**Project:** AI Photo Banner
**Researched:** 2026-03-06

## Recommended Stack

### Core Framework (Committed)
| Technology | Version | Purpose | Why |
|-|-|-|-|
| Next.js | 15.x | Full-stack framework | App Router, API routes for image processing, committed stack |
| TypeScript | 5.x | Type safety | Committed stack |
| Tailwind CSS | 4.x | Styling | Committed stack |

### Database & Auth (Committed)
| Technology | Version | Purpose | Why |
|-|-|-|-|
| @supabase/supabase-js | ^2.98.0 | DB client, Auth, Storage, Queues | Committed stack. Handles dealer accounts, photo storage, metadata, and job queuing via pgmq |
| @supabase/ssr | ^0.6.x | Next.js SSR auth helpers | Required for App Router server components auth |

### AI Services
| Technology | Version | Purpose | Why |
|-|-|-|-|
| @google/genai | ^1.44.0 | Gemini API client | NEW official SDK replacing @google/generative-ai. Actively maintained, supports image generation natively. Do NOT use the legacy @google/generative-ai package |

**Gemini Model IDs:**
- Vision analysis: `gemini-2.5-flash` (fast, cheap, accurate for photo classification)
- Image generation (standard): `gemini-2.5-flash-image` (Nano Banana - speed optimized, bulk use)
- Image generation (premium): `gemini-3-pro-image-preview` (Nano Banana Pro - highest quality, premium tier)
- Image generation (latest): `gemini-3.1-flash-image-preview` (Nano Banana 2 - Pro quality at Flash speed, released Feb 2026)

### Image Processing
| Technology | Version | Purpose | Why |
|-|-|-|-|
| sharp | ^0.34.5 | Banner compositing, resizing, format conversion | Fastest Node.js image library. Text overlay via SVG compositing. Vercel auto-bundles Sharp for Next.js image optimization, but custom API route usage needs explicit install |

**Sharp for banner text overlays:** Sharp has no native text rendering. The pattern is: generate SVG with styled text, then composite SVG onto the photo using `sharp.composite()`. This is deterministic and pixel-perfect, unlike AI-generated text.

**Sharp on Vercel warning:** Known compatibility issues with Sharp on Vercel serverless, especially with pnpm. Use npm (not pnpm) and add sharp as an explicit dependency. If deployment fails, pin to a known-good version (0.33.5 or 0.34.5). Add to `serverExternalPackages` in next.config.js.

**Sharp in Supabase Edge Functions:** The ARCHITECTURE.md recommends running Sharp in Supabase Edge Functions (Deno runtime) to avoid Vercel timeout/memory limits. Edge Functions support npm packages including Sharp via npm: specifier. This is the preferred approach for heavy processing.

### Bulk Processing Queue
| Technology | Version | Purpose | Why |
|-|-|-|-|
| Supabase Queues (pgmq) | Built into Supabase | Job queue for bulk photo processing | Zero additional dependencies. pgmq is PostgreSQL-native message queue built into Supabase. Combined with pg_cron (scheduled triggers) and Edge Functions (workers), provides a complete async processing pipeline without any external service |

**How it works:**
1. Upload enqueues one message per photo to pgmq queue
2. pg_cron triggers a Supabase Edge Function every 10 seconds
3. Edge Function pops N messages (batch of 5), processes each photo
4. Each photo: fetch from Storage -> Gemini vision -> Sharp composite -> save to Storage
5. Status updates in DB -> Supabase Realtime pushes progress to client

**Why not QStash/BullMQ/Inngest:**
- QStash (@upstash/qstash ^2.8.4) is a solid alternative if you prefer HTTP-based queuing, but adds another service + API keys
- BullMQ requires Redis + persistent server, incompatible with serverless
- Supabase Queues keeps everything in one platform with zero additional cost

**Fallback option:** If Supabase Queues proves insufficient (throughput limits, complex retry logic), migrate to QStash. The per-photo processing logic stays identical -- only the queue dispatch changes.

### VIN Decode
| Technology | Version | Purpose | Why |
|-|-|-|-|
| @shaggytools/nhtsa-api-wrapper | ^3.x | NHTSA VPIC API wrapper | Free government API, no API key needed, returns make/model/year/trim/engine/features. Most complete VIN data source. Alternative: direct fetch to `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json` if you want zero dependencies |

### File Export
| Technology | Version | Purpose | Why |
|-|-|-|-|
| archiver | ^7.0.1 | ZIP file generation | Streaming ZIP creation for bulk download. Mature, widely used. Generate ZIP on API route, stream to client |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|-|-|-|-|
| react-dropzone | ^14.x | Drag-and-drop file upload UI | Bulk photo upload interface |
| uuid | ^11.x | Unique IDs for photos/jobs | File path generation in Supabase Storage |
| zod | ^3.x | Schema validation | API input validation, form validation |

## What NOT to Add

| Technology | Why Not |
|-|-|
| @upstash/qstash | Supabase Queues (pgmq) handles job queuing without adding another service. Reserve QStash as fallback if pgmq proves insufficient |
| BullMQ / Redis | Requires persistent server. Vercel is serverless |
| Pillow / Python | PROJECT.md mentions Pillow from proof-of-concept. Sharp does everything Pillow does in Node.js. No need for a Python sidecar |
| Canvas (node-canvas) | Native dependency nightmares on Vercel. Sharp's SVG compositing handles text overlays without it |
| ImageMagick | Heavy, slow, hard to deploy serverless. Sharp is faster and simpler |
| Cloudinary / imgix | Adds cost and external dependency for something Sharp handles locally |
| @google/generative-ai | Legacy package, no longer actively developed. Use @google/genai instead |
| Inngest / Trigger.dev | More complex than needed. Supabase Queues is simpler for this use case |
| Vercel AI SDK (@ai-sdk/google) | Adds abstraction layer we don't need. Direct @google/genai SDK gives more control over image generation params |

## Supabase Storage Architecture

**Buckets:**
- `originals` - Raw uploaded photos (private, RLS by dealer_id path prefix)
- `bannered` - Processed banner photos (private, RLS by dealer_id path prefix)
- `ads` - Generated social ad images (private, RLS by dealer_id path prefix)
- `assets` - Logos, brand assets (private, RLS by dealer_id path prefix)

**File path pattern:** `{dealer_id}/{batch_id}/{photo_id}.{ext}`

**Upload method:** Use signed upload URLs (createSignedUploadUrl) for direct client-to-Storage uploads, bypassing Vercel's 4.5MB payload limit. Use resumable uploads (tus protocol) for files over 6MB.

**Signed URLs:** Use signed URLs (2hr expiry) for download links. Never expose service role key client-side.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|-|-|-|-|
| Image processing | Sharp | Pillow (Python) | Extra runtime, Sharp handles everything needed in Node.js |
| Image processing | Sharp | node-canvas | Native build issues on Vercel, Sharp SVG compositing is simpler |
| Queue | Supabase Queues (pgmq) | QStash | Extra service + cost. pgmq is built into Supabase. QStash is viable fallback |
| Queue | Supabase Queues (pgmq) | BullMQ | Needs Redis + server, not Vercel-compatible |
| AI SDK | @google/genai | @google/generative-ai | Legacy, no longer maintained |
| AI SDK | @google/genai | Vercel AI SDK | Adds abstraction layer, less control over image generation |
| VIN decode | NHTSA API (free) | DataOne, VehicleDatabases | NHTSA is free and comprehensive enough for make/model/trim/features. Paid APIs for v2 if more data needed |
| Storage | Supabase Storage | AWS S3 | Already using Supabase, no need for another service |

## Installation

```bash
# Core (already from create-next-app)
npm install next@latest react@latest react-dom@latest

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# AI
npm install @google/genai

# Image Processing
npm install sharp

# VIN Decode
npm install @shaggytools/nhtsa-api-wrapper

# File Export
npm install archiver

# UI & Utilities
npm install react-dropzone uuid zod

# Dev dependencies
npm install -D @types/archiver @types/uuid
```

**Note:** No queue package needed in Next.js -- Supabase Queues (pgmq) is managed via SQL/Supabase dashboard. Edge Functions for workers are deployed separately via Supabase CLI.

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Gemini AI
GOOGLE_GENAI_API_KEY=
```

**Note:** No QStash keys needed -- Supabase Queues uses the existing Supabase connection. Two fewer secrets to manage.

## Sources

- [Sharp official docs](https://sharp.pixelplumbing.com/) - v0.34.5, compositing API
- [Sharp compositing API](https://sharp.pixelplumbing.com/api-composite/) - SVG text overlay pattern
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) - v1.44.0, replaces legacy SDK
- [Gemini image generation docs](https://ai.google.dev/gemini-api/docs/image-generation) - Nano Banana API
- [Nano Banana 2 announcement](https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/) - Feb 2026
- [Supabase Queues (pgmq)](https://supabase.com/docs/guides/queues) - Built-in message queue
- [Processing Large Jobs with Edge Functions](https://supabase.com/blog/processing-large-jobs-with-edge-functions) - Queue + Edge Function pattern
- [Vercel function limits](https://vercel.com/docs/functions/limitations) - timeout constraints
- [@supabase/supabase-js npm](https://www.npmjs.com/package/@supabase/supabase-js) - v2.98.0
- [Supabase Storage quickstart](https://supabase.com/docs/guides/storage/quickstart)
- [NHTSA API wrapper](https://www.npmjs.com/package/@shaggytools/nhtsa-api-wrapper)
- [archiver npm](https://www.npmjs.com/package/archiver) - v7.0.1

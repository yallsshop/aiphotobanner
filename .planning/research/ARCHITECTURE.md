# Architecture Patterns

**Domain:** AI Photo Banner SaaS for Car Dealerships
**Researched:** 2026-03-06

## Recommended Architecture

### High-Level Flow

```
Upload Photos → Supabase Storage
                    ↓
            Create Job Record (Supabase DB)
                    ↓
            Queue Messages (pgmq via Supabase Queues)
                    ↓
            pg_cron triggers Edge Function (every 10s)
                    ↓
        ┌── Edge Function pops message ──┐
        │                                │
   Gemini Vision API              Read from Storage
   (classify photo)                     │
        │                               │
   Save analysis to DB                  │
        │                               │
   Sharp compositing ←── template + analysis + branding
        │
   Upload bannered image → Supabase Storage
        │
   Update job progress in DB
        │
   Supabase Realtime → Client gets live progress
```

### Why This Architecture

**The core constraint is Vercel's serverless timeout.** Even on Pro (800s), processing 500 vehicles x 30 photos = 15,000 images cannot happen in a single request. The architecture must be async with a job queue.

**Supabase is the queue, not a third-party service.** Supabase Queues (pgmq) + pg_cron + Edge Functions provide a complete job processing system without adding Redis, BullMQ, or external workers. This keeps the stack minimal.

**Sharp runs in Edge Functions, not Vercel serverless.** Supabase Edge Functions (Deno) support npm packages including Sharp. This avoids Vercel's memory/timeout constraints for image compositing. Edge Functions have a 150s wall-clock limit for background tasks, which is enough for processing batches of 5-10 images per invocation.

## Component Boundaries

| Component | Responsibility | Communicates With |
|-|-|-|
| Next.js App (Vercel) | UI, auth pages, API routes for uploads, template management | Supabase DB, Supabase Storage, Supabase Auth |
| Supabase Auth | Dealer authentication, session management | Next.js middleware, RLS policies |
| Supabase Database | Jobs, photos, templates, dealer config, queue (pgmq) | Edge Functions, Next.js API routes, Realtime |
| Supabase Storage | Original photos, bannered photos, dealer logos, templates | Edge Functions, Next.js (signed URLs) |
| Supabase Edge Functions | Photo processing workers (Vision + Sharp compositing) | Gemini API, Supabase DB, Supabase Storage |
| Supabase Realtime | Live progress updates to client | Supabase DB (postgres_changes), Next.js client |
| Gemini API | Vision analysis, Nano Banana image generation | Edge Functions only |
| pg_cron | Scheduled queue polling (every 10s) | Edge Functions, pgmq |

## Data Flow: Upload-to-Download Pipeline

### Phase 1: Upload

1. Dealer selects photos (drag-drop or bulk upload)
2. Next.js API route validates files, creates `batch` record in DB
3. Photos uploaded directly to Supabase Storage (`originals/{dealer_id}/{batch_id}/`)
4. For each photo, create `photo` record with status `uploaded`
5. Enqueue one message per photo to `photo_processing` queue via pgmq

### Phase 2: AI Vision Analysis

1. pg_cron triggers Edge Function every 10 seconds
2. Edge Function pops N messages (batch of 5) from queue
3. For each photo:
   - Download from Storage
   - Call Gemini Vision API: "Classify this vehicle photo and describe key features"
   - Save classification + feature tags to `photo.analysis` JSON column
   - Update photo status to `analyzed`
4. If VIN data available, enrich analysis with decoded vehicle specs

### Phase 3: Banner Compositing

1. After analysis, enqueue to `banner_generation` queue
2. Edge Function pops messages, for each:
   - Load original photo from Storage
   - Load dealer's template config (colors, fonts, logo, positions)
   - Generate banner text from analysis + vehicle data
   - Use Sharp to composite: resize, add text overlay, add logo, add gradient bars
   - Upload result to Storage (`bannered/{dealer_id}/{batch_id}/`)
   - Update photo status to `bannered`

### Phase 4: Social Ad Generation (Premium)

1. For photos marked for social ads, enqueue to `ad_generation` queue
2. Edge Function calls Gemini Nano Banana:
   - Background swap / dramatic lighting
   - Generate social-format images (1080x1080 square, 1080x1920 story)
3. Upload to Storage (`ads/{dealer_id}/{batch_id}/`)
4. Update photo status to `complete`

### Phase 5: Download

1. Client polls or receives Realtime update that batch is complete
2. Next.js API route generates ZIP of bannered photos using archiver
3. Return signed download URL (or stream directly)

## Database Schema (Core Tables)

```sql
-- Dealer accounts (multi-tenant root)
CREATE TABLE dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  logo_url TEXT,
  brand_colors JSONB DEFAULT '{"primary": "#000000", "secondary": "#FFFFFF"}',
  default_template_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Processing batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) NOT NULL,
  name TEXT,
  vehicle_vin TEXT,
  vehicle_data JSONB, -- decoded VIN data
  status TEXT DEFAULT 'uploading', -- uploading, processing, complete, failed
  total_photos INT DEFAULT 0,
  processed_photos INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual photos
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id) NOT NULL,
  dealer_id UUID NOT NULL, -- denormalized for RLS
  original_path TEXT NOT NULL,
  bannered_path TEXT,
  ad_path TEXT,
  status TEXT DEFAULT 'uploaded', -- uploaded, analyzing, analyzed, compositing, bannered, complete, failed
  analysis JSONB, -- AI vision output
  banner_config JSONB, -- override per-photo if needed
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Banner templates
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id), -- NULL = system template
  name TEXT NOT NULL,
  config JSONB NOT NULL, -- positions, fonts, colors, overlay style
  preview_url TEXT,
  is_default BOOLEAN DEFAULT false
);
```

## Multi-Tenancy via RLS

Every table has a `dealer_id` column. RLS policies enforce tenant isolation:

```sql
-- Example: photos table
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers see own photos" ON photos
  FOR ALL USING (
    dealer_id = (SELECT id FROM dealers WHERE user_id = auth.uid())
  );
```

Storage buckets use path-based access control:
- `originals/{dealer_id}/*` -- only accessible by that dealer
- `bannered/{dealer_id}/*` -- same

This is simpler than org/membership models because v1 is one user per dealer account.

## Patterns to Follow

### Pattern 1: Queue-per-stage Pipeline

**What:** Separate pgmq queues for each processing stage (analysis, compositing, ad generation)
**Why:** Allows independent scaling, retry, and monitoring per stage. A failure in ad generation does not block banner delivery.

### Pattern 2: Optimistic Progress via Realtime

**What:** Subscribe to `photos` table changes filtered by `batch_id`. As each photo's status updates, client recalculates progress percentage.
**Why:** No polling needed. Supabase Realtime pushes postgres_changes events via WebSocket.

```typescript
// Client-side progress tracking
const channel = supabase
  .channel(`batch-${batchId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'photos',
    filter: `batch_id=eq.${batchId}`
  }, (payload) => {
    updateProgress(payload.new.status);
  })
  .subscribe();
```

### Pattern 3: Chunked Queue Processing

**What:** Edge Function processes 5 photos per invocation, not 1 and not 100.
**Why:** Balances throughput vs. Edge Function timeout (150s). Gemini Vision takes ~2-5s per image. 5 images = ~25s processing + overhead = well within limits.

### Pattern 4: Idempotent Workers

**What:** Each queue message contains photo_id. Worker checks current status before processing. If already processed, skip and delete message.
**Why:** pgmq visibility timeout can cause re-delivery. Idempotency prevents duplicate work.

### Pattern 5: Storage Path Convention

**What:** All paths follow `{type}/{dealer_id}/{batch_id}/{photo_id}.{ext}`
**Why:** Enables bulk operations (list all bannered photos for a batch), straightforward RLS, and clean ZIP generation.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Processing in Vercel API Routes

**What:** Running Sharp or Gemini API calls in Next.js API routes
**Why bad:** Vercel Hobby has 60s timeout. Even Pro at 800s cannot handle bulk workloads. Memory is limited to 1024MB on Hobby. Sharp on a 5000x5000 image uses ~600MB.
**Instead:** All heavy processing in Supabase Edge Functions triggered by queue.

### Anti-Pattern 2: Synchronous Bulk Processing

**What:** Waiting for all photos to process before returning a response
**Why bad:** 500 vehicles x 30 photos = hours of processing. No serverless function can hold that.
**Instead:** Fire-and-forget with queue. Return immediately. Push progress via Realtime.

### Anti-Pattern 3: Storing Processing State in Memory

**What:** Tracking which photos are done in a variable or cache
**Why bad:** Serverless functions are stateless. Edge Functions restart between invocations.
**Instead:** Database is the source of truth for all status.

### Anti-Pattern 4: Single Queue for Everything

**What:** One queue for analysis + compositing + ad generation
**Why bad:** Cannot independently retry or scale stages. A slow Gemini API blocks banner compositing.
**Instead:** Pipeline of queues: analysis_queue -> compositing_queue -> ad_queue.

## Vercel Serverless Constraints and Mitigations

| Constraint | Hobby Plan | Pro Plan | Mitigation |
|-|-|-|-|
| Function timeout | 60s | 800s | Heavy processing in Supabase Edge Functions, not Vercel |
| Memory | 1024MB | 3009MB | Sharp runs in Edge Functions; Vercel only handles UI/uploads |
| Payload size | 4.5MB | 4.5MB | Direct upload to Supabase Storage via signed URLs, bypass Vercel |
| Functions per deployment | 12 | Unlimited | Use App Router (auto-bundles), not pages/api |
| Bandwidth | 100GB/mo | 1TB/mo | Serve images from Supabase Storage CDN, not Vercel |

### Direct Upload Pattern (Critical)

Photos must NOT flow through Vercel. Use Supabase Storage signed upload URLs:

```typescript
// API route: generate signed URL (fast, no file data)
const { data } = await supabase.storage
  .from('originals')
  .createSignedUploadUrl(`${dealerId}/${batchId}/${photoId}.jpg`);

// Client: upload directly to Supabase Storage
await fetch(data.signedUrl, { method: 'PUT', body: file });
```

## Gemini API Rate Limiting Strategy

| Tier | RPM | RPD | IPM | Strategy |
|-|-|-|-|-|
| Free | ~15 | ~250 | ~15 | Unusable for production |
| Pay-as-you-go Tier 1 | 500 | 10,000 | 500 | Viable for small dealers |
| Tier 2+ | 2000+ | 30,000+ | 2000+ | Target tier for production |

**Handling rate limits:**
- Edge Function processes 5 photos per batch with 1s delay between Gemini calls
- On 429 response, re-queue message with increased visibility timeout (exponential backoff)
- Track daily RPD usage in dealer table, pause processing if approaching limit
- Consider Gemini Batch API for non-urgent workloads (50% cost reduction, 24h window)

## Scalability Considerations

| Concern | 10 dealers | 100 dealers | 1000 dealers |
|-|-|-|-|
| Queue throughput | pg_cron every 10s is fine | pg_cron every 5s, larger batch size | Multiple Edge Function workers, parallel queues |
| Storage | ~50GB, Supabase free tier | ~500GB, Supabase Pro | ~5TB, consider S3 + Supabase proxy |
| Gemini API | Tier 1 sufficient | Tier 2 needed, rate limiting critical | Multiple API keys or Batch API |
| Realtime connections | Trivial | Supabase Pro handles | May need connection pooling |
| Database | Single Supabase instance | Add indexes on dealer_id + status | Consider partitioning photos table |

## Suggested Build Order

Based on dependency analysis:

### Phase 1: Foundation (Week 1-2)
- Supabase project setup (Auth, DB schema, Storage buckets)
- Next.js app with Supabase client
- Dealer registration + login
- RLS policies on all tables
- **Rationale:** Everything depends on auth and data model

### Phase 2: Upload Pipeline (Week 2-3)
- Signed URL upload flow
- Batch creation UI
- Photo records in DB
- Storage organization
- **Rationale:** Cannot process what you cannot upload

### Phase 3: AI Vision Analysis (Week 3-4)
- Supabase Edge Function for Gemini Vision
- pgmq queue setup + pg_cron trigger
- Photo classification + analysis storage
- Rate limiting + error handling
- **Rationale:** Analysis feeds compositing; must work before banners

### Phase 4: Banner Compositing (Week 4-5)
- Template system (DB + config schema)
- Sharp compositing in Edge Function
- Text generation from analysis + vehicle data
- Banner preview in UI
- **Rationale:** Core value proposition; depends on analysis output

### Phase 5: Progress + Polish (Week 5-6)
- Realtime progress tracking
- Batch status dashboard
- Bulk ZIP download
- Per-photo preview + edit overrides
- **Rationale:** UX layer on top of working pipeline

### Phase 6: Social Ads + VIN (Week 6-7)
- Nano Banana integration for ad generation
- VIN decode API integration
- Social format templates
- **Rationale:** Premium features, not core MVP blocker

## Sources

- [Vercel Function Limits](https://vercel.com/docs/limits) -- HIGH confidence
- [Vercel Functions Limitations](https://vercel.com/docs/functions/limitations) -- HIGH confidence
- [Supabase Background Tasks](https://supabase.com/docs/guides/functions/background-tasks) -- HIGH confidence
- [Supabase Queues (pgmq)](https://supabase.com/docs/guides/queues) -- HIGH confidence
- [Processing Large Jobs with Edge Functions, Cron, and Queues](https://supabase.com/blog/processing-large-jobs-with-edge-functions) -- HIGH confidence
- [Consuming Queue Messages with Edge Functions](https://supabase.com/docs/guides/queues/consuming-messages-with-edge-functions) -- HIGH confidence
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) -- HIGH confidence
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) -- HIGH confidence
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) -- HIGH confidence
- [Sharp Compositing API](https://sharp.pixelplumbing.com/api-composite/) -- HIGH confidence
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) -- HIGH confidence
- [Supabase RLS Best Practices for Multi-Tenant Apps](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) -- MEDIUM confidence

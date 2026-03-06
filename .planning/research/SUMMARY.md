# Project Research Summary

**Project:** AI Photo Banner
**Domain:** SaaS - AI-powered vehicle photo marketing automation for car dealerships
**Researched:** 2026-03-06
**Confidence:** HIGH

## Executive Summary

The AI Photo Banner platform automates dealership photo marketing by combining AI vision classification with banner overlay compositing. The product fills a clear gap: competitors like HomeNet and AutoManager offer static overlays with manual text, while Spyne/Impel focus on background replacement. Nobody combines AI photo classification + contextual text generation + banner overlays. The production stack is Next.js + Supabase + Vercel with Sharp for compositing and Gemini for AI vision/generation -- no Python sidecar needed (Sharp replaces Pillow from the proof-of-concept).

The dominant architectural challenge is bulk processing at dealer scale (50-500 vehicles x 20-40 photos = up to 20,000 images per dealer). Vercel serverless cannot handle this synchronously. The solution is a pgmq queue pipeline inside Supabase: upload enqueues messages, pg_cron triggers Edge Functions every 10 seconds, each invocation processes 5 photos through Gemini Vision then Sharp compositing. Supabase Realtime pushes progress to the client via WebSocket. This keeps everything on one platform with zero additional services. The architecture uses separate queues per stage (analysis, compositing, ad generation) so failures in one stage do not block others.

Key risks are Sharp native binary mismatches on Vercel deployment (test early), Gemini API rate limits killing bulk processing (enable billing, implement exponential backoff), and RLS not being enabled on new tables (data breach between competing dealerships). All three must be addressed in Phase 1 architecture decisions. Secondary risks include egress costs at scale ($0.09/GB uncached beyond 250GB) and font rendering differences between Windows dev and Linux production.

## Key Findings

### Recommended Stack

The stack is minimal by design -- Supabase handles auth, database, storage, queues, realtime, and edge compute. Only two external services: Gemini API and Vercel hosting.

**Core technologies:**
- **Next.js 15.x (App Router):** Full-stack framework for UI, auth pages, upload orchestration
- **Sharp 0.34.5:** Banner compositing via SVG text overlay. Fastest Node.js image lib. Runs in Edge Functions, not Vercel
- **@google/genai 1.44.0:** NEW official Gemini SDK (replaces legacy @google/generative-ai). Vision analysis + Nano Banana image generation
- **Supabase (DB + Auth + Storage + Queues + Edge Functions + Realtime):** Entire backend platform. pgmq for job queuing, pg_cron for triggers, Edge Functions for workers
- **@shaggytools/nhtsa-api-wrapper:** Free NHTSA VIN decode -- no API key needed
- **archiver 7.0.1:** Streaming ZIP generation for bulk download

**Gemini model tiers:**
- Vision analysis: `gemini-2.5-flash` (fast, cheap)
- Image gen standard: `gemini-2.5-flash-image` (bulk use)
- Image gen premium: `gemini-3-pro-image-preview` (highest quality)
- Image gen latest: `gemini-3.1-flash-image-preview` (Pro quality at Flash speed, Feb 2026)

**What NOT to add:** BullMQ (needs Redis), node-canvas (native dep nightmares), Cloudinary (unnecessary cost), @google/generative-ai (legacy), Vercel AI SDK (unnecessary abstraction), Pillow/Python (Sharp covers it).

### Expected Features

**Must have (table stakes) -- dealers expect these from any overlay tool:**
- Photo upload (drag-and-drop, multi-file, JPEG/PNG/HEIC)
- Banner overlay on photos (top bar, bottom bar, or both)
- Preset banner templates (10-15 styles)
- Dealer branding (logo, colors, fonts)
- Dealer accounts with saved preferences
- Bulk processing (apply template to entire inventory)
- Bulk download (ZIP with organized folders)
- Photo preview before export (before/after toggle)
- Text customization (font, size, color, position via dropdowns)
- Rule-based overlay application (target by make/model/status)

**Should have (differentiators -- our competitive moat):**
- AI vision photo classification (no competitor does this)
- AI-generated contextual banner text from photo content + VIN data (the killer feature)
- VIN decode data enrichment (NHTSA free tier)
- AI-generated social media ad graphics via Nano Banana
- Smart photo ordering (auto-sort by photo type)

**Anti-features (explicitly NOT building in v1):**
- Full drag-and-drop banner editor (Canva exists; presets + tweaks cover 90%)
- Direct social media posting (dealers have existing tools)
- Background replacement (Spyne/Impel own this; different product)
- Website embed / DMS integration (6-12 month projects each)
- Real-time collaboration (dealers are 1-2 people, not teams)
- Mobile app (responsive web sufficient)
- Pricing/billing/Stripe (premature before product-market fit)

**Competitive landscape:** HomeNet (static overlays, no AI), AutoManager (basic overlays), Zopdealer (static templates), Spyne (AI backgrounds, not banners), Impel (AI enhancement, not text overlays), Xcite (enterprise OEM compliance). Our gap: nobody combines AI vision + contextual text + overlays.

### Architecture Approach

The architecture is a multi-stage async pipeline running entirely within Supabase. Photos flow through: Upload to Storage -> pgmq queue -> Edge Function workers -> Gemini Vision analysis -> Sharp compositing -> bannered output to Storage. Each stage has its own queue for independent scaling, retry, and monitoring. Multi-tenancy is enforced via RLS with `dealer_id` on every table and path-based Storage access control.

**Major components:**
1. **Next.js App (Vercel)** -- UI, auth pages, upload orchestration, template management. No heavy processing
2. **Supabase Auth + RLS** -- Dealer authentication, session management, tenant isolation on every table
3. **Supabase Database** -- Jobs, photos, templates, dealer config, pgmq queues. Source of truth for all state
4. **Supabase Storage** -- 4 buckets: originals, bannered, ads, assets. Path pattern: `{dealer_id}/{batch_id}/{photo_id}.{ext}`
5. **Supabase Edge Functions** -- Photo processing workers. Run Sharp + Gemini calls. 150s timeout, batches of 5 photos
6. **Supabase Realtime** -- WebSocket push of postgres_changes events for live progress tracking
7. **pg_cron** -- Triggers Edge Function every 10s to poll queues

**Key patterns:** Queue-per-stage pipeline, optimistic progress via Realtime, chunked processing (5 photos per invocation), idempotent workers (check status before processing), signed URL uploads (bypass Vercel 4.5MB limit).

**Database schema:** 4 core tables -- dealers, batches, photos, templates. Photos table tracks status through: uploaded -> analyzing -> analyzed -> compositing -> bannered -> complete/failed.

### Critical Pitfalls

14 pitfalls identified across 3 severity tiers:

**Critical (5) -- cause rewrites or blocked launches:**
1. **Vercel timeout wall** -- Bulk processing exceeds serverless limits. Use pgmq + Edge Functions, never process in API routes
2. **Sharp native binary mismatch** -- Works on Windows, fails on Vercel Linux. Add to serverExternalPackages, test deployment immediately after adding Sharp
3. **Gemini API rate limits** -- Free tier unusable (5-15 RPM). Enable billing day one, implement exponential backoff, use Flash not Pro for classification
4. **RLS not enabled = data breach** -- Tables default to RLS disabled. Enable on EVERY table at creation, test from client SDK not SQL editor
5. **Storage upload method mismatch** -- Standard upload fails silently over 6MB. Use resumable uploads (tus protocol) for all photos

**Moderate (5) -- cause delays or cost overruns:**
6. Function bundle size exceeding 250MB (isolate Sharp in own route)
7. Egress costs at scale ($0.09/GB, ~$45/mo per 10 dealers)
8. AI classification inconsistency (use structured JSON output with fixed enum categories)
9. Font rendering differences dev vs prod (bundle custom fonts, test on Vercel previews)
10. No idempotency in bulk processing (track per-image status, skip completed on retry)

**Minor (4):**
11. CORS issues with Supabase Storage
12. Memory pressure from concurrent Sharp operations
13. VIN decode API reliability (cache permanently, graceful degradation)
14. Nano Banana safety filter false positives (graceful fallback UI)

## Implications for Roadmap

### Phase 1: Foundation
**Rationale:** Everything depends on auth, storage, and data model. RLS must be enforced from day one
**Delivers:** Dealer registration/login, Supabase project with DB schema, Storage buckets, RLS policies on all tables
**Addresses:** Dealer accounts with branding (table stakes), multi-tenancy security
**Avoids:** Pitfall 4 (RLS data breach), Pitfall 11 (CORS)
**Uses:** Supabase Auth, @supabase/ssr, Supabase Storage

### Phase 2: Upload Pipeline
**Rationale:** Cannot process what you cannot upload. Direct-to-Storage uploads bypass Vercel payload limits
**Delivers:** Drag-and-drop multi-file upload, batch creation, photo records in DB, signed URL upload flow
**Addresses:** Photo upload (table stakes), batch management
**Avoids:** Pitfall 1 (Vercel timeout -- async from start), Pitfall 5 (upload method mismatch -- use tus protocol)
**Uses:** react-dropzone, Supabase Storage signed URLs, uuid

### Phase 3: AI Vision Pipeline
**Rationale:** AI classification is the core differentiator and must be validated before building banner content that depends on it. Queue infrastructure established here serves all later phases
**Delivers:** Gemini vision analysis, photo classification with fixed categories, pgmq queue setup, pg_cron triggers, Edge Function workers
**Addresses:** AI vision photo classification (differentiator)
**Avoids:** Pitfall 3 (rate limits -- implement backoff), Pitfall 8 (classification inconsistency -- structured JSON output), Pitfall 10 (idempotency -- built into queue from start)
**Uses:** @google/genai, Supabase Queues (pgmq), Edge Functions

### Phase 4: Banner Compositing
**Rationale:** Core visible output. Depends on vision analysis output format from Phase 3. Template system enables bulk application later
**Delivers:** Template system (10-15 presets), Sharp compositing in Edge Functions, text generation from analysis + vehicle data, banner preview UI
**Addresses:** Banner overlays, preset templates, text customization, photo preview (all table stakes)
**Avoids:** Pitfall 2 (Sharp binary -- test deployment here), Pitfall 6 (bundle size -- isolate Sharp), Pitfall 9 (font rendering -- bundle fonts, test on preview deploys), Pitfall 12 (memory pressure -- sequential processing)
**Uses:** Sharp, Supabase Edge Functions

### Phase 5: Bulk Processing + Progress
**Rationale:** Scales single-photo pipeline to dealer-scale workflows. Realtime progress is the UX layer on top of working queue
**Delivers:** Realtime progress dashboard, batch status tracking, bulk ZIP download, per-photo preview + edit overrides
**Addresses:** Bulk processing, bulk download, photo preview before export (table stakes)
**Avoids:** Pitfall 1 (bulk timeouts -- already async), Pitfall 7 (egress costs -- compress output, generate thumbnails)
**Uses:** Supabase Realtime, archiver

### Phase 6: Social Ads + VIN Enrichment
**Rationale:** Premium features that build on all prior work. Most complex AI integration deferred until core is solid
**Delivers:** Nano Banana social ad generation (1080x1080, 1080x1920), VIN decode integration, data-enriched banner text, rule-based overlay targeting, smart photo ordering
**Addresses:** AI-generated social ads, VIN decode enrichment, rule-based overlays, smart ordering (differentiators)
**Avoids:** Pitfall 3 (Nano Banana rate limits -- low concurrency), Pitfall 13 (VIN API reliability -- permanent cache), Pitfall 14 (safety filter false positives -- graceful fallback)
**Uses:** @google/genai (Nano Banana models), @shaggytools/nhtsa-api-wrapper

### Phase Ordering Rationale

- Foundation first because auth + RLS + storage are dependencies for every other phase
- Upload before vision because you cannot classify what you cannot store
- Vision before banners because banner text content depends on AI classification output format
- Single-photo pipeline (Phases 3-4) before bulk (Phase 5) because bulk is just queuing single operations
- Social ads and VIN last because they are premium features that enhance but do not enable the core value prop
- Each phase delivers a testable, deployable increment

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (AI Vision):** Sharp in Supabase Edge Functions (Deno runtime) needs validation. pgmq + pg_cron setup is documented but has limited community examples for image processing specifically
- **Phase 4 (Banner Compositing):** Font availability in Edge Functions for SVG text rendering. Sharp SVG compositing API specifics for multi-layer banners
- **Phase 6 (Social Ads):** Nano Banana API rate limits, pricing at scale, safety filter behavior with vehicle photos. NHTSA API response format for banner text generation

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented Supabase Auth + RLS + Storage setup
- **Phase 2 (Upload):** Signed URL upload pattern is standard Supabase documentation
- **Phase 5 (Bulk + Progress):** Supabase Realtime postgres_changes is well-documented. archiver ZIP generation is straightforward

## Confidence Assessment

| Area | Confidence | Notes |
|-|-|-|
| Stack | HIGH | All packages verified on npm with current versions. @google/genai confirmed as replacement for legacy SDK. Gemini model IDs verified |
| Features | HIGH | Based on PROJECT.md vision + competitor analysis of HomeNet, Spyne, Impel, Xcite, AutoManager. Clear competitive gap identified |
| Architecture | HIGH | pgmq + Edge Functions pattern documented in official Supabase blog. Vercel constraints well-understood. DB schema follows standard multi-tenant SaaS patterns |
| Pitfalls | HIGH | Sharp + Vercel issues extensively documented in GitHub issues. Gemini rate limits verified against official docs. RLS gaps are known Supabase footgun |

**Overall confidence:** HIGH

### Gaps to Address

- **Sharp in Deno runtime:** Edge Functions use Deno, Sharp is a Node.js native module. npm: specifier support exists but needs hands-on validation for image compositing
- **Font loading in Edge Functions:** Custom font files for SVG text rendering in a Deno environment -- unclear if Sharp/libvips can access bundled fonts
- **Gemini rate limits at scale:** Tier 2+ pricing and limits for thousands of vision calls per dealer need validation against actual usage projections
- **Egress cost modeling:** At 10+ dealers, Supabase Storage egress ($0.09/GB uncached) needs cost projection to inform pricing strategy
- **pgmq throughput ceiling:** 20K messages for a single large dealer -- need to validate pgmq can handle this without pg_cron becoming a bottleneck

## Sources

### Primary (HIGH confidence)
- [Supabase Queues (pgmq) docs](https://supabase.com/docs/guides/queues) -- queue architecture
- [Processing Large Jobs with Edge Functions](https://supabase.com/blog/processing-large-jobs-with-edge-functions) -- queue + Edge Function pattern
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) -- progress tracking
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) -- multi-tenancy
- [Supabase Storage File Limits](https://supabase.com/docs/guides/storage/uploads/file-limits) -- upload constraints
- [Vercel Functions Limitations](https://vercel.com/docs/functions/limitations) -- timeout/memory constraints
- [Sharp Compositing API](https://sharp.pixelplumbing.com/api-composite/) -- SVG text overlay pattern
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) -- v1.44.0 SDK
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) -- rate limit tiers
- [NHTSA VIN Decoder API](https://vpic.nhtsa.dot.gov/api/) -- free VIN decode

### Secondary (MEDIUM confidence)
- [HomeNet Image Overlays](https://www.homenetauto.com/products/image-overlays/) -- competitor features
- [Spyne AI Car Photo Tools](https://www.spyne.ai/) -- competitor positioning
- [DealerRefresh Forum threads](https://forum.dealerrefresh.com/) -- dealer workflow insights
- [Supabase RLS Best Practices (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) -- RLS patterns
- [Sharp GitHub Issues #1442](https://github.com/lovell/sharp/issues/1442) -- native binary deployment issues

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*

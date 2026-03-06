# Domain Pitfalls

**Domain:** AI Photo Banner SaaS for Car Dealerships
**Stack:** Next.js + Supabase + Vercel + Gemini API + Sharp
**Researched:** 2026-03-06

## Critical Pitfalls

Mistakes that cause rewrites, outages, or blocked launches.

### Pitfall 1: Vercel Serverless Timeout Wall

**What goes wrong:** Bulk image processing (resize + banner overlay + AI classification) exceeds Vercel's function timeout. Hobby plan caps at 10 seconds. Pro plan default is 15 seconds, max 300 seconds (5 min). A dealer uploading 200 photos triggers a function that tries to process them all synchronously and dies mid-batch.
**Why it happens:** Developers treat serverless like a traditional server and run batch loops inside a single function invocation.
**Consequences:** Half-processed batches, corrupted state, angry dealers staring at spinners. At scale (50-500 vehicles x 20-40 photos = 1,000-20,000 images per dealer), this is a showstopper.
**Prevention:**
- Never process bulk images synchronously in a single function call
- Use a queue pattern: upload triggers a job record in Supabase, a separate function picks up individual images one at a time
- Set `maxDuration` in route config to extend timeout on Pro plan (up to 300s)
- Consider Vercel Fluid Compute for longer-running functions (up to 800s on Pro)
- Design the UI around async: show a progress dashboard, not a loading spinner
**Detection:** Any API route that loops over images is a red flag. Test with 50+ images early.
**Phase:** Must be solved in Phase 1 (bulk processing architecture). Retrofitting async processing is a rewrite.

### Pitfall 2: Sharp Native Binary Mismatch on Vercel

**What goes wrong:** Sharp works perfectly on Windows dev machine, then fails on Vercel deployment with "Cannot find module 'sharp-linux-x64.node'" or similar errors.
**Why it happens:** Sharp uses native C++ bindings (libvips). The binary compiled on Windows is incompatible with Vercel's Linux runtime. npm installs platform-specific binaries.
**Consequences:** Deployment fails completely. No image processing at all in production.
**Prevention:**
- Add Sharp to `next.config.js` experimental serverComponentsExternalPackages (or the newer `serverExternalPackages`)
- Use `npm install --platform=linux --arch=x64 sharp` for deployment builds, OR let Vercel's build environment handle the install natively (do NOT commit node_modules)
- Alternatively, use `@vercel/og` patterns or Vercel's built-in image optimization for simpler transforms
- Test deployment to Vercel preview early — do not wait until feature-complete
**Detection:** First Vercel deployment after adding Sharp. Test immediately.
**Phase:** Must be validated in Phase 1 during initial setup. A 5-minute deployment test saves days of debugging.

### Pitfall 3: Gemini API Rate Limits Kill Bulk Processing

**What goes wrong:** Processing 200 vehicle photos through Gemini Vision for classification hits rate limits. Free tier: 5 RPM for 2.5 Pro, 10 RPM for 2.5 Flash. Even Tier 1 (paid): limits are per-project, not per-key. Image generation (Nano Banana) is even stricter — free tier has 0 IPM (zero image generation without billing). Tier 1 Nano Banana 2: only 10 images per minute.
**Why it happens:** Developers fire off all API calls concurrently without rate limiting or queuing.
**Consequences:** 429 errors cascade, partial batch failures, inconsistent results. December 2025 quota slashes made this worse — free tier RPD for Flash dropped from 250 to 20 (92% reduction).
**Prevention:**
- Enable billing from day one — free tier is unusable for any real workload
- Implement client-side rate limiting with exponential backoff (respect 429 retry-after headers)
- Queue AI calls with controlled concurrency (e.g., 5 concurrent for Flash vision, 8 concurrent for Nano Banana 2 at Tier 1)
- Use Gemini Flash (not Pro) for classification — faster, cheaper, higher rate limits
- Cache classification results in Supabase — never re-classify the same image
- Implement a dead-letter queue for failed classifications to retry later
**Detection:** Test with 50+ images in rapid succession. If you see 429s, your concurrency is too high.
**Phase:** Must be designed in Phase 1 (queue architecture), implemented in Phase 2 (AI integration).

### Pitfall 4: Supabase RLS Not Enabled = Data Breach

**What goes wrong:** New tables created without Row Level Security enabled expose ALL dealer data to ALL authenticated users through the Supabase client API. Dealer A sees Dealer B's inventory photos, branding, and customer data.
**Why it happens:** RLS is disabled by default on every new Supabase table. Developers forget to enable it, or enable it without adding policies (which makes the table return empty results with no error).
**Consequences:** Multi-tenant data leak. For a B2B SaaS serving competing dealerships, this is a business-ending bug.
**Prevention:**
- Enable RLS on EVERY table immediately upon creation — no exceptions
- Create a checklist: enable RLS, add policy, add index on tenant column, test from client SDK
- Use `dealer_id` column on every tenant-scoped table with policy `USING (dealer_id = auth.uid())` or via custom JWT claims
- Never test RLS from Supabase SQL Editor (it bypasses RLS) — always test from client SDK
- Index every column referenced in RLS policies (tenant_id, dealer_id) to avoid performance degradation
**Detection:** Query any table from a second test account. If you see data from the first account, RLS is broken.
**Phase:** Must be enforced from Phase 1 (database schema). Every migration script should include RLS setup.

### Pitfall 5: Supabase Storage Upload Method Mismatch

**What goes wrong:** Standard upload method silently fails or corrupts files over 6MB. Dealer photos from modern cameras are typically 5-15MB each. Bulk upload of 50 photos fails partway through with no clear error.
**Why it happens:** Supabase standard uploads are designed for files under 6MB. Larger files need resumable uploads or S3 protocol. Developers also forget that global storage limits and bucket-level limits are independent — upgrading one without the other still blocks uploads.
**Consequences:** Upload failures, lost photos, frustrated dealers who blame the product.
**Prevention:**
- Use resumable uploads (tus protocol) for ALL photo uploads — not just large ones. This also gives you progress tracking for free
- Set both global AND bucket-level file size limits (they're independent — both must be configured)
- Free plan caps at 50MB per file; Pro plan supports up to 500GB per file
- Implement client-side file validation before upload (check size, type, dimensions)
- Add retry logic for failed uploads with resume capability
**Detection:** Upload a 10MB JPEG. If it fails or hangs, you're using the wrong upload method.
**Phase:** Phase 1 (upload infrastructure). Switching upload methods later requires rewriting the entire upload flow.

## Moderate Pitfalls

### Pitfall 6: Vercel Function Bundle Size Exceeds 250MB

**What goes wrong:** Sharp (with libvips) + font files for banner text + other dependencies push the serverless function bundle past Vercel's 250MB unzipped limit.
**Prevention:**
- Keep Sharp in its own API route / function to isolate its bundle
- Use dynamic imports to prevent Sharp from being bundled into every function
- Load fonts from Supabase Storage or a CDN at runtime instead of bundling them
- Monitor bundle size in Vercel build output — it warns before it fails
**Phase:** Phase 2 (banner generation). Test bundle size after adding Sharp + fonts.

### Pitfall 7: Egress Costs Explode with Image-Heavy Workload

**What goes wrong:** Supabase Storage egress is $0.09/GB uncached beyond 250GB included (Pro plan). A dealer with 500 vehicles x 30 photos x 5MB each = 75GB per dealer. 10 dealers downloading bannered photos = 750GB/month = ~$45/month in egress alone. At 100 dealers, that's $450+/month just in bandwidth.
**Prevention:**
- Serve images through Supabase Smart CDN for cached egress at $0.03/GB (3x cheaper)
- Compress bannered output aggressively (JPEG quality 80-85 is visually identical for car photos)
- Generate thumbnails for preview, full-size only on download
- Consider generating ZIP files server-side to reduce repeated downloads
- Track egress per dealer for cost allocation and pricing decisions
**Phase:** Phase 2-3. Not urgent for MVP but must be designed before scaling past 10 dealers.

### Pitfall 8: AI Classification Inconsistency

**What goes wrong:** Gemini classifies the same photo differently across runs. "Interior dashboard" vs "interior screen" vs "infotainment system" — inconsistent labels break downstream banner text logic that depends on exact category matches.
**Prevention:**
- Use structured output (JSON mode) with a fixed enum of categories, not free-text classification
- Define exactly 10-15 categories: exterior_front, exterior_rear, exterior_side, interior_dashboard, interior_seats, engine_bay, wheels, trunk, etc.
- Include few-shot examples in the prompt for each category
- Cache results — never re-classify unless explicitly requested
- Test with 100+ diverse dealer photos to calibrate prompt before launch
**Phase:** Phase 2 (AI integration). Prompt engineering is iterative — budget time for it.

### Pitfall 9: Font Rendering Differences Between Dev and Production

**What goes wrong:** Banner text looks perfect on Windows dev machine but renders differently (wrong font, wrong kerning, fallback font) on Vercel's Linux environment. System fonts differ between Windows and Linux.
**Prevention:**
- Bundle custom fonts explicitly — never rely on system fonts
- Use .woff2 or .ttf files loaded at runtime
- Test banner rendering on Vercel preview deployments, not just local dev
- Sharp's text rendering (via libvips/Pango) has different font handling than browser Canvas
**Phase:** Phase 2 (banner generation). Visual QA must happen on deployed previews.

### Pitfall 10: No Idempotency in Bulk Processing

**What goes wrong:** A network hiccup or timeout causes a retry, which re-processes already-completed images. Dealer gets duplicate bannered photos, double API charges, or corrupted state.
**Prevention:**
- Track processing status per-image in Supabase: pending, processing, completed, failed
- Use idempotency keys for Gemini API calls
- Design the queue to skip already-completed items on retry
- Allow dealers to re-trigger individual failed images, not entire batches
**Phase:** Phase 1 (queue architecture). Must be built into the processing pipeline from the start.

## Minor Pitfalls

### Pitfall 11: CORS Issues with Supabase Storage

**What goes wrong:** Browser-side image loading from Supabase Storage blocked by CORS, especially when using canvas operations or image manipulation on the client.
**Prevention:** Configure Supabase Storage CORS rules for your Vercel domain. Use signed URLs for private bucket access.
**Phase:** Phase 1 (storage setup).

### Pitfall 12: Memory Pressure from Concurrent Sharp Operations

**What goes wrong:** Multiple Sharp resize/composite operations running concurrently in the same function exhaust the 1024MB default memory allocation.
**Prevention:** Process images sequentially within a function. Increase memory allocation via Vercel function config. Keep Sharp operations simple (resize + composite, not complex multi-layer).
**Phase:** Phase 2 (banner generation).

### Pitfall 13: VIN Decode API Reliability

**What goes wrong:** Third-party VIN decode APIs have their own rate limits, downtime, and data quality issues. A bad VIN decode returns wrong vehicle data, which generates incorrect banner text.
**Prevention:** Cache VIN decode results permanently (VIN data doesn't change). Validate response data before using it. Have a graceful fallback — banners should work without VIN data, just with less detail.
**Phase:** Phase 3 (VIN enrichment).

### Pitfall 14: Gemini Image Generation (Nano Banana) Safety Filters

**What goes wrong:** Nano Banana refuses to generate certain images due to safety filters, even for legitimate car photos. Background swaps or dramatic lighting effects may trigger false positives.
**Prevention:** Implement fallback behavior when generation is refused. Log refusal reasons. Don't promise 100% generation success in the UI — show "generation unavailable" gracefully.
**Phase:** Phase 3 (social ad generation).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-|-|-|
| Upload infrastructure | Storage upload method + file size limits | Use resumable uploads from day one |
| Queue/bulk processing | Vercel timeouts + no idempotency | Async queue with per-image status tracking |
| Database schema | RLS not enabled on new tables | RLS checklist for every migration |
| Sharp integration | Native binary mismatch on deploy | Test Vercel deployment immediately after adding Sharp |
| AI classification | Rate limits + inconsistent labels | Rate limiter + structured JSON output with fixed categories |
| Banner rendering | Font differences dev vs prod | Bundle fonts, test on Vercel previews |
| Social ad generation | Nano Banana rate limits + safety filters | Graceful fallbacks, low concurrency |
| Scaling past 10 dealers | Egress costs + RLS performance | CDN caching, indexed RLS policies |
| VIN enrichment | Third-party API reliability | Permanent caching, graceful degradation |

## Sources

- [Vercel Functions Timeout Limits](https://vercel.com/docs/functions/configuring-functions/duration) - HIGH confidence
- [Vercel 250MB Bundle Size Limit](https://vercel.com/kb/guide/troubleshooting-function-250mb-limit) - HIGH confidence
- [Supabase Storage File Limits](https://supabase.com/docs/guides/storage/uploads/file-limits) - HIGH confidence
- [Supabase Storage Bandwidth Pricing](https://supabase.com/docs/guides/storage/serving/bandwidth) - HIGH confidence
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) - HIGH confidence
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) - HIGH confidence
- [Gemini Image Generation Limits](https://www.aifreeapi.com/en/posts/gemini-image-generation-free-api) - MEDIUM confidence
- [Sharp Native Binary Issues](https://github.com/lovell/sharp/issues/1442) - HIGH confidence
- [Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) - MEDIUM confidence
- [Nano Banana 2 Error Troubleshooting](https://www.aifreeapi.com/en/posts/nano-banana-2-error-429-502-rate-limit) - MEDIUM confidence

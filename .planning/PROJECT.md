# AI Photo Banner

## What This Is

A SaaS platform for car dealerships that automatically creates professional photo banners and social media ads for vehicle inventory. Dealers upload photos (or connect via inventory feed), and Gemini AI vision analyzes each photo to determine what it shows — exterior, interior screen, engine bay, wheels, etc. — then auto-generates relevant, accurate banner text overlays. The system also creates full social media ad graphics using Gemini Nano Banana image generation.

## Core Value

Dealers get professional, AI-labeled photo banners for their entire inventory in minutes instead of hours of manual work — turning raw lot photos into marketing-ready assets automatically.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] AI vision analyzes vehicle photos and classifies what each shows (exterior, interior, engine, wheels, dashboard screen, etc.)
- [ ] AI generates relevant banner text based on photo content + vehicle data (VIN decode, inventory feed enrichment)
- [ ] Banner overlay system with top, bottom, both, and full ad overlay positions
- [ ] Preset banner templates (10-15 professional styles) with font/color/size customization
- [ ] Dealer accounts with logo upload, brand colors, saved preferences
- [ ] Bulk photo upload (drag & drop, CSV/API import from DMS)
- [ ] Bulk processing queue — entire inventory photo sets processed automatically
- [ ] Social media ad creation (Facebook square, Instagram story/square formats)
- [ ] Gemini Nano Banana image generation for premium ad graphics (background swaps, dramatic lighting)
- [ ] Bulk download as ZIP of bannered photos
- [ ] VIN decode integration for vehicle data enrichment
- [ ] Photo-level preview and edit before final export

### Out of Scope

- Direct social media posting (v2) — build download-first, social integration later
- Website embed / photo replacement on dealer sites — complex integration, defer
- API access for third-party tools — build the core product first
- Full drag-and-drop banner editor — presets + tweaks is sufficient for v1
- Pricing/billing/Stripe — figure out after product validation
- Mobile app — web-first

## Current Milestone: v1.0 AI Photo Banner MVP

**Goal:** Deliver the full AI photo banner pipeline — upload, AI vision analysis, banner generation with templates, social ad creation, bulk processing, and dealer accounts.

**Target features:**
- AI vision photo classification + banner text generation
- Banner overlay system with preset templates
- Dealer accounts with branding
- Bulk upload and processing
- Social media ad creation with Nano Banana
- VIN decode enrichment
- Bulk download

## Context

- Built on proven concept: we just manually created banners for a 2014 Corvette Stingray (stock RA50652) using Gemini vision + Nano Banana + Pillow, confirming the technical approach works
- Reference: Huebner Chevrolet's banner style ("DIESEL | Z71 OFF-ROAD | LEATHER" top bar) is the baseline quality target
- DealerRefresh forum shows dealers actively discussing AI photo labeling — market demand is real
- Primary users range from dedicated marketing staff to sales managers wearing many hats — UX must be fast and intuitive
- Dealerships typically have 50-500 vehicles with 20-40 photos each — bulk processing is critical
- Existing tools (like HomNet, DealerSocket photo tools) do basic overlays but lack AI-driven content generation

## Constraints

- **Tech Stack**: Next.js + TypeScript + Tailwind + Supabase + Vercel (standard stack)
- **AI**: Gemini API for vision analysis, Nano Banana 2 (gemini-3.1-flash-image-preview) for image generation, Nano Banana Pro for premium quality
- **Image Processing**: Server-side Pillow/Sharp for deterministic banner compositing (AI for generation, code for precise overlays)
- **Auth**: Supabase Auth for dealer accounts
- **Storage**: Supabase Storage for uploaded photos and generated assets
- **Platform**: Windows 11 dev environment, deploy to Vercel

## Key Decisions

| Decision | Rationale | Outcome |
|-|-|
| Vision + data enrichment (not vision-only) | AI sees "interior screen" + VIN data provides "13in touchscreen with CarPlay" — more accurate and useful labels | -- Pending |
| Presets + tweaks (not full editor) | Faster to build, easier for non-design users, covers 90% of needs | -- Pending |
| Download-first (no direct social posting v1) | Reduces scope, dealers already have social tools, validates core value first | -- Pending |
| Pillow/Sharp for banner compositing | Deterministic text placement vs AI-generated text (which can be inconsistent) | -- Pending |
| Nano Banana for social ad generation | Proven in our Corvette test — good quality for background swaps and dramatic ad layouts | -- Pending |

---
*Last updated: 2026-03-06 after milestone v1.0 started*

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI Photo Banner — a Next.js app for auto-dealerships that analyzes vehicle photos with Gemini AI, generates marketing banner overlays, and manages inventory. Dealers upload photos, AI classifies them (exterior/interior/engine/etc.), generates selling-point text, and creates banner images with SVG or AI-generated overlays.

## Commands

```bash
npm run dev          # Start dev server (no --turbo on Windows)
npm run build        # Production build
npx tsc --noEmit     # Type check (run before commits)
npm run lint         # ESLint
npx vercel --prod --yes  # Deploy
```

## Architecture

### App Router Layout

- `app/(auth)/` — Login/signup (public)
- `app/(dashboard)/` — Protected routes with Supabase auth guard in layout
  - `dashboard/` — Stats overview
  - `inventory/` — Vehicle list + detail (`[id]/`)
  - `photos/` — Photo upload, analysis, banner generation
  - `templates/` — Banner templates
  - `settings/` — Dealer branding config

### API Routes

- `/api/analyze` — Batch photo analysis (max 8 per batch to prevent output truncation). Classifies photos, generates banner text, enhancement suggestions. Deduplicates text across batches.
- `/api/banner/create` — Banner overlay generation. SVG mode (top/bottom text banners) or AI mode (Gemini image generation). Also handles feature overlays (dark side panel with feature list).
- `/api/enhance` — Photo enhancement suggestions via AI
- `/api/inventory/import` — CSV/inventory file parsing
- `/api/inventory/parse` — File content extraction
- `/api/inventory/[id]/save-*` — Persist analysis/banners/processed images to Supabase

### AI Integration

All AI prompts and model config centralized in `lib/ai-prompts.ts`. This is the single source of truth for:
- Model selection (Flash Lite for analysis, Pro/Flash for image generation)
- Content rules: banned words, filler phrases, selling-point hints
- Prompt templates for analysis, banner text, feature overlays, enhancement
- Banner text format: pipe-separated, 40 char max per line
- Custom dealer instructions and window sticker parsing

**Models:** `@google/genai` SDK — uses `gemini-3.1-flash-lite-preview` for analysis, `gemini-3-pro-image-preview` and `gemini-3.1-flash-image-preview` for image generation.

### Key Libraries

- `sharp` — Image compositing (resize, overlay, JPEG export). Listed as external in next.config.ts.
- `@supabase/ssr` + `@supabase/supabase-js` — Auth + DB. Server client in `lib/supabase/server.ts`.
- `react-dropzone` — File upload UI
- Tailwind v4 (no config file — uses PostCSS plugin defaults)

## Patterns

- Photo analysis batches at 8 images max — increasing this causes LLM output truncation
- Banner text uses pipe `|` separator for multi-line display
- Auto-save: analysis results and banners persist to Supabase to survive page refreshes
- Custom CSS classes: `glass-card`, `accent-glow`, `animate-fade-up` for dark-themed UI
- Environment variables: `GEMINI_API_KEY`, Supabase URL/anon key

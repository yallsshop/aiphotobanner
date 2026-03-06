# Feature Landscape

**Domain:** AI Photo Banner SaaS for Car Dealerships
**Researched:** 2026-03-06

## Table Stakes

Features dealers expect from any photo overlay/banner tool. Missing = product feels incomplete or amateurish.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|-|-|-|-|-|
| Photo upload (drag-and-drop, multi-file) | Every competitor supports it; dealers upload 20-40 photos per vehicle | Low | None | Must handle JPEG/PNG/HEIC from phones |
| Banner overlay on photos (top bar, bottom bar, or both) | Core value prop of every overlay tool (HomeNet, AutoManager, Zopdealer all do this) | Med | Template system | Text + dealer logo composited onto photo |
| Preset banner templates (10-15 styles) | HomeNet/AutoManager offer template libraries; dealers expect pick-and-go, not design-from-scratch | Med | None | Include horizontal bars, corner badges, full-frame borders |
| Dealer branding (logo upload, brand colors, fonts) | Every competitor offers this; dealers want consistent brand identity across all photos | Low | Dealer accounts | Logo, primary/secondary colors, font selection |
| Dealer accounts with saved preferences | Dealers expect settings to persist; re-configuring per session is unacceptable | Low | Auth (Supabase) | Save template choices, brand settings, default overlay position |
| Bulk processing (apply template to entire inventory set) | Dealerships have 50-500 vehicles x 20-40 photos = thousands of images. One-by-one is a non-starter | High | Upload, templates, processing queue | HomeNet and AutoManager auto-apply overlays to full inventory |
| Bulk download (ZIP of processed photos) | Dealers need to get photos out of the system and into DMS/website/social platforms | Med | Bulk processing | ZIP generation with organized folder structure by vehicle |
| Photo preview before export | Dealers must see what they are getting before committing; blind processing erodes trust | Med | Overlay system | Grid view with before/after toggle |
| Text customization (font, size, color, position) | HomeNet offers font selection (Arial, Garamond, etc.), color pickers, position control. Expected baseline | Med | Template system | Don't go full editor -- dropdown selectors, not free-form canvas |
| Rule-based overlay application | HomeNet lets dealers set rules (e.g., "all SUVs get this overlay, all certified pre-owned get that one"). Dealers expect targeting by make/model/status | High | Vehicle data, template system | Target by year, make, model, trim, vehicle status (new/used/CPO) |

## Differentiators

Features that set AI Photo Banner apart. Competitors do NOT do these -- this is the moat.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|-|-|-|-|-|
| AI vision photo classification | No competitor auto-detects what a photo shows (exterior, interior, engine, wheels, dashboard screen). This enables smart banner text that matches the actual photo content | High | Gemini API | Core differentiator. "LEATHER INTERIOR" only appears on interior photos, not exterior shots |
| AI-generated banner text from photo content + vehicle data | Competitors use static text (dealer name, phone). We generate contextual text: "3.6L V6 ENGINE" on engine photo, "BOSE PREMIUM AUDIO" on interior photo. Vision + VIN data = accurate, specific labels | High | AI vision, VIN decode | The killer feature. Huebner Chevrolet style: "DIESEL \| Z71 OFF-ROAD \| LEATHER" |
| VIN decode data enrichment | Decode VIN to get trim, engine, packages, options. Feed to AI for richer banner text. NHTSA API is free; premium APIs (DataOne) give 200+ data points | Med | VIN decoder API | Free tier: NHTSA vPIC. Premium: DataOne, VehicleDatabases for installed equipment |
| AI-generated social media ad graphics (Nano Banana) | Competitors do overlays. We generate entirely new ad creatives -- background swaps, dramatic lighting, lifestyle scenes. Proven in Corvette test | High | Gemini Nano Banana API | Facebook square (1080x1080), Instagram story (1080x1920) formats |
| Smart photo ordering | AI detects photo types and can auto-reorder: hero exterior first, then interior, then details. Xcite does this with their compliance tool; we can offer it as value-add | Med | AI vision classification | Dealers currently manually sort photos; this saves real time |

## Anti-Features

Features to explicitly NOT build in v1. Each has a clear reason.

| Anti-Feature | Why Avoid | What to Do Instead |
|-|-|-|
| Full drag-and-drop banner editor | Massive complexity (canvas rendering, object manipulation); Canva already exists. Dealers want fast, not flexible | Presets + tweaks (font, color, size, position dropdowns). Covers 90% of needs |
| Direct social media posting | Complex OAuth integrations with Facebook/Instagram APIs; dealers already have social tools (Hootsuite, Later, native) | Download-first workflow. Export ready-to-post images in correct dimensions |
| Background replacement / virtual studio | Spyne and Impel own this space with mature products. Competing on background removal is a losing battle | Focus on overlays and AI-generated text (our unique value). Background replacement is a different product |
| Website embed / photo replacement on dealer sites | Complex integration with hundreds of dealer website platforms (DealerSocket, CDK, etc.) | Export photos for manual upload. API access in v2+ |
| Real-time collaboration | Dealers are typically 1-2 people managing photos, not teams of designers | Single-user workflow with shared dealer account |
| Mobile app | Web responsive is sufficient; dealers mostly work at a desk for photo processing | Responsive web design, mobile-friendly upload via browser |
| Pricing/billing/Stripe | Premature optimization before product-market fit | Manual onboarding, free beta, figure out pricing after validation |
| AI-powered vehicle description writing | Different product category (listing descriptions vs photo banners). Spyne and others do this | Stay focused on visual assets. Text descriptions are out of scope |
| Inventory management / DMS integration | We are a photo tool, not an inventory system. DMS integrations are 6-12 month projects each | CSV import for vehicle data, VIN manual entry. API import in v2 |

## Feature Dependencies

```
Dealer Accounts (auth) -----> Saved Preferences -----> Rule-Based Overlays
                                                              |
Upload System -----> AI Vision Classification -----> AI Banner Text Generation
                            |                               |
                            v                               v
                     Smart Photo Ordering          Banner Overlay Compositing
                                                          |
VIN Decode -----> Vehicle Data Enrichment -----> AI Banner Text Generation
                                                          |
                                                          v
                                                   Template System
                                                          |
                                              +-----------+-----------+
                                              |                       |
                                        Bulk Processing         Photo Preview
                                              |                       |
                                              v                       v
                                        Bulk Download           Single Export

Nano Banana API -----> Social Ad Generation (separate pipeline from overlays)
```

Key dependency chains:
- Upload must exist before anything processes photos
- AI Vision must work before AI text generation can be contextual
- VIN decode enriches text generation but is not a hard blocker (graceful degradation)
- Template system must exist before bulk processing can apply templates at scale
- Preview must exist before export (trust building)

## MVP Recommendation

**Prioritize (Phase 1 - Core Pipeline):**
1. Dealer accounts with branding (logo, colors) -- foundational, everything builds on this
2. Photo upload (drag-and-drop, multi-file) -- can't do anything without photos
3. AI vision photo classification -- the core differentiator
4. Banner overlay system with preset templates -- the visible output
5. Photo preview and single export -- trust and immediate value

**Prioritize (Phase 2 - Intelligence + Scale):**
6. VIN decode integration -- enriches banner text quality significantly
7. AI-generated banner text (vision + VIN data) -- the killer feature, needs both inputs
8. Bulk processing queue -- scales the value from 1 photo to entire inventory
9. Bulk download as ZIP -- gets processed photos out efficiently

**Prioritize (Phase 3 - Premium + Social):**
10. Social media ad creation with Nano Banana -- premium value-add
11. Rule-based overlay application -- power user feature for larger dealers
12. Smart photo ordering -- nice-to-have that saves real time

**Defer to v2+:**
- Direct social posting, API access, DMS integration, background replacement

## Competitive Landscape Summary

| Competitor | What They Do | What They Lack |
|-|-|-|
| HomeNet Automotive | Static overlays, rule-based targeting, template library | No AI -- text is manual, no photo content awareness |
| AutoManager | Basic overlays for website/Craigslist, template selection | Very basic; no intelligence, no social formats |
| Zopdealer | Overlay templates, dealer branding | Static templates only |
| Spyne | AI background replacement, virtual studio, car descriptions | Different product -- backgrounds not banners. No contextual text overlays |
| Impel AI | AI background enhancement, virtual photo booth | Focused on background/enhancement, not text overlays or ad generation |
| Xcite Automotive | Photo compliance, auto-ordering, background removal | Enterprise-focused, OEM compliance. Not a self-serve banner tool |
| Banner InSite | Bulk creative generation for ads | Ad banners for digital campaigns, not inventory photo overlays |

**Our gap:** No one combines AI vision classification + contextual text generation + photo overlays. Competitors either do dumb overlays (HomeNet) or smart backgrounds (Spyne/Impel) -- nobody does smart text on photos.

## Sources

- [HomeNet Image Overlays](https://www.homenetauto.com/products/image-overlays/) - MEDIUM confidence
- [AutoManager Photo Overlays](https://www.automanager.com/auto-dealer-website/vehicle-photo-overlays/) - MEDIUM confidence
- [Zopdealer Overlay Templates](https://www.zopdealer.com/overlay-templates) - MEDIUM confidence
- [Spyne AI Car Photo Tools](https://www.spyne.ai/) - MEDIUM confidence
- [Impel AI Image Enhancement](https://impel.ai/ai-image-enhancement/) - MEDIUM confidence
- [Xcite Automotive](https://www.xciteauto.com/) - MEDIUM confidence
- [DealerRefresh Forum - AI Photo Tools](https://forum.dealerrefresh.com/threads/feedback-on-new-ai-tool-for-dealer-photography.11142/) - MEDIUM confidence
- [DealerRefresh Forum - Photo Labels](https://forum.dealerrefresh.com/threads/pictures-labels.3592/) - MEDIUM confidence
- [NHTSA VIN Decoder API](https://vpic.nhtsa.dot.gov/api/) - HIGH confidence
- [Units Inventory Photo Enhancements](https://unitsinventory.com/photo-editor-backgrounds-overlays/) - MEDIUM confidence
- [Dealerslink Dynamic Overlays](https://public.dealerslink.com/three-ways-to-use-dynamic-photo-overlays-set-your-dealership-apart-from-the-competition/) - MEDIUM confidence

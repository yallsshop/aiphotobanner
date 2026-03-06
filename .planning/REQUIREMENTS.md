# Requirements: AI Photo Banner

**Defined:** 2026-03-06
**Core Value:** Dealers get professional, AI-labeled photo banners for their entire inventory in minutes instead of hours of manual work.

## v1 Requirements

### AI Vision

- [ ] **VISION-01**: User can upload a vehicle photo and receive AI classification of what it shows (exterior, interior, engine, wheels, dashboard, etc.)
- [ ] **VISION-02**: User can see AI-generated banner text based on photo content (e.g., "LEATHER | BOSE AUDIO | HEATED SEATS")
- [ ] **VISION-03**: User can see confidence score for each AI classification to review accuracy

### Banner System

- [ ] **BANNER-01**: User can apply banner overlays in top, bottom, both, or full-ad positions
- [ ] **BANNER-02**: User can preview each bannered photo before export
- [ ] **BANNER-03**: User can edit banner text/position on individual photos before export

### Dealer Accounts

- [ ] **ACCT-01**: Dealer can sign up and log in via email/password
- [ ] **ACCT-02**: Dealer can upload their logo for banner branding
- [ ] **ACCT-03**: Dealer can set brand colors applied to banner templates
- [ ] **ACCT-04**: Dealer preferences persist across sessions

### Bulk & Export

- [ ] **BULK-01**: User can drag & drop multiple photos for batch upload
- [ ] **BULK-02**: User can see real-time progress as batch is processed
- [ ] **BULK-03**: User can download all bannered photos as a ZIP file

### Social Ads

- [ ] **SOCIAL-01**: User can generate Facebook square ad graphics from vehicle photos using Nano Banana AI
- [ ] **SOCIAL-02**: User can generate Instagram story/square ad graphics from vehicle photos

## v2 Requirements

### VIN Enrichment

- **VIN-01**: User can enter VIN to enrich banner text with actual vehicle specs (engine, trim, features)
- **VIN-02**: System decodes VIN via NHTSA API and merges data into banner text generation

### Advanced Templates

- **TMPL-01**: User can choose from 10-15 preset banner templates with font/color/size customization
- **TMPL-02**: User can save custom template configurations as presets

### Rule-Based Targeting

- **RULE-01**: Dealer can set overlay rules by make/model/status for automatic template assignment

## Out of Scope

| Feature | Reason |
|-|-|
| Direct social media posting | Build download-first, social integration later (v2+) |
| Website embed / photo replacement | Complex dealer site integration, defer |
| API access for third-party tools | Build core product first |
| Full drag-and-drop banner editor | Presets + tweaks sufficient for v1 |
| Pricing/billing/Stripe | Figure out after product validation |
| Mobile app | Web-first |
| Background replacement (Spyne-style) | Competitors own this space; our moat is AI text, not backgrounds |
| DMS/inventory feed integration | Manual upload first, feed integration v2 |

## Traceability

| Requirement | Phase | Status |
|-|-|-|
| ACCT-01 | Phase 1 | Pending |
| ACCT-02 | Phase 1 | Pending |
| ACCT-03 | Phase 1 | Pending |
| ACCT-04 | Phase 1 | Pending |
| BULK-01 | Phase 2 | Pending |
| VISION-01 | Phase 2 | Pending |
| VISION-02 | Phase 2 | Pending |
| VISION-03 | Phase 2 | Pending |
| BANNER-01 | Phase 3 | Pending |
| BANNER-02 | Phase 3 | Pending |
| BANNER-03 | Phase 3 | Pending |
| BULK-02 | Phase 4 | Pending |
| BULK-03 | Phase 4 | Pending |
| SOCIAL-01 | Phase 5 | Pending |
| SOCIAL-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation*

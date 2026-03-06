# Roadmap: AI Photo Banner

## Overview

Deliver an AI-powered photo banner platform for car dealerships in 5 phases. Start with dealer accounts and infrastructure, then build the upload-to-classification pipeline, add banner compositing with preview/edit, scale to bulk processing with realtime progress, and finish with social media ad generation. Each phase delivers a testable increment that builds on the previous.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Dealer Accounts & Foundation** - Auth, branding, database schema, storage buckets, RLS
- [ ] **Phase 2: Upload & AI Vision** - Photo upload pipeline with Gemini AI classification
- [ ] **Phase 3: Banner Compositing** - Template overlays, preview, and per-photo editing
- [ ] **Phase 4: Bulk Processing & Export** - Realtime progress tracking and ZIP download
- [ ] **Phase 5: Social Ad Generation** - Nano Banana AI-generated Facebook and Instagram ads

## Phase Details

### Phase 1: Dealer Accounts & Foundation
**Goal**: Dealers can create accounts, set up their branding, and have preferences persist across sessions
**Depends on**: Nothing (first phase)
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04
**Success Criteria** (what must be TRUE):
  1. Dealer can sign up with email/password, log in, and log out
  2. Dealer can upload their logo and see it displayed in their account
  3. Dealer can set brand colors and see them saved
  4. Dealer returns to the app next day and all preferences are intact
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Upload & AI Vision
**Goal**: Dealers can upload vehicle photos and receive AI-powered classification with generated banner text
**Depends on**: Phase 1
**Requirements**: BULK-01, VISION-01, VISION-02, VISION-03
**Success Criteria** (what must be TRUE):
  1. User can drag and drop multiple photos and see them appear in their batch
  2. Each uploaded photo receives an AI classification label (exterior, interior, engine, wheels, etc.)
  3. Each photo shows AI-generated banner text based on what the photo contains
  4. User can see confidence scores for each classification to judge accuracy
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Banner Compositing
**Goal**: Dealers can apply professional banner overlays to photos, preview results, and edit before export
**Depends on**: Phase 2
**Requirements**: BANNER-01, BANNER-02, BANNER-03
**Success Criteria** (what must be TRUE):
  1. User can apply banner overlays in top, bottom, both, or full-ad positions on any photo
  2. User can preview the bannered photo result before committing to export
  3. User can edit banner text and position on individual photos and see changes reflected
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Bulk Processing & Export
**Goal**: Dealers can process entire inventory photo sets automatically and download results as ZIP
**Depends on**: Phase 3
**Requirements**: BULK-02, BULK-03
**Success Criteria** (what must be TRUE):
  1. User can trigger bulk processing on a batch and see real-time progress updates
  2. User can download all bannered photos from a batch as a single ZIP file
  3. Progress indicators show per-photo status so user knows which photos are done
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Social Ad Generation
**Goal**: Dealers can generate professional social media ad graphics from their vehicle photos using AI
**Depends on**: Phase 3
**Requirements**: SOCIAL-01, SOCIAL-02
**Success Criteria** (what must be TRUE):
  1. User can generate a Facebook-format square (1080x1080) ad graphic from a vehicle photo
  2. User can generate Instagram story (1080x1920) and square (1080x1080) ad graphics
  3. Generated ads incorporate dealer branding (logo, colors) from account settings
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-|-|-|-|
| 1. Dealer Accounts & Foundation | 0/TBD | Not started | - |
| 2. Upload & AI Vision | 0/TBD | Not started | - |
| 3. Banner Compositing | 0/TBD | Not started | - |
| 4. Bulk Processing & Export | 0/TBD | Not started | - |
| 5. Social Ad Generation | 0/TBD | Not started | - |

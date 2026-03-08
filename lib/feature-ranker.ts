/**
 * Feature Ranking Engine
 *
 * Sits between feature extraction and banner generation.
 * Scores candidate features using the knowledge base to determine
 * what deserves emphasis for a specific vehicle segment + photo type.
 */

import segmentRules from './knowledge-base/segment-priority-rules.json'
import featureTaxonomy from './knowledge-base/feature-taxonomy.json'
import bannerRules from './knowledge-base/banner-selection-rules.json'

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────

export type VehicleSegment = keyof typeof segmentRules.segments
export type SegmentModifier = keyof typeof segmentRules.modifiers
export type PhotoType = keyof typeof bannerRules.photoTypeMapping
export type CanonicalFeature = keyof typeof featureTaxonomy.features

export interface ExtractedFeature {
  feature: CanonicalFeature
  source: 'structured_data' | 'visible_in_photo' | 'trust_signal' | 'inferred'
  confidence: number
  visibleInPhoto: boolean
}

export interface ScoredFeature extends ExtractedFeature {
  score: number
  displayLabel: string
}

export interface RankingContext {
  segment: VehicleSegment
  modifiers: SegmentModifier[]
  photoType: PhotoType
  trimTier: 'base' | 'mid' | 'top'
  alreadyUsedFeatures: string[]
}

export interface RankingResult {
  segment: VehicleSegment
  photoType: PhotoType
  rankedFeatures: ScoredFeature[]
  bannerText: string
  buyerPriorityOrder: string[]
  tableStakesFeatures: string[]
  mustMentionSpecs: string[]
}

// ─────────────────────────────────────────────
//  SEGMENT CLASSIFICATION
// ─────────────────────────────────────────────

const classificationHints = bannerRules.segmentClassificationHints as Record<string, {
  makes?: string[]
  models?: string[]
  traits?: string[]
}>

/**
 * Classify a vehicle into a segment based on make/model/body/fuel data.
 */
export function classifySegment(vehicle: {
  make?: string
  model?: string
  bodyType?: string
  fuelType?: string
  drivetrain?: string
  trim?: string
}): { segment: VehicleSegment; modifiers: SegmentModifier[] } {
  const make = vehicle.make?.trim() || ''
  const model = vehicle.model?.trim() || ''
  const bodyLower = (vehicle.bodyType || '').toLowerCase()
  const fuelLower = (vehicle.fuelType || '').toLowerCase()
  const trimLower = (vehicle.trim || '').toLowerCase()

  let bestSegment: VehicleSegment = 'midsize_suv_crossover'
  let bestScore = 0

  for (const [seg, hints] of Object.entries(classificationHints)) {
    let score = 0
    if (hints.makes?.some(m => make.toLowerCase().includes(m.toLowerCase()))) score += 2
    if (hints.models?.some(m => model.toLowerCase().includes(m.toLowerCase()))) score += 5
    if (score > bestScore) {
      bestScore = score
      bestSegment = seg as VehicleSegment
    }
  }

  // Body type fallbacks
  if (bestScore === 0) {
    if (bodyLower.includes('sedan')) bestSegment = 'midsize_sedan'
    else if (bodyLower.includes('coupe')) bestSegment = 'sports_car'
    else if (bodyLower.includes('truck') || bodyLower.includes('pickup')) bestSegment = 'half_ton_truck'
    else if (bodyLower.includes('van') || bodyLower.includes('minivan')) bestSegment = 'minivan'
    else if (bodyLower.includes('suv') || bodyLower.includes('crossover')) bestSegment = 'midsize_suv_crossover'
  }

  // Determine modifiers
  const modifiers: SegmentModifier[] = []
  if (fuelLower.includes('hybrid') && fuelLower.includes('plug')) modifiers.push('plugin_hybrid')
  else if (fuelLower.includes('hybrid')) modifiers.push('hybrid')
  if (fuelLower.includes('diesel')) modifiers.push('diesel')
  if (fuelLower.includes('electric') || fuelLower === 'ev') {
    bestSegment = 'electric_vehicle'
  }

  return { segment: bestSegment, modifiers }
}

// ─────────────────────────────────────────────
//  TRIM TIER DETECTION
// ─────────────────────────────────────────────

const TOP_TRIM_KEYWORDS = [
  'platinum', 'limited', 'denali', 'king ranch', 'high country', 'reserve',
  'pinnacle', 'calligraphy', 'prestige', 'premium plus', 'inscription',
  'gt-line', 'first edition', 'launch edition'
]
const MID_TRIM_KEYWORDS = [
  'xlt', 'sel', 'ex-l', 'ex', 'sport', 'preferred', 'premium',
  'touring', 'lariat', 'rst', 'lt', 'slt', 'limited'
]

export function detectTrimTier(trim?: string): 'base' | 'mid' | 'top' {
  if (!trim) return 'mid'
  const t = trim.toLowerCase()
  if (TOP_TRIM_KEYWORDS.some(k => t.includes(k))) return 'top'
  if (MID_TRIM_KEYWORDS.some(k => t.includes(k))) return 'mid'
  return 'base'
}

// ─────────────────────────────────────────────
//  FEATURE NORMALIZATION
// ─────────────────────────────────────────────

/**
 * Map raw feature strings to canonical feature names.
 * Handles common variations in how features are described.
 */
const FEATURE_ALIASES: Record<string, CanonicalFeature> = {
  'heated seats': 'HEATED_FRONT_SEATS',
  'heated front seats': 'HEATED_FRONT_SEATS',
  'seat heaters': 'HEATED_FRONT_SEATS',
  'cooled seats': 'VENTILATED_FRONT_SEATS',
  'ventilated seats': 'VENTILATED_FRONT_SEATS',
  'ventilated front seats': 'VENTILATED_FRONT_SEATS',
  'massage seats': 'MASSAGING_SEATS',
  'massaging seats': 'MASSAGING_SEATS',
  'heated steering wheel': 'HEATED_STEERING_WHEEL',
  'heated steering': 'HEATED_STEERING_WHEEL',
  'leather': 'LEATHER_SEATS',
  'leather seats': 'LEATHER_SEATS',
  'leather interior': 'LEATHER_SEATS',
  'premium leather': 'LEATHER_SEATS',
  'leatherette': 'LEATHER_SEATS',
  'memory seats': 'MEMORY_SEATS',
  'driver memory': 'MEMORY_SEATS',
  'apple carplay': 'APPLE_CARPLAY',
  'carplay': 'APPLE_CARPLAY',
  'android auto': 'APPLE_CARPLAY',
  'wireless carplay': 'WIRELESS_APPLE_CARPLAY',
  'wireless apple carplay': 'WIRELESS_APPLE_CARPLAY',
  'panoramic roof': 'PANORAMIC_ROOF',
  'pano roof': 'PANORAMIC_ROOF',
  'panoramic sunroof': 'PANORAMIC_ROOF',
  'sunroof': 'SUNROOF',
  'moonroof': 'SUNROOF',
  'premium audio': 'PREMIUM_AUDIO',
  'bose': 'BOSE_AUDIO',
  'bose audio': 'BOSE_AUDIO',
  'harman kardon': 'HARMAN_KARDON_AUDIO',
  'b&o': 'BANG_OLUFSEN_AUDIO',
  'bang & olufsen': 'BANG_OLUFSEN_AUDIO',
  'bang and olufsen': 'BANG_OLUFSEN_AUDIO',
  'navigation': 'NAVIGATION',
  'nav': 'NAVIGATION',
  'built-in nav': 'NAVIGATION',
  'heads up display': 'HUD',
  'head up display': 'HUD',
  'hud': 'HUD',
  'digital cluster': 'DIGITAL_CLUSTER',
  'digital gauges': 'DIGITAL_CLUSTER',
  'wireless charging': 'WIRELESS_CHARGING',
  'qi charging': 'WIRELESS_CHARGING',
  'blind spot': 'BLIND_SPOT_MONITORING',
  'blind spot monitoring': 'BLIND_SPOT_MONITORING',
  'bsm': 'BLIND_SPOT_MONITORING',
  'adaptive cruise': 'ADAPTIVE_CRUISE_CONTROL',
  'adaptive cruise control': 'ADAPTIVE_CRUISE_CONTROL',
  'radar cruise': 'ADAPTIVE_CRUISE_CONTROL',
  'bluecruise': 'BLUECRUISE',
  'blue cruise': 'BLUECRUISE',
  'supercruise': 'HANDS_FREE_DRIVING',
  'hands free driving': 'HANDS_FREE_DRIVING',
  '360 camera': '360_CAMERA',
  'surround view': '360_CAMERA',
  'surround view camera': '360_CAMERA',
  "bird's eye view": '360_CAMERA',
  'backup camera': 'BACKUP_CAMERA',
  'rearview camera': 'BACKUP_CAMERA',
  'parking sensors': 'PARKING_SENSORS',
  'park assist': 'PARKING_SENSORS',
  'power liftgate': 'POWER_LIFTGATE',
  'hands free liftgate': 'POWER_LIFTGATE',
  'power tailgate': 'POWER_LIFTGATE',
  'remote start': 'REMOTE_START',
  'push button start': 'PUSH_BUTTON_START',
  'keyless start': 'PUSH_BUTTON_START',
  'keyless entry': 'KEYLESS_ENTRY',
  'smart key': 'KEYLESS_ENTRY',
  'awd': 'AWD',
  'all wheel drive': 'AWD',
  'all-wheel drive': 'AWD',
  '4wd': 'FOUR_WHEEL_DRIVE',
  '4x4': 'FOUR_WHEEL_DRIVE',
  'four wheel drive': 'FOUR_WHEEL_DRIVE',
  'turbo': 'TURBO_ENGINE',
  'turbocharged': 'TURBO_ENGINE',
  'twin turbo': 'TURBO_ENGINE',
  'ecoboost': 'ECOBOOST',
  'hybrid': 'HYBRID_POWERTRAIN',
  'diesel': 'DIESEL_ENGINE',
  'powerstroke': 'DIESEL_ENGINE',
  'duramax': 'DIESEL_ENGINE',
  'cummins': 'DIESEL_ENGINE',
  'pro power onboard': 'PRO_POWER_ONBOARD',
  'pro power': 'PRO_POWER_ONBOARD',
  'tow package': 'TOW_PACKAGE',
  'trailer tow': 'TOW_PACKAGE',
  'towing package': 'TOW_PACKAGE',
  'max tow': 'MAX_TOW_PACKAGE',
  'max tow package': 'MAX_TOW_PACKAGE',
  'spray in bedliner': 'SPRAY_IN_BEDLINER',
  'bedliner': 'SPRAY_IN_BEDLINER',
  'bed liner': 'SPRAY_IN_BEDLINER',
  'running boards': 'RUNNING_BOARDS',
  'step bars': 'RUNNING_BOARDS',
  'led headlights': 'LED_HEADLIGHTS',
  'led lights': 'LED_HEADLIGHTS',
  'alloy wheels': 'PREMIUM_WHEELS',
  'premium wheels': 'PREMIUM_WHEELS',
  'chrome wheels': 'PREMIUM_WHEELS',
  'third row': 'THIRD_ROW_SEATING',
  '3rd row': 'THIRD_ROW_SEATING',
  'third row seating': 'THIRD_ROW_SEATING',
  '7 passenger': 'THIRD_ROW_SEATING',
  '8 passenger': 'THIRD_ROW_SEATING',
  "captain's chairs": 'CAPTAINS_CHAIRS',
  'captains chairs': 'CAPTAINS_CHAIRS',
  'power folding third row': 'POWER_FOLDING_THIRD_ROW',
  'power sliding doors': 'POWER_SLIDING_DOORS',
  'rear entertainment': 'REAR_SEAT_ENTERTAINMENT',
  'rear seat entertainment': 'REAR_SEAT_ENTERTAINMENT',
  'dvd': 'REAR_SEAT_ENTERTAINMENT',
  'stow n go': 'STOW_N_GO',
  "stow 'n go": 'STOW_N_GO',
  'low miles': 'LOW_MILES',
  'low mileage': 'LOW_MILES',
  'one owner': 'ONE_OWNER',
  '1 owner': 'ONE_OWNER',
  'clean title': 'CLEAN_TITLE',
  'clean carfax': 'CLEAN_TITLE',
  'certified': 'CPO_WARRANTY',
  'certified pre-owned': 'CPO_WARRANTY',
  'cpo': 'CPO_WARRANTY',
  'm sport': 'M_SPORT_PACKAGE',
  'm sport package': 'M_SPORT_PACKAGE',
  'amg line': 'AMG_LINE',
  'amg package': 'AMG_LINE',
  'f sport': 'F_SPORT',
  'f sport package': 'F_SPORT',
  'off road package': 'OFF_ROAD_PACKAGE',
  'trail rated': 'OFF_ROAD_PACKAGE',
  'trd off road': 'OFF_ROAD_PACKAGE',
  'performance exhaust': 'PERFORMANCE_EXHAUST',
  'active exhaust': 'PERFORMANCE_EXHAUST',
  'sport exhaust': 'PERFORMANCE_EXHAUST',
  'brembo': 'BREMBO_BRAKES',
  'brembo brakes': 'BREMBO_BRAKES',
  'limited slip': 'LIMITED_SLIP_DIFF',
  'lsd': 'LIMITED_SLIP_DIFF',
  'manual': 'MANUAL_TRANSMISSION',
  'manual transmission': 'MANUAL_TRANSMISSION',
  '6 speed manual': 'MANUAL_TRANSMISSION',
  'stick shift': 'MANUAL_TRANSMISSION',
  'long range': 'LONG_RANGE_BATTERY',
  'extended range': 'LONG_RANGE_BATTERY',
  'fast charging': 'FAST_CHARGING',
  'dc fast charging': 'FAST_CHARGING',
  'dual motor': 'AWD_DUAL_MOTOR',
  'dual motor awd': 'AWD_DUAL_MOTOR',
  'one pedal': 'ONE_PEDAL_DRIVING',
  'one pedal driving': 'ONE_PEDAL_DRIVING',
  'v2l': 'VEHICLE_TO_LOAD',
  'vehicle to load': 'VEHICLE_TO_LOAD',
  'roof rails': 'ROOF_RAILS',
  'roof rack': 'ROOF_RAILS',
  'multipro tailgate': 'MULTIFUNCTION_TAILGATE',
  'multi-flex tailgate': 'MULTIFUNCTION_TAILGATE',
}

export function normalizeFeature(raw: string): CanonicalFeature | null {
  const lower = raw.toLowerCase().trim()
  // Direct alias match
  if (FEATURE_ALIASES[lower]) return FEATURE_ALIASES[lower]
  // Check if it's already a canonical name
  if (lower.toUpperCase() in featureTaxonomy.features) return lower.toUpperCase() as CanonicalFeature
  // Fuzzy: check if any alias is a substring
  for (const [alias, canonical] of Object.entries(FEATURE_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return canonical
  }
  return null
}

// ─────────────────────────────────────────────
//  FEATURE SCORING
// ─────────────────────────────────────────────

const weights = bannerRules.scoringWeights
const taxonomy = featureTaxonomy.features as Record<string, {
  displayLabelLong: string
  displayLabelShort: string
  tableStakes: boolean
  allowedInBanner: boolean
  photoTypesWhereRelevant: string[]
  segmentBoosts: Record<string, number>
}>

function scoreFeature(
  feature: ExtractedFeature,
  ctx: RankingContext,
): number {
  const meta = taxonomy[feature.feature]
  if (!meta) return -100
  if (!meta.allowedInBanner) return -100
  if (meta.tableStakes) return weights.tableStakesPenalty

  let score = 0

  // 1. Segment priority — how much this feature matters for this vehicle type
  const segBoost = meta.segmentBoosts[ctx.segment] || 0
  score += segBoost * weights.segmentPriority

  // 2. Source confidence
  score += feature.confidence * 10 * weights.sourceConfidence

  // 3. Photo relevance — does this feature make sense on this photo?
  const photoRules = bannerRules.photoTypeMapping[ctx.photoType] as { preferFeatures: string[]; avoidFeatures: string[] } | undefined
  if (photoRules) {
    if (photoRules.preferFeatures.includes(feature.feature)) score += weights.photoPreferBonus * 5
    if (photoRules.avoidFeatures.includes(feature.feature)) score += weights.photoAvoidPenalty * 3
    if (meta.photoTypesWhereRelevant.includes(ctx.photoType)) score += weights.photoRelevance * 3
  }

  // 4. Trim relevance — prioritize features appropriate for this trim level
  const segmentData = segmentRules.segments[ctx.segment] as { midTrimPriority: string[]; topTrimPriority: string[] } | undefined
  if (segmentData) {
    if (ctx.trimTier === 'top' && segmentData.topTrimPriority?.includes(feature.feature)) {
      score += weights.trimRelevance * 5
    } else if (ctx.trimTier === 'mid' && segmentData.midTrimPriority?.includes(feature.feature)) {
      score += weights.trimRelevance * 4
    }
  }

  // 5. Modifier boosts (hybrid, diesel, etc.)
  for (const mod of ctx.modifiers) {
    const modData = segmentRules.modifiers[mod]
    if (modData?.boostFeatures?.includes(feature.feature)) {
      score += 8
    }
  }

  // 6. Uniqueness — penalize already-used features heavily
  if (ctx.alreadyUsedFeatures.includes(feature.feature)) {
    score += weights.alreadyUsedPenalty
  } else {
    score += weights.uniquenessBonus * 2
  }

  // 7. Visible in photo bonus
  if (feature.visibleInPhoto) score += 3

  return score
}

// ─────────────────────────────────────────────
//  MAIN RANKING FUNCTION
// ─────────────────────────────────────────────

/**
 * Rank features for a specific photo and return the best banner candidates.
 */
export function rankFeaturesForPhoto(
  features: ExtractedFeature[],
  ctx: RankingContext,
): RankingResult {
  const scored: ScoredFeature[] = features
    .map(f => {
      const meta = taxonomy[f.feature]
      return {
        ...f,
        score: scoreFeature(f, ctx),
        displayLabel: meta?.displayLabelShort || f.feature.replace(/_/g, ' '),
      }
    })
    .filter(f => f.score > -50)
    .sort((a, b) => b.score - a.score)

  // Build banner text from top features
  const constraints = bannerRules.bannerConstraints
  const selected: ScoredFeature[] = []
  let bannerText = ''

  for (const feat of scored) {
    if (selected.length >= constraints.maxFeatures) break
    const candidate = selected.length === 0
      ? feat.displayLabel
      : bannerText + constraints.separator + feat.displayLabel
    if (candidate.length <= constraints.maxCharacters) {
      selected.push(feat)
      bannerText = candidate
    }
  }

  if (!bannerText) bannerText = 'QUALITY PRE-OWNED'

  // Get segment metadata for context
  const segData = segmentRules.segments[ctx.segment] as {
    leadPriorities: string[]
    tableStakes: string[]
    mustMentionSpecs: string[]
  } | undefined

  return {
    segment: ctx.segment,
    photoType: ctx.photoType,
    rankedFeatures: scored,
    bannerText: bannerText.toUpperCase(),
    buyerPriorityOrder: segData?.leadPriorities || [],
    tableStakesFeatures: segData?.tableStakes || [],
    mustMentionSpecs: segData?.mustMentionSpecs || [],
  }
}

// ─────────────────────────────────────────────
//  PROMPT CONTEXT BUILDER
// ─────────────────────────────────────────────

/**
 * Build a structured ranking context block to inject into the Gemini prompt.
 * This gives the AI pre-ranked candidates so it makes better choices.
 */
export function buildRankingPromptContext(
  ranking: RankingResult,
  confirmedFeatures: string[],
  photoContext: { shotType: string; visibleFeatures: string[] },
): string {
  const top5 = ranking.rankedFeatures.slice(0, 5)

  return `
=== FEATURE RANKING (from knowledge base — use this to prioritize) ===
Vehicle Segment: ${ranking.segment}
Photo Type: ${photoContext.shotType}

BUYER PRIORITY ORDER for this segment:
${ranking.buyerPriorityOrder.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

TABLE STAKES (do NOT lead with these):
${ranking.tableStakesFeatures.join(', ')}

CONFIRMED FEATURES (ranked by importance for this segment + photo):
${top5.map((f, i) => `  ${i + 1}. ${f.displayLabel} (score: ${f.score.toFixed(1)}, source: ${f.source})`).join('\n')}

SUGGESTED BANNER: "${ranking.bannerText}"

MUST-MENTION SPECS (for SEO description):
${ranking.mustMentionSpecs.join(', ')}

RULES:
- Choose from confirmed features ONLY
- Prioritize according to the buyer-priority order above
- Penalize table-stakes items — they don't sell
- Choose features relevant to this ${photoContext.shotType} photo
- The suggested banner is a starting point — you may adjust wording but keep the same features`
}

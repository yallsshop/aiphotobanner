'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Vehicle {
  id: string; vin: string; stock_no: string; heading: string
  year: number; make: string; model: string; trim: string
  body_type: string; engine: string; transmission: string
  drivetrain: string; fuel_type: string; exterior_color: string
  interior_color: string; miles: number; doors: number
  cylinders: number; seating: string; highway_mpg: number
  city_mpg: number; dom: number; carfax_1_owner: boolean
  carfax_clean_title: boolean; photo_urls: string[]; vdp_url: string
  photo_status?: string; processed_photo_urls?: string[]
  features?: string[]
}

interface EnhancementSuggestion {
  action: string
  instruction: string
  priority: string
}

interface PhotoAnalysis {
  classification: string
  confidence: number
  banner_text: string
  features: string[]
  condition_notes?: string
  enhancement_suggestions?: EnhancementSuggestion[]
}

interface AnalyzedPhoto {
  url: string
  analysis?: PhotoAnalysis
  analyzing?: boolean
  banneredUrl?: string
  banneredBlob?: Blob
  creating?: boolean
  enhancedUrl?: string
  enhancing?: boolean
}

interface DealerInfo {
  name: string
  logo_url: string | null
  brand_colors: { primary: string; secondary: string }
  phone?: string
  description_must_haves?: string
}

export default function VehicleDetailPage() {
  const params = useParams()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [dealer, setDealer] = useState<DealerInfo | null>(null)
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([])
  const [exteriorFeatures, setExteriorFeatures] = useState<string[]>([])
  const [interiorFeatures, setInteriorFeatures] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [creatingBanners, setCreatingBanners] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [error, setError] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [savedToCloud, setSavedToCloud] = useState(false)
  const [seoDescription, setSeoDescription] = useState('')
  const [copiedSeo, setCopiedSeo] = useState(false)
  const [enhancePrompt, setEnhancePrompt] = useState('')
  const [enhanceModel, setEnhanceModel] = useState<'flash' | 'pro'>('flash')
  const [bannerMode, setBannerMode] = useState<'standard' | 'ai_banner'>('standard')
  const [aiModel, setAiModel] = useState<'pro' | 'flash'>('flash')
  const [customFeatures, setCustomFeatures] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [windowStickerFile, setWindowStickerFile] = useState<File | null>(null)
  const [windowStickerPreview, setWindowStickerPreview] = useState<string | null>(null)
  const [showContextPanel, setShowContextPanel] = useState(true)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [vehicleRes, dealerRes] = await Promise.all([
      supabase.from('inventory').select('*').eq('id', params.id).single(),
      supabase.from('dealers').select('*').eq('user_id', user.id).single(),
    ])

    if (vehicleRes.data) {
      setVehicle(vehicleRes.data)
      const realPhotos = (vehicleRes.data.photo_urls || []).filter((url: string) =>
        !url.includes('/assets/stock/') && !url.includes('transparent')
      )
      setPhotos(realPhotos.map((url: string) => ({ url })))

      if (vehicleRes.data.photo_status === 'processed') {
        setSavedToCloud(true)
      }
    }
    if (dealerRes.data) setDealer(dealerRes.data)
    setLoading(false)
  }, [supabase, params.id])

  useEffect(() => { loadData() }, [loadData])

  async function handleAnalyze() {
    if (!vehicle || !photos.length) return
    setProcessing(true)
    setError('')
    setPhotos(prev => prev.map(p => !p.analysis ? { ...p, analyzing: true } : p))

    try {
      const urls = photos.filter(p => !p.analysis).map(p => p.url)

      // Build window sticker data if uploaded
      let windowStickerData: { data: string; mimeType: string } | undefined
      if (windowStickerFile) {
        const buffer = await windowStickerFile.arrayBuffer()
        const base64 = btoa(new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), ''))
        windowStickerData = { data: base64, mimeType: windowStickerFile.type }
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: urls,
          vehicleContext: {
            year: vehicle.year, make: vehicle.make, model: vehicle.model,
            trim: vehicle.trim, engine: vehicle.engine, transmission: vehicle.transmission,
            drivetrain: vehicle.drivetrain, exterior_color: vehicle.exterior_color,
            interior_color: vehicle.interior_color, miles: vehicle.miles,
            body_type: vehicle.body_type, fuel_type: vehicle.fuel_type,
            doors: vehicle.doors, cylinders: vehicle.cylinders, seating: vehicle.seating,
            highway_mpg: vehicle.highway_mpg, city_mpg: vehicle.city_mpg,
            carfax_1_owner: vehicle.carfax_1_owner, carfax_clean_title: vehicle.carfax_clean_title,
            dom: vehicle.dom,
            features: vehicle.features,
          },
          descriptionMustHaves: dealer?.description_must_haves || '',
          customFeatures: customFeatures.trim() || undefined,
          customInstructions: customInstructions.trim() || undefined,
          windowSticker: windowStickerData,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }

      const data = await res.json()
      setExteriorFeatures(data.exterior_features || [])
      setInteriorFeatures(data.interior_features || [])
      setSeoDescription(data.seo_description || '')

      setPhotos(prev => prev.map(p => {
        const result = data.results?.find((r: { ref: string }) => r.ref === p.url)
        if (result) return { ...p, analysis: result.analysis, analyzing: false }
        return { ...p, analyzing: false }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setPhotos(prev => prev.map(p => ({ ...p, analyzing: false })))
    } finally {
      setProcessing(false)
    }
  }

  async function handleCreateBanners() {
    if (!dealer || !vehicle) return
    setCreatingBanners(true)
    setError('')

    try {
      const analyzed = photos.filter(p => p.analysis)

      for (let i = 0; i < analyzed.length; i++) {
        const photo = analyzed[i]
        setPhotos(prev => prev.map(p => p.url === photo.url ? { ...p, creating: true } : p))

        const res = await fetch('/api/banner/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: photo.url,
            topText: photo.analysis!.banner_text,
            brandColor: dealer.brand_colors?.primary || '#d4a053',
            secondaryColor: dealer.brand_colors?.secondary || '#ffffff',
            dealerName: dealer.name,
            phone: dealer.phone || '',
            ...(bannerMode === 'ai_banner' ? {
              mode: 'ai_banner',
              aiModel,
              vehicleName: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`.trim() : undefined,
            } : {}),
          }),
        })

        if (!res.ok) throw new Error('Banner creation failed')

        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        setPhotos(prev => prev.map(p =>
          p.url === photo.url ? { ...p, banneredUrl: blobUrl, banneredBlob: blob, creating: false } : p
        ))
      }

      // Create exterior features image
      const extPhoto = analyzed.find(p =>
        p.analysis?.classification?.startsWith('exterior')
      ) || analyzed[0]
      if (extPhoto && exteriorFeatures.length > 0) {
        const extRes = await fetch('/api/banner/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: extPhoto.url,
            topText: '',
            brandColor: dealer.brand_colors?.primary || '#d4a053',
            secondaryColor: dealer.brand_colors?.secondary || '#ffffff',
            dealerName: dealer.name,
            mode: 'exterior_features',
            featuresList: exteriorFeatures,
            ...(bannerMode === 'ai_banner' ? { aiModel } : {}),
          }),
        })
        if (extRes.ok) {
          const blob = await extRes.blob()
          const blobUrl = URL.createObjectURL(blob)
          setPhotos(prev => [...prev, {
            url: extPhoto.url,
            analysis: { classification: 'exterior_features', confidence: 1, banner_text: 'EXTERIOR FEATURES', features: exteriorFeatures },
            banneredUrl: blobUrl,
            banneredBlob: blob,
          }])
        }
      }

      // Create interior features image
      const intPhoto = analyzed.find(p =>
        p.analysis?.classification?.startsWith('interior') || p.analysis?.classification === 'dashboard'
      )
      if (intPhoto && interiorFeatures.length > 0) {
        const intRes = await fetch('/api/banner/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: intPhoto.url,
            topText: '',
            brandColor: dealer.brand_colors?.primary || '#d4a053',
            secondaryColor: dealer.brand_colors?.secondary || '#ffffff',
            dealerName: dealer.name,
            mode: 'interior_features',
            featuresList: interiorFeatures,
            ...(bannerMode === 'ai_banner' ? { aiModel } : {}),
          }),
        })
        if (intRes.ok) {
          const blob = await intRes.blob()
          const blobUrl = URL.createObjectURL(blob)
          setPhotos(prev => [...prev, {
            url: intPhoto.url,
            analysis: { classification: 'interior_features', confidence: 1, banner_text: 'INTERIOR FEATURES', features: interiorFeatures },
            banneredUrl: blobUrl,
            banneredBlob: blob,
          }])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Banner creation failed')
    } finally {
      setCreatingBanners(false)
    }
  }

  async function handleSaveProcessed() {
    if (!vehicle) return
    setSaving(true)
    setError('')

    try {
      const banneredPhotos = photos.filter(p => p.banneredBlob)

      // Convert blobs to base64
      const photoData = await Promise.all(
        banneredPhotos.map(async (p, i) => {
          const arrayBuffer = await p.banneredBlob!.arrayBuffer()
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          )
          return {
            filename: `${vehicle.stock_no || 'photo'}_${i + 1}.jpg`,
            data: base64,
          }
        })
      )

      const aiAnalysis = {
        exterior_features: exteriorFeatures,
        interior_features: interiorFeatures,
        photos: photos
          .filter(p => p.analysis)
          .map(p => ({ url: p.url, ...p.analysis })),
      }

      const res = await fetch(`/api/inventory/${vehicle.id}/save-processed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photoData, aiAnalysis }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      const result = await res.json()
      setSavedToCloud(true)
      setVehicle(prev => prev ? { ...prev, photo_status: 'processed', processed_photo_urls: result.urls } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(idx: number) {
    setEditingIdx(idx)
    setEditText(photos[idx].analysis?.banner_text || '')
  }

  function saveEdit() {
    if (editingIdx === null) return
    setPhotos(prev => prev.map((p, i) =>
      i === editingIdx && p.analysis
        ? { ...p, analysis: { ...p.analysis, banner_text: editText.toUpperCase().slice(0, 40) } }
        : p
    ))
    setEditingIdx(null)
  }

  async function downloadAll() {
    const bannered = photos.filter(p => p.banneredUrl)
    for (let i = 0; i < bannered.length; i++) {
      const a = document.createElement('a')
      a.href = bannered[i].banneredUrl!
      a.download = `${vehicle?.stock_no || 'photo'}_${i + 1}.jpg`
      a.click()
      await new Promise(r => setTimeout(r, 200))
    }
  }

  async function handleEnhance(photoIdx: number, instruction: string) {
    const photo = photos[photoIdx]
    if (!photo) return

    setPhotos(prev => prev.map((p, i) => i === photoIdx ? { ...p, enhancing: true } : p))
    setError('')

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: photo.url,
          instruction,
          model: enhanceModel,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Enhancement failed')
      }

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      setPhotos(prev => prev.map((p, i) =>
        i === photoIdx ? { ...p, enhancedUrl: blobUrl, enhancing: false } : p
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enhancement failed')
      setPhotos(prev => prev.map((p, i) => i === photoIdx ? { ...p, enhancing: false } : p))
    }
  }

  const classColors: Record<string, string> = {
    exterior_front: 'bg-blue-500/20 text-blue-400',
    exterior_rear: 'bg-blue-500/20 text-blue-400',
    exterior_side: 'bg-blue-500/20 text-blue-400',
    interior_front: 'bg-purple-500/20 text-purple-400',
    interior_rear: 'bg-purple-500/20 text-purple-400',
    dashboard: 'bg-purple-500/20 text-purple-400',
    engine: 'bg-red-500/20 text-red-400',
    wheels: 'bg-cyan-500/20 text-cyan-400',
    trunk: 'bg-green-500/20 text-green-400',
    detail: 'bg-amber-500/20 text-amber-400',
    exterior_features: 'bg-emerald-500/20 text-emerald-400',
    interior_features: 'bg-violet-500/20 text-violet-400',
    other: 'bg-gray-500/20 text-gray-400',
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  if (!vehicle) return <div className="text-muted">Vehicle not found</div>

  const selected = photos[selectedPhoto]
  const allAnalyzed = photos.length > 0 && photos.every(p => p.analysis)
  const hasBannered = photos.some(p => p.banneredUrl)

  return (
    <div>
      <div className="animate-fade-up mb-6 flex items-center gap-2 text-sm text-muted">
        <Link href="/inventory" className="hover:text-accent transition-colors">Inventory</Link>
        <span>/</span>
        <span className="text-foreground">{vehicle.heading}</span>
        {vehicle.photo_status === 'processed' && (
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-400 font-medium">Processed</span>
        )}
      </div>

      {/* Header + Actions */}
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-700 tracking-tight">
          {vehicle.heading}
        </h1>
        <div className="flex gap-3">
          {!allAnalyzed && (
            <button onClick={handleAnalyze} disabled={processing}
              className="btn-primary px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {processing ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Analyzing {photos.filter(p => !p.analysis).length} photos...</span>
                : `Analyze ${photos.filter(p => !p.analysis).length} Photos`}
            </button>
          )}
          {allAnalyzed && !hasBannered && (
            <div className="flex items-center gap-3">
              <button onClick={handleCreateBanners} disabled={creatingBanners}
                className="btn-primary px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                {creatingBanners ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Creating Banners...</span>
                  : 'Create Banners'}
              </button>
              <select
                value={bannerMode}
                onChange={(e) => setBannerMode(e.target.value as 'standard' | 'ai_banner')}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2.5 focus:border-accent-500/50 outline-none"
              >
                <option value="standard">Standard (SVG)</option>
                <option value="ai_banner">AI Generated</option>
              </select>
              {bannerMode === 'ai_banner' && (
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value as 'pro' | 'flash')}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2.5 focus:border-accent-500/50 outline-none"
                >
                  <option value="flash">Nano Banana 2 (Fast)</option>
                  <option value="pro">Nano Banana Pro (Quality)</option>
                </select>
              )}
            </div>
          )}
          {hasBannered && !savedToCloud && (
            <button onClick={handleSaveProcessed} disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors">
              {saving ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span>
                : 'Save & Mark Processed'}
            </button>
          )}
          {savedToCloud && (
            <span className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/20">
              Saved to Cloud
            </span>
          )}
          {hasBannered && (
            <button onClick={downloadAll}
              className="btn-primary px-5 py-2.5 rounded-lg text-sm font-semibold">
              Download All ({photos.filter(p => p.banneredUrl).length})
            </button>
          )}
        </div>
      </div>

      {/* Pre-Analysis Context Panel */}
      {showContextPanel && !allAnalyzed && photos.length > 0 && (
        <div className="animate-fade-up mb-6 bg-surface border border-accent/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
              </svg>
              <h3 className="font-[family-name:var(--font-display)] text-sm font-600">Pre-Analysis Context</h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/15 text-accent border border-accent/20">BETTER RESULTS</span>
            </div>
            <button onClick={() => setShowContextPanel(false)} className="text-xs text-muted hover:text-foreground transition-colors">Skip</button>
          </div>

          <p className="text-xs text-muted mb-4">Give the AI full context about this vehicle before analyzing. The more it knows, the better and less repetitive the banner text will be.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Feature list paste box */}
            <div>
              <label className="text-xs font-medium text-muted block mb-1.5">Vehicle Features / Options List</label>
              <textarea
                value={customFeatures}
                onChange={(e) => setCustomFeatures(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-2 focus:border-accent/50 outline-none resize-none"
                rows={6}
                placeholder={"Paste features from the dealer feed, window sticker, or build sheet...\n\nExample:\n- Heated & Ventilated Front Seats\n- Panoramic Moonroof\n- Harman Kardon 12-Speaker Audio\n- Adaptive Cruise Control\n- 20\" Alloy Wheels\n- Wireless Apple CarPlay & Android Auto"}
              />
              <p className="text-[10px] text-muted-2 mt-1">Each feature on its own line or comma-separated</p>
            </div>

            {/* Window sticker upload + instructions */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Window Sticker / Build Sheet</label>
                <div className="relative">
                  {windowStickerPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <img src={windowStickerPreview} alt="Window sticker" className="w-full h-32 object-contain bg-white" />
                      <button
                        onClick={() => { setWindowStickerFile(null); setWindowStickerPreview(null) }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-xs hover:bg-black/90"
                      >&times;</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border hover:border-accent/40 cursor-pointer transition-colors bg-surface-2">
                      <svg className="w-8 h-8 text-muted-2 mb-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="text-xs text-muted">Upload window sticker image</span>
                      <span className="text-[10px] text-muted-2">JPG, PNG — AI will read all features</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setWindowStickerFile(file)
                            setWindowStickerPreview(URL.createObjectURL(file))
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Custom Instructions</label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-2 focus:border-accent/50 outline-none resize-none"
                  rows={3}
                  placeholder={"e.g. Focus on the luxury features, mention the warranty, this is a CPO vehicle..."}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 text-danger text-sm bg-danger/10 px-4 py-3 rounded-lg border border-danger/20">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Photos */}
        <div className="lg:col-span-2">
          {/* Main photo */}
          {selected && (
            <div className="animate-fade-up relative aspect-[16/10] rounded-xl overflow-hidden border border-border bg-black mb-3">
              <img src={selected.banneredUrl || selected.url} alt="" className="w-full h-full object-contain" />
              {selected.analyzing && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-accent font-medium">AI Analyzing...</span>
                  </div>
                </div>
              )}
              {selected.creating && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-accent font-medium">Creating Banner...</span>
                  </div>
                </div>
              )}
              {selected.analysis && !selected.banneredUrl && (
                <>
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${classColors[selected.analysis.classification] || classColors.other}`}>
                      {selected.analysis.classification.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-black/60 text-white">
                      {Math.round(selected.analysis.confidence * 100)}%
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-12 pb-4 px-4">
                    <p className="text-xs text-muted mb-1">Top banner preview:</p>
                    <p className="text-accent-light font-bold tracking-wider">{selected.analysis.banner_text}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Thumbnail strip */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {photos.map((photo, i) => (
              <button key={i} onClick={() => setSelectedPhoto(i)}
                className={`relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  i === selectedPhoto ? 'border-accent' : 'border-border hover:border-border-hover'
                }`}>
                <img src={photo.banneredUrl || photo.url} alt="" className="w-full h-full object-cover" />
                {photo.analysis && !photo.banneredUrl && (
                  <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                )}
                {photo.banneredUrl && (
                  <div className="absolute top-0.5 right-0.5">
                    <span className="w-3 h-3 rounded-full bg-accent block" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Banner text editor for selected photo */}
          {selected?.analysis && !selected.banneredUrl && (
            <div className="mt-4 animate-fade-up bg-surface border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-muted">Banner Text</h3>
                <span className="text-xs text-muted-2">{selected.analysis.banner_text.length}/40 chars</span>
              </div>

              {editingIdx === selectedPhoto ? (
                <div className="flex gap-2">
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value.slice(0, 40))}
                    className="input-dark flex-1 px-3 py-2 rounded-lg text-sm font-bold tracking-wide uppercase"
                    maxLength={40}
                    autoFocus
                  />
                  <button onClick={saveEdit} className="btn-primary px-4 py-2 rounded-lg text-sm">Save</button>
                  <button onClick={() => setEditingIdx(null)} className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-foreground">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-accent-glow border border-accent/20 rounded-lg px-4 py-3">
                  <p className="text-accent-light font-bold tracking-wider text-sm">{selected.analysis.banner_text}</p>
                  <button onClick={() => startEdit(selectedPhoto)} className="text-xs text-muted hover:text-accent transition-colors ml-4">Edit</button>
                </div>
              )}

              {/* Features */}
              <div>
                <p className="text-xs text-muted mb-2">Detected in this photo</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.analysis.features.map((feat, j) => (
                    <span key={j} className="px-2.5 py-1 rounded-md text-xs bg-surface-3 text-foreground">{feat}</span>
                  ))}
                </div>
              </div>

              {/* AI Enhance — Experimental */}
              {(selected.analysis.enhancement_suggestions?.length || 0) > 0 && (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-xs font-600 text-violet-400">AI Enhance</h4>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/20">EXPERIMENTAL</span>
                  </div>
                  <div className="space-y-2">
                    {selected.analysis.enhancement_suggestions!.map((sug, j) => (
                      <div key={j} className="flex items-center justify-between gap-2 bg-surface-2 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sug.priority === 'high' ? 'bg-red-400' : sug.priority === 'medium' ? 'bg-accent' : 'bg-muted-2'}`} />
                          <span className="text-xs text-foreground truncate">{sug.action}</span>
                        </div>
                        <button
                          onClick={() => handleEnhance(selectedPhoto, sug.instruction)}
                          disabled={selected.enhancing}
                          className="flex-shrink-0 px-3 py-1 rounded-md text-[11px] font-medium bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 border border-violet-500/20 transition-colors disabled:opacity-50"
                        >
                          {selected.enhancing ? 'Working...' : 'Apply'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom enhance prompt */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs text-muted">Custom AI edit</p>
                  <select
                    value={enhanceModel}
                    onChange={(e) => setEnhanceModel(e.target.value as 'flash' | 'pro')}
                    className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-muted"
                  >
                    <option value="flash">Flash (fast)</option>
                    <option value="pro">Pro (quality)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={enhancePrompt}
                    onChange={(e) => setEnhancePrompt(e.target.value)}
                    className="input-dark flex-1 px-3 py-2 rounded-lg text-xs"
                    placeholder="e.g. Remove paper mats, brighten interior, replace background..."
                  />
                  <button
                    onClick={() => { if (enhancePrompt.trim()) handleEnhance(selectedPhoto, enhancePrompt.trim()) }}
                    disabled={!enhancePrompt.trim() || selected.enhancing}
                    className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 border border-violet-500/20 transition-colors disabled:opacity-50"
                  >
                    {selected.enhancing ? 'Working...' : 'Enhance'}
                  </button>
                </div>
              </div>

              {/* Enhanced result */}
              {selected.enhancedUrl && (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-violet-400 font-medium">Enhanced Result</p>
                    <a href={selected.enhancedUrl} download={`enhanced_${selectedPhoto}.png`} className="text-[11px] text-accent hover:text-accent-light transition-colors">Download</a>
                  </div>
                  <img src={selected.enhancedUrl} alt="Enhanced" className="w-full rounded-lg border border-violet-500/20" />
                </div>
              )}
            </div>
          )}

          {/* SEO Description */}
          {seoDescription && (
            <div className="mt-6 animate-fade-up bg-surface border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-accent">SEO Description</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(seoDescription)
                    setCopiedSeo(true)
                    setTimeout(() => setCopiedSeo(false), 2000)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copiedSeo
                      ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                      : 'bg-surface-3 text-muted hover:text-foreground border border-border hover:border-accent/30'
                  }`}
                >
                  {copiedSeo ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-muted leading-relaxed">{seoDescription}</p>
            </div>
          )}

          {/* Feature summaries */}
          {(exteriorFeatures.length > 0 || interiorFeatures.length > 0) && (
            <div className="mt-6 grid grid-cols-2 gap-4">
              {exteriorFeatures.length > 0 && (
                <div className="animate-fade-up bg-surface border border-border rounded-xl p-4">
                  <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-emerald-400 mb-3">Exterior Features</h3>
                  <ul className="space-y-1">
                    {exteriorFeatures.map((f, i) => (
                      <li key={i} className="text-xs text-muted flex gap-2">
                        <span className="text-emerald-400">{'\u2022'}</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {interiorFeatures.length > 0 && (
                <div className="animate-fade-up bg-surface border border-border rounded-xl p-4" style={{ animationDelay: '100ms' }}>
                  <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-violet-400 mb-3">Interior Features</h3>
                  <ul className="space-y-1">
                    {interiorFeatures.map((f, i) => (
                      <li key={i} className="text-xs text-muted flex gap-2">
                        <span className="text-violet-400">{'\u2022'}</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Vehicle specs */}
        <div className="space-y-4">
          <div className="animate-fade-up bg-surface border border-border rounded-xl p-5" style={{ animationDelay: '100ms' }}>
            <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-muted mb-4">Vehicle Details</h3>
            <dl className="space-y-3 text-sm">
              {[
                ['VIN', vehicle.vin],
                ['Stock #', vehicle.stock_no],
                ['Year', vehicle.year],
                ['Make', vehicle.make],
                ['Model', vehicle.model],
                ['Trim', vehicle.trim],
                ['Body', vehicle.body_type],
                ['Engine', vehicle.engine],
                ['Trans', vehicle.transmission],
                ['Drivetrain', vehicle.drivetrain],
                ['Fuel', vehicle.fuel_type],
                ['Ext. Color', vehicle.exterior_color],
                ['Int. Color', vehicle.interior_color],
                ['Mileage', vehicle.miles?.toLocaleString() + ' mi'],
                ['MPG', vehicle.city_mpg && vehicle.highway_mpg ? `${vehicle.city_mpg} / ${vehicle.highway_mpg}` : null],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="animate-fade-up bg-surface border border-border rounded-xl p-5" style={{ animationDelay: '200ms' }}>
            <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-muted mb-4">Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Days on Market</span>
                <span className={`font-medium ${vehicle.dom > 60 ? 'text-danger' : vehicle.dom > 30 ? 'text-accent' : 'text-success'}`}>{vehicle.dom}d</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">1-Owner</span>
                <span className={vehicle.carfax_1_owner ? 'text-success' : 'text-muted-2'}>{vehicle.carfax_1_owner ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Clean Title</span>
                <span className={vehicle.carfax_clean_title ? 'text-success' : 'text-danger'}>{vehicle.carfax_clean_title ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Photos</span>
                <span>{photos.length} total</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Analyzed</span>
                <span className={photos.filter(p => p.analysis).length === photos.length ? 'text-success' : ''}>{photos.filter(p => p.analysis).length}/{photos.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Bannered</span>
                <span className={photos.filter(p => p.banneredUrl).length > 0 ? 'text-accent' : ''}>{photos.filter(p => p.banneredUrl).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Processing</span>
                <span className={savedToCloud ? 'text-success font-medium' : 'text-muted-2'}>
                  {savedToCloud ? 'Saved' : vehicle.photo_status === 'processed' ? 'Processed' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Banner settings preview */}
          {dealer && (
            <div className="animate-fade-up bg-surface border border-border rounded-xl p-5" style={{ animationDelay: '300ms' }}>
              <h3 className="font-[family-name:var(--font-display)] text-sm font-600 text-muted mb-4">Banner Style</h3>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-8 flex items-center justify-center" style={{ backgroundColor: dealer.brand_colors?.primary || '#d4a053' }}>
                  <span className="text-xs font-bold tracking-wider" style={{ color: dealer.brand_colors?.secondary || '#fff' }}>
                    SAMPLE BANNER TEXT
                  </span>
                </div>
                <div className="h-16 bg-surface-2 flex items-center justify-center text-muted-2 text-xs">Photo</div>
                <div className="relative">
                  <div className="h-0.5" style={{ backgroundColor: dealer.brand_colors?.primary || '#d4a053' }} />
                  <div className="h-7 bg-black/80 flex items-center justify-between px-3">
                    <div>
                      <span className="text-[9px] text-white/80 font-bold">{dealer.name.toUpperCase()}</span>
                      {dealer.phone && <span className="text-[8px] ml-2" style={{ color: dealer.brand_colors?.primary || '#d4a053' }}>{dealer.phone}</span>}
                    </div>
                    <span className="text-[8px] font-bold" style={{ color: dealer.brand_colors?.primary || '#d4a053' }}>SHIPS NATIONWIDE</span>
                  </div>
                </div>
              </div>
              <Link href="/settings" className="text-xs text-accent hover:text-accent-light transition-colors mt-3 block">
                Edit branding
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
}

interface PhotoAnalysis {
  classification: string
  confidence: number
  banner_text: string
  features: string[]
  condition_notes?: string
}

interface AnalyzedPhoto {
  url: string
  analysis?: PhotoAnalysis
  analyzing?: boolean
  banneredUrl?: string
  creating?: boolean
}

interface DealerInfo {
  name: string
  logo_url: string | null
  brand_colors: { primary: string; secondary: string }
  phone?: string
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
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [error, setError] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

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
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }

      const data = await res.json()
      setExteriorFeatures(data.exterior_features || [])
      setInteriorFeatures(data.interior_features || [])

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
            logoUrl: dealer.logo_url,
            dealerName: dealer.name,
            phone: '',
          }),
        })

        if (!res.ok) throw new Error('Banner creation failed')

        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        setPhotos(prev => prev.map(p =>
          p.url === photo.url ? { ...p, banneredUrl: blobUrl, creating: false } : p
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
          }),
        })
        if (extRes.ok) {
          const blob = await extRes.blob()
          const blobUrl = URL.createObjectURL(blob)
          setPhotos(prev => [...prev, {
            url: extPhoto.url,
            analysis: { classification: 'exterior_features', confidence: 1, banner_text: 'EXTERIOR FEATURES', features: exteriorFeatures },
            banneredUrl: blobUrl,
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
          }),
        })
        if (intRes.ok) {
          const blob = await intRes.blob()
          const blobUrl = URL.createObjectURL(blob)
          setPhotos(prev => [...prev, {
            url: intPhoto.url,
            analysis: { classification: 'interior_features', confidence: 1, banner_text: 'INTERIOR FEATURES', features: interiorFeatures },
            banneredUrl: blobUrl,
          }])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Banner creation failed')
    } finally {
      setCreatingBanners(false)
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" /></div>
  if (!vehicle) return <div className="text-muted">Vehicle not found</div>

  const selected = photos[selectedPhoto]
  const allAnalyzed = photos.length > 0 && photos.every(p => p.analysis)
  const hasBannered = photos.some(p => p.banneredUrl)

  return (
    <div>
      <div className="animate-fade-up mb-6 flex items-center gap-2 text-sm text-muted">
        <Link href="/inventory" className="hover:text-amber transition-colors">Inventory</Link>
        <span>/</span>
        <span className="text-foreground">{vehicle.heading}</span>
      </div>

      {/* Header + Actions */}
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-700 tracking-tight">
          {vehicle.heading}
        </h1>
        <div className="flex gap-3">
          {!allAnalyzed && (
            <button onClick={handleAnalyze} disabled={processing}
              className="btn-amber px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {processing ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Analyzing {photos.filter(p => !p.analysis).length} photos...</span>
                : `Analyze ${photos.filter(p => !p.analysis).length} Photos`}
            </button>
          )}
          {allAnalyzed && !hasBannered && (
            <button onClick={handleCreateBanners} disabled={creatingBanners}
              className="btn-amber px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {creatingBanners ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Creating Banners...</span>
                : 'Create Banners'}
            </button>
          )}
          {hasBannered && (
            <button onClick={downloadAll}
              className="btn-amber px-5 py-2.5 rounded-lg text-sm font-semibold">
              Download All ({photos.filter(p => p.banneredUrl).length})
            </button>
          )}
        </div>
      </div>

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
                    <div className="w-10 h-10 border-3 border-amber border-t-transparent rounded-full animate-spin" />
                    <span className="text-amber font-medium">AI Analyzing...</span>
                  </div>
                </div>
              )}
              {selected.creating && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-amber border-t-transparent rounded-full animate-spin" />
                    <span className="text-amber font-medium">Creating Banner...</span>
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
                  {/* Banner text preview */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-12 pb-4 px-4">
                    <p className="text-xs text-muted mb-1">Top banner preview:</p>
                    <p className="text-amber-light font-bold tracking-wider">{selected.analysis.banner_text}</p>
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
                  i === selectedPhoto ? 'border-amber' : 'border-border hover:border-border-hover'
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
                    <span className="w-3 h-3 rounded-full bg-amber block" />
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
                  <button onClick={saveEdit} className="btn-amber px-4 py-2 rounded-lg text-sm">Save</button>
                  <button onClick={() => setEditingIdx(null)} className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-foreground">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-amber-glow border border-amber/20 rounded-lg px-4 py-3">
                  <p className="text-amber-light font-bold tracking-wider text-sm">{selected.analysis.banner_text}</p>
                  <button onClick={() => startEdit(selectedPhoto)} className="text-xs text-muted hover:text-amber transition-colors ml-4">Edit</button>
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
                        <span className="text-emerald-400">•</span>{f}
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
                        <span className="text-violet-400">•</span>{f}
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
                <span className={`font-medium ${vehicle.dom > 60 ? 'text-danger' : vehicle.dom > 30 ? 'text-amber' : 'text-success'}`}>{vehicle.dom}d</span>
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
                <span className={photos.filter(p => p.banneredUrl).length > 0 ? 'text-amber' : ''}>{photos.filter(p => p.banneredUrl).length}</span>
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
                    <span className="text-[9px] text-white/80 font-bold">{dealer.name.toUpperCase()}</span>
                    <span className="text-[8px] font-bold" style={{ color: dealer.brand_colors?.primary || '#d4a053' }}>SHIPS NATIONWIDE</span>
                  </div>
                </div>
              </div>
              <Link href="/settings" className="text-xs text-amber hover:text-amber-light transition-colors mt-3 block">
                Edit branding →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

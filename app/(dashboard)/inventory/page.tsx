'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Vehicle {
  id: string
  vin: string
  stock_no: string
  heading: string
  year: number
  make: string
  model: string
  trim: string
  body_type: string
  engine: string
  transmission: string
  drivetrain: string
  exterior_color: string
  interior_color: string
  miles: number
  dom: number
  carfax_1_owner: boolean
  carfax_clean_title: boolean
  photo_urls: string[]
  highway_mpg: number
  city_mpg: number
  photo_status?: string
  processed_at?: string
}

type ViewMode = 'grid' | 'table'
type StatusFilter = 'all' | 'pending' | 'processed'

export default function InventoryPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  const loadInventory = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    setVehicles(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const vehicleArray = Array.isArray(data) ? data : [data]

      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: vehicleArray }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }

      const result = await res.json()
      alert(`Imported ${result.imported} vehicles`)
      loadInventory()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const pendingCount = vehicles.filter(v => !v.photo_status || v.photo_status === 'pending').length
  const processedCount = vehicles.filter(v => v.photo_status === 'processed').length

  const filtered = vehicles.filter(v => {
    // Status filter
    if (statusFilter === 'pending' && v.photo_status === 'processed') return false
    if (statusFilter === 'processed' && v.photo_status !== 'processed') return false

    // Search
    if (!search) return true
    const q = search.toLowerCase()
    return (
      v.heading?.toLowerCase().includes(q) ||
      v.vin?.toLowerCase().includes(q) ||
      v.stock_no?.toLowerCase().includes(q) ||
      v.make?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q)
    )
  })

  function formatMiles(n: number) {
    return n?.toLocaleString() ?? '\u2014'
  }

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: vehicles.length },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'processed', label: 'Processed', count: processedCount },
  ]

  return (
    <div>
      <div className="animate-fade-up flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight">
            Inventory
          </h1>
          <p className="text-muted mt-2">
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} in stock
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-surface border border-border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${viewMode === 'grid' ? 'bg-amber-glow text-amber' : 'text-muted hover:text-foreground'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${viewMode === 'table' ? 'bg-amber-glow text-amber' : 'text-muted hover:text-foreground'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
              </svg>
            </button>
          </div>

          <label className="btn-amber px-5 py-2.5 rounded-lg text-sm cursor-pointer font-semibold">
            {importing ? 'Importing...' : 'Import Feed'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
              disabled={importing}
            />
          </label>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="animate-fade-up flex gap-1 mb-4 bg-surface border border-border rounded-lg p-1 w-fit" style={{ animationDelay: '50ms' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? tab.key === 'processed'
                  ? 'bg-green-500/15 text-green-400'
                  : tab.key === 'pending'
                    ? 'bg-amber-glow text-amber'
                    : 'bg-surface-3 text-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {tab.label}
            <span className={`ml-2 text-xs ${statusFilter === tab.key ? 'opacity-100' : 'opacity-50'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="animate-fade-up mb-6" style={{ animationDelay: '100ms' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-dark w-full max-w-md px-4 py-3 rounded-lg"
          placeholder="Search by name, VIN, stock #..."
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="animate-fade-up bg-surface border border-border rounded-xl p-12 text-center" style={{ animationDelay: '200ms' }}>
          <div className="w-16 h-16 rounded-2xl bg-amber-glow flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-600 mb-2">No Inventory Yet</h2>
          <p className="text-muted text-sm max-w-md mx-auto mb-4">
            Import your DMS feed JSON to see your vehicles here
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="animate-fade-up bg-surface border border-border rounded-xl p-12 text-center">
          <p className="text-muted">No vehicles match your filters</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((v, i) => (
            <Link
              key={v.id}
              href={`/inventory/${v.id}`}
              className="animate-fade-up bg-surface border border-border rounded-xl overflow-hidden hover:border-amber/30 transition-all group"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              {/* Photo */}
              <div className="aspect-[4/3] relative bg-surface-2">
                {v.photo_urls?.[0] ? (
                  <img
                    src={v.photo_urls[0]}
                    alt={v.heading}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-2">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909" />
                    </svg>
                  </div>
                )}
                {/* Photo count badge */}
                {v.photo_urls?.length > 0 && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md">
                    {v.photo_urls.length} photos
                  </div>
                )}
                {/* Processing status badge */}
                <div className="absolute top-2 left-2">
                  {v.photo_status === 'processed' ? (
                    <span className="text-xs px-2 py-1 rounded-md font-medium bg-green-500/80 text-white">
                      Processed
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-md font-medium bg-amber/80 text-black">
                      Pending
                    </span>
                  )}
                </div>
                {/* Days on market */}
                {v.dom > 0 && (
                  <div className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-md font-medium ${
                    v.dom > 60 ? 'bg-red-500/80 text-white' : v.dom > 30 ? 'bg-amber/80 text-black' : 'bg-black/60 text-white'
                  }`}>
                    {v.dom}d
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-sm leading-tight group-hover:text-amber transition-colors">
                  {v.heading}
                </h3>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                  <span>{formatMiles(v.miles)} mi</span>
                  <span className="text-border">|</span>
                  <span>{v.exterior_color}</span>
                  <span className="text-border">|</span>
                  <span>{v.drivetrain}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-2">#{v.stock_no}</span>
                  {v.carfax_1_owner && (
                    <span className="text-xs bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">1-Owner</span>
                  )}
                  {v.carfax_clean_title && (
                    <span className="text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">Clean</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="animate-fade-up bg-surface border border-border rounded-xl overflow-hidden" style={{ animationDelay: '200ms' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-muted font-medium">Vehicle</th>
                  <th className="px-4 py-3 text-muted font-medium">Stock #</th>
                  <th className="px-4 py-3 text-muted font-medium">Color</th>
                  <th className="px-4 py-3 text-muted font-medium text-right">Miles</th>
                  <th className="px-4 py-3 text-muted font-medium">Drivetrain</th>
                  <th className="px-4 py-3 text-muted font-medium text-right">DOM</th>
                  <th className="px-4 py-3 text-muted font-medium text-right">Photos</th>
                  <th className="px-4 py-3 text-muted font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/inventory/${v.id}`} className="hover:text-amber transition-colors font-medium">
                        {v.heading}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{v.stock_no}</td>
                    <td className="px-4 py-3 text-muted">{v.exterior_color}</td>
                    <td className="px-4 py-3 text-right">{formatMiles(v.miles)}</td>
                    <td className="px-4 py-3 text-muted">{v.drivetrain}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={v.dom > 60 ? 'text-danger' : v.dom > 30 ? 'text-amber' : ''}>
                        {v.dom}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{v.photo_urls?.length ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {v.photo_status === 'processed' ? (
                          <span className="text-xs bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded font-medium">Processed</span>
                        ) : (
                          <span className="text-xs bg-amber/15 text-amber px-1.5 py-0.5 rounded font-medium">Pending</span>
                        )}
                        {v.carfax_1_owner && <span className="text-xs bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">1-Owner</span>}
                        {v.carfax_clean_title && <span className="text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">Clean</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

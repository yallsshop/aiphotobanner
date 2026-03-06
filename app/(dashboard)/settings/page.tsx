'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const COLOR_PRESETS = [
  { name: 'Midnight', primary: '#1a1a2e', secondary: '#e8e4df' },
  { name: 'Racing Red', primary: '#c0392b', secondary: '#ffffff' },
  { name: 'Ocean Blue', primary: '#2563eb', secondary: '#ffffff' },
  { name: 'Forest', primary: '#166534', secondary: '#f0fdf4' },
  { name: 'Royal Purple', primary: '#7c3aed', secondary: '#ffffff' },
  { name: 'Sunset', primary: '#ea580c', secondary: '#fff7ed' },
  { name: 'Slate', primary: '#334155', secondary: '#f1f5f9' },
  { name: 'Gold', primary: '#d4a053', secondary: '#0a0a0a' },
]

interface DealerData {
  id: string
  name: string
  phone: string | null
  logo_url: string | null
  brand_colors: { primary: string; secondary: string }
  description_must_haves: string | null
}

export default function SettingsPage() {
  const [dealer, setDealer] = useState<DealerData | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#000000')
  const [secondaryColor, setSecondaryColor] = useState('#ffffff')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [descriptionMustHaves, setDescriptionMustHaves] = useState('')
  const [uploading, setUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const supabase = createClient()

  const loadDealer = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('dealers')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setDealer(data)
      setName(data.name)
      setPhone(data.phone || '')
      setPrimaryColor(data.brand_colors?.primary || '#000000')
      setSecondaryColor(data.brand_colors?.secondary || '#ffffff')
      setDescriptionMustHaves(data.description_must_haves || '')
      setLogoPreview(data.logo_url)
    }
  }, [supabase])

  useEffect(() => {
    loadDealer()
  }, [loadDealer])

  async function handleSave() {
    if (!dealer) return
    setSaving(true)
    setSaved(false)

    await supabase
      .from('dealers')
      .update({
        name,
        phone: phone || null,
        brand_colors: { primary: primaryColor, secondary: secondaryColor },
        description_must_haves: descriptionMustHaves || null,
      })
      .eq('id', dealer.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !dealer) return

    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${dealer.id}/logo.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      console.error('Upload failed:', uploadError)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(path)

    const logoUrl = urlData.publicUrl

    await supabase
      .from('dealers')
      .update({ logo_url: logoUrl })
      .eq('id', dealer.id)

    setLogoPreview(logoUrl)
    setUploading(false)
  }

  if (!dealer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="animate-fade-up mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight">
          Settings
        </h1>
        <p className="text-muted mt-2">Configure your dealership branding</p>
      </div>

      {/* Logo Upload */}
      <section className="animate-fade-up bg-surface border border-border rounded-xl p-6 mb-6" style={{ animationDelay: '100ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-4">Dealership Logo</h2>
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 rounded-xl border-2 border-dashed border-border hover:border-amber/50 transition-colors flex items-center justify-center overflow-hidden bg-surface-2">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <svg className="w-8 h-8 text-muted-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            )}
          </div>
          <div>
            <label className="btn-amber px-5 py-2.5 rounded-lg text-sm cursor-pointer inline-block">
              {uploading ? 'Uploading...' : 'Upload Logo'}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
            <p className="text-xs text-muted-2 mt-2">PNG, JPG, or SVG. Max 2MB.</p>
          </div>
        </div>
      </section>

      {/* Dealership Name */}
      <section className="animate-fade-up bg-surface border border-border rounded-xl p-6 mb-6" style={{ animationDelay: '200ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-4">Dealership Name</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-dark w-full px-4 py-3 rounded-lg"
          placeholder="Premier Auto Group"
        />
      </section>

      {/* Phone Number */}
      <section className="animate-fade-up bg-surface border border-border rounded-xl p-6 mb-6" style={{ animationDelay: '250ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-4">Phone Number</h2>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="input-dark w-full px-4 py-3 rounded-lg"
          placeholder="(555) 123-4567"
        />
        <p className="text-xs text-muted-2 mt-2">Displayed on banner bottom bar instead of logo</p>
      </section>

      {/* Description Must-Haves */}
      <section className="animate-fade-up bg-surface border border-border rounded-xl p-6 mb-6" style={{ animationDelay: '275ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-2">Description Must-Haves</h2>
        <p className="text-xs text-muted-2 mb-4">Text that will be included in every AI-generated SEO description. Add your dealership tagline, warranty info, shipping policy, or any standard copy you want in all vehicle listings.</p>
        <textarea
          value={descriptionMustHaves}
          onChange={(e) => setDescriptionMustHaves(e.target.value)}
          className="input-dark w-full px-4 py-3 rounded-lg resize-y min-h-[100px]"
          placeholder="e.g. All vehicles come with a complimentary 3-month warranty. We offer nationwide shipping and easy financing options. Visit our showroom at 123 Main St."
          rows={4}
        />
      </section>

      {/* Brand Colors */}
      <section className="animate-fade-up bg-surface border border-border rounded-xl p-6 mb-6" style={{ animationDelay: '300ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-4">Brand Colors</h2>

        {/* Presets */}
        <div className="mb-6">
          <p className="text-sm text-muted mb-3">Quick presets</p>
          <div className="flex flex-wrap gap-3">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  setPrimaryColor(preset.primary)
                  setSecondaryColor(preset.secondary)
                }}
                className="color-swatch group flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-amber/30 bg-surface-2"
                title={preset.name}
              >
                <div className="flex -space-x-1">
                  <div
                    className="w-5 h-5 rounded-full border border-border"
                    style={{ backgroundColor: preset.primary }}
                  />
                  <div
                    className="w-5 h-5 rounded-full border border-border"
                    style={{ backgroundColor: preset.secondary }}
                  />
                </div>
                <span className="text-xs text-muted group-hover:text-foreground transition-colors">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted mb-2">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="input-dark flex-1 px-3 py-2 rounded-lg text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-2">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="input-dark flex-1 px-3 py-2 rounded-lg text-sm font-mono"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6">
          <p className="text-sm text-muted mb-3">Banner preview</p>
          <div className="rounded-xl overflow-hidden border border-border">
            <div
              className="h-12 flex items-center px-4 gap-3"
              style={{ backgroundColor: primaryColor }}
            >
              {logoPreview && (
                <img src={logoPreview} alt="" className="w-7 h-7 object-contain" />
              )}
              <span className="text-sm font-semibold" style={{ color: secondaryColor }}>
                {name || 'Dealership Name'} — CERTIFIED PRE-OWNED
              </span>
            </div>
            <div className="bg-surface-2 h-40 flex items-center justify-center text-muted-2 text-sm">
              Vehicle Photo Area
            </div>
            <div
              className="h-10 flex items-center px-4"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="text-xs font-medium" style={{ color: secondaryColor }}>
                LEATHER | SUNROOF | BACKUP CAMERA | LOW MILES
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="animate-fade-up flex items-center gap-4" style={{ animationDelay: '400ms' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-amber px-8 py-3 rounded-lg text-base font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && (
          <span className="text-success text-sm animate-fade-up">
            Settings saved successfully
          </span>
        )}
      </div>
    </div>
  )
}

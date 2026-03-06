'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

interface AnalysisResult {
  classification: string
  confidence: number
  features: string[]
  banner_text: string
  color?: string
  condition_notes?: string
}

interface PhotoItem {
  file: File
  preview: string
  analysis?: AnalysisResult
  analyzing?: boolean
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPhotos = acceptedFiles.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
    }))
    setPhotos(prev => [...prev, ...newPhotos])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxSize: 10 * 1024 * 1024,
  })

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleProcess() {
    const unanalyzed = photos.filter(p => !p.analysis)
    if (!unanalyzed.length) return

    setProcessing(true)
    setError('')

    // Mark all as analyzing
    setPhotos(prev => prev.map(p =>
      !p.analysis ? { ...p, analyzing: true } : p
    ))

    try {
      // Process in batches of 5
      for (let i = 0; i < unanalyzed.length; i += 5) {
        const batch = unanalyzed.slice(i, i + 5)
        const images = await Promise.all(
          batch.map(async (p) => ({
            data: await fileToBase64(p.file),
            mimeType: p.file.type || 'image/jpeg',
            name: p.file.name,
          }))
        )

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Analysis failed')
        }

        const { results } = await res.json()

        // Update photos with results
        setPhotos(prev => prev.map(p => {
          const result = results.find((r: { name: string; analysis: AnalysisResult }) => r.name === p.file.name)
          if (result) {
            return { ...p, analysis: result.analysis, analyzing: false }
          }
          return p
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setPhotos(prev => prev.map(p => ({ ...p, analyzing: false })))
    } finally {
      setProcessing(false)
    }
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].preview)
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const classificationColors: Record<string, string> = {
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
    other: 'bg-gray-500/20 text-gray-400',
  }

  return (
    <div>
      <div className="animate-fade-up mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight">
          Photos
        </h1>
        <p className="text-muted mt-2">Upload vehicle photos for AI processing</p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`animate-fade-up border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-amber bg-amber-glow'
            : 'border-border hover:border-amber/30 hover:bg-surface'
        }`}
        style={{ animationDelay: '100ms' }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-glow flex items-center justify-center">
            <svg className="w-8 h-8 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium">
              {isDragActive ? 'Drop photos here' : 'Drag & drop vehicle photos'}
            </p>
            <p className="text-sm text-muted mt-1">or click to browse. JPG, PNG, WebP up to 10MB</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-danger text-sm bg-danger/10 px-4 py-3 rounded-lg border border-danger/20">
          {error}
        </div>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-600">
              {photos.length} photo{photos.length !== 1 ? 's' : ''}
              {photos.filter(p => p.analysis).length > 0 && (
                <span className="text-muted font-400 ml-2">
                  ({photos.filter(p => p.analysis).length} analyzed)
                </span>
              )}
            </h2>
            <button
              onClick={handleProcess}
              disabled={processing || photos.every(p => !!p.analysis)}
              className="btn-amber px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Analyzing...
                </span>
              ) : photos.every(p => !!p.analysis) ? (
                'All Analyzed'
              ) : (
                `Process with AI (${photos.filter(p => !p.analysis).length})`
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map((photo, i) => (
              <div
                key={i}
                className="animate-fade-up bg-surface border border-border rounded-xl overflow-hidden group"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Image */}
                <div className="aspect-[4/3] relative">
                  <img src={photo.preview} alt={photo.file.name} className="w-full h-full object-cover" />

                  {/* Analyzing overlay */}
                  {photo.analyzing && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-amber">Analyzing...</span>
                      </div>
                    </div>
                  )}

                  {/* Classification badge */}
                  {photo.analysis && (
                    <div className="absolute top-2 left-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${classificationColors[photo.analysis.classification] || classificationColors.other}`}>
                        {photo.analysis.classification.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Confidence badge */}
                  {photo.analysis && (
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-black/60 text-white">
                        {Math.round(photo.analysis.confidence * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-danger/80 text-white p-1.5 rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Analysis results */}
                {photo.analysis ? (
                  <div className="p-4 space-y-3">
                    {/* Banner text */}
                    <div className="bg-amber-glow border border-amber/20 rounded-lg px-3 py-2">
                      <p className="text-xs text-amber-light font-semibold tracking-wide">
                        {photo.analysis.banner_text}
                      </p>
                    </div>

                    {/* Features */}
                    <div className="flex flex-wrap gap-1.5">
                      {photo.analysis.features.slice(0, 6).map((feat, j) => (
                        <span key={j} className="px-2 py-0.5 rounded text-xs bg-surface-3 text-muted">
                          {feat}
                        </span>
                      ))}
                      {photo.analysis.features.length > 6 && (
                        <span className="px-2 py-0.5 rounded text-xs bg-surface-3 text-muted-2">
                          +{photo.analysis.features.length - 6} more
                        </span>
                      )}
                    </div>

                    {/* Color */}
                    {photo.analysis.color && (
                      <p className="text-xs text-muted">
                        Color: <span className="text-foreground">{photo.analysis.color}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3">
                    <p className="text-xs text-muted-2 truncate">{photo.file.name}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

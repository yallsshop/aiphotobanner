export default function TemplatesPage() {
  return (
    <div>
      <div className="animate-fade-up mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight">
          Templates
        </h1>
        <p className="text-muted mt-2">Banner templates will be available in Phase 3</p>
      </div>

      <div className="animate-fade-up bg-surface border border-border rounded-xl p-12 text-center" style={{ animationDelay: '100ms' }}>
        <div className="w-16 h-16 rounded-2xl bg-accent-glow flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
          </svg>
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-600 mb-2">Coming Soon</h2>
        <p className="text-muted text-sm max-w-md mx-auto">
          Choose from preset banner styles with font, color, and position customization. Set up your branding first in Settings.
        </p>
      </div>
    </div>
  )
}

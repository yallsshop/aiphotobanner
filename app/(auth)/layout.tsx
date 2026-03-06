export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-surface items-center justify-center">
        {/* Ambient gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-glow via-transparent to-transparent" />
        <div className="absolute bottom-0 right-0 w-2/3 h-2/3 bg-gradient-to-tl from-amber-glow via-transparent to-transparent opacity-50" />

        {/* Decorative grid lines */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(var(--amber) 1px, transparent 1px), linear-gradient(90deg, var(--amber) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />

        <div className="relative z-10 px-16 max-w-lg">
          <div className="mb-8">
            <div className="paint-shimmer w-12 h-12 rounded-lg mb-6" />
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-800 tracking-tight leading-tight">
              AI Photo
              <br />
              <span className="text-amber">Banner</span>
            </h1>
          </div>
          <p className="text-muted text-lg leading-relaxed">
            Professional AI-labeled photo banners for your entire inventory.
            Minutes, not hours.
          </p>

          {/* Feature pills */}
          <div className="mt-12 flex flex-wrap gap-3">
            {['AI Vision', 'Auto Labels', 'Brand Colors', 'Bulk Export'].map((feat, i) => (
              <span
                key={feat}
                className="animate-fade-up px-4 py-2 rounded-full text-sm border border-border text-muted"
                style={{ animationDelay: `${i * 100 + 400}ms` }}
              >
                {feat}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 bg-background">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}

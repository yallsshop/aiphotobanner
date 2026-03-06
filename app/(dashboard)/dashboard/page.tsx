import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: dealer } = await supabase
    .from('dealers')
    .select('*')
    .eq('user_id', user!.id)
    .single()

  return (
    <div>
      <div className="animate-fade-up mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight">
          Welcome back, <span className="text-amber">{dealer?.name || 'Dealer'}</span>
        </h1>
        <p className="text-muted mt-2">Here&apos;s your inventory overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Photos Processed', value: '0', sub: 'No photos yet' },
          { label: 'Banners Created', value: '0', sub: 'Upload to get started' },
          { label: 'Active Batches', value: '0', sub: 'Create your first batch' },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="animate-fade-up bg-surface border border-border rounded-xl p-6 hover:border-border-hover transition-colors"
            style={{ animationDelay: `${i * 100 + 100}ms` }}
          >
            <p className="text-sm text-muted mb-1">{stat.label}</p>
            <p className="font-[family-name:var(--font-display)] text-3xl font-700">{stat.value}</p>
            <p className="text-xs text-muted-2 mt-2">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="animate-fade-up" style={{ animationDelay: '400ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/photos"
            className="group bg-surface border border-border rounded-xl p-6 hover:border-amber/30 hover:bg-amber-glow transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-glow flex items-center justify-center">
                <svg className="w-6 h-6 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="font-medium group-hover:text-amber transition-colors">Upload Photos</p>
                <p className="text-sm text-muted">Drag & drop vehicle photos for AI processing</p>
              </div>
            </div>
          </a>

          <a
            href="/settings"
            className="group bg-surface border border-border rounded-xl p-6 hover:border-amber/30 hover:bg-amber-glow transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-glow flex items-center justify-center">
                <svg className="w-6 h-6 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                </svg>
              </div>
              <div>
                <p className="font-medium group-hover:text-amber transition-colors">Set Up Branding</p>
                <p className="text-sm text-muted">Upload logo and configure brand colors</p>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}

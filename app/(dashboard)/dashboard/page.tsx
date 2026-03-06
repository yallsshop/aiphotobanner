import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: dealer } = await supabase
    .from('dealers')
    .select('*')
    .eq('user_id', user!.id)
    .single()

  // Get inventory stats
  const { data: inventory } = await supabase
    .from('inventory')
    .select('id, photo_status, photo_urls')
    .eq('status', 'active')

  const totalVehicles = inventory?.length ?? 0
  const processedVehicles = inventory?.filter(v => v.photo_status === 'processed').length ?? 0
  const pendingVehicles = totalVehicles - processedVehicles
  const totalPhotos = inventory?.reduce((sum, v) => sum + (v.photo_urls?.length ?? 0), 0) ?? 0

  return (
    <div>
      <div className="animate-fade-up mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight">
          Welcome back, <span className="text-amber">{dealer?.name || 'Dealer'}</span>
        </h1>
        <p className="text-muted mt-2">Here&apos;s your inventory overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Vehicles', value: totalVehicles.toString(), sub: `${totalPhotos} photos total`, color: '' },
          { label: 'Pending', value: pendingVehicles.toString(), sub: pendingVehicles > 0 ? 'Ready to process' : 'All caught up', color: pendingVehicles > 0 ? 'text-amber' : '' },
          { label: 'Processed', value: processedVehicles.toString(), sub: processedVehicles > 0 ? 'Banners created' : 'None yet', color: processedVehicles > 0 ? 'text-green-400' : '' },
          { label: 'Completion', value: totalVehicles > 0 ? `${Math.round((processedVehicles / totalVehicles) * 100)}%` : '0%', sub: `${processedVehicles}/${totalVehicles} vehicles`, color: '' },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="animate-fade-up bg-surface border border-border rounded-xl p-6 hover:border-border-hover transition-colors"
            style={{ animationDelay: `${i * 100 + 100}ms` }}
          >
            <p className="text-sm text-muted mb-1">{stat.label}</p>
            <p className={`font-[family-name:var(--font-display)] text-3xl font-700 ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-2 mt-2">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="animate-fade-up" style={{ animationDelay: '400ms' }}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-600 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/inventory?status=pending"
            className="group bg-surface border border-border rounded-xl p-6 hover:border-amber/30 hover:bg-amber-glow transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-glow flex items-center justify-center">
                <svg className="w-6 h-6 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                </svg>
              </div>
              <div>
                <p className="font-medium group-hover:text-amber transition-colors">Process Pending</p>
                <p className="text-sm text-muted">{pendingVehicles} vehicle{pendingVehicles !== 1 ? 's' : ''} waiting</p>
              </div>
            </div>
          </Link>

          <Link
            href="/inventory"
            className="group bg-surface border border-border rounded-xl p-6 hover:border-amber/30 hover:bg-amber-glow transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-glow flex items-center justify-center">
                <svg className="w-6 h-6 text-amber" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
              </div>
              <div>
                <p className="font-medium group-hover:text-amber transition-colors">View Inventory</p>
                <p className="text-sm text-muted">{totalVehicles} vehicle{totalVehicles !== 1 ? 's' : ''} in stock</p>
              </div>
            </div>
          </Link>

          <Link
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
                <p className="font-medium group-hover:text-amber transition-colors">Branding Settings</p>
                <p className="text-sm text-muted">Colors, logo, phone number</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

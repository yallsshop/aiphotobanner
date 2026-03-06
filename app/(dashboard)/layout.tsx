import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch dealer profile
  const { data: dealer } = await supabase
    .from('dealers')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar
        dealerName={dealer?.name || 'My Dealership'}
        dealerEmail={user.email || ''}
        logoUrl={dealer?.logo_url}
      />
      <main className="flex-1 ml-64">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}

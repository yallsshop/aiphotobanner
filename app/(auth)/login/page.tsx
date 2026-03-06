'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden mb-10">
        <div className="paint-shimmer w-10 h-10 rounded-lg mb-4" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-800 tracking-tight">
          AI Photo <span className="text-amber">Banner</span>
        </h1>
      </div>

      <div className="animate-fade-up">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-700 mb-2 tracking-tight">
          Welcome back
        </h2>
        <p className="text-muted mb-8">
          Sign in to your dealer account
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <label className="block text-sm font-medium text-muted mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-dark w-full px-4 py-3 rounded-lg text-base"
            placeholder="dealer@example.com"
            required
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <label className="block text-sm font-medium text-muted mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-dark w-full px-4 py-3 rounded-lg text-base"
            placeholder="Enter your password"
            required
          />
        </div>

        {error && (
          <div className="text-danger text-sm bg-danger/10 px-4 py-3 rounded-lg border border-danger/20">
            {error}
          </div>
        )}

        <div className="animate-fade-up" style={{ animationDelay: '300ms' }}>
          <button
            type="submit"
            disabled={loading}
            className="btn-amber w-full py-3.5 rounded-lg text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>

      <p className="mt-8 text-center text-muted text-sm animate-fade-up" style={{ animationDelay: '400ms' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-amber hover:text-amber-light transition-colors">
          Create one
        </Link>
      </p>
    </div>
  )
}

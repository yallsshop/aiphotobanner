'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [dealershipName, setDealershipName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()

    // Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { dealership_name: dealershipName },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Dealer record is auto-created by database trigger
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden mb-10">
        <div className="gradient-shimmer w-10 h-10 rounded-lg mb-4" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-800 tracking-tight">
          AI Photo <span className="text-accent">Banner</span>
        </h1>
      </div>

      <div className="animate-fade-up">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-700 mb-2 tracking-tight">
          Get started
        </h2>
        <p className="text-muted mb-8">
          Create your dealer account in seconds
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-5">
        <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <label className="block text-sm font-medium text-muted mb-2">Dealership Name</label>
          <input
            type="text"
            value={dealershipName}
            onChange={(e) => setDealershipName(e.target.value)}
            className="input-dark w-full px-4 py-3 rounded-lg text-base"
            placeholder="Premier Auto Group"
            required
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
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

        <div className="animate-fade-up" style={{ animationDelay: '300ms' }}>
          <label className="block text-sm font-medium text-muted mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-dark w-full px-4 py-3 rounded-lg text-base"
            placeholder="Min 6 characters"
            minLength={6}
            required
          />
        </div>

        {error && (
          <div className="text-danger text-sm bg-danger/10 px-4 py-3 rounded-lg border border-danger/20">
            {error}
          </div>
        )}

        <div className="animate-fade-up" style={{ animationDelay: '400ms' }}>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5 rounded-lg text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </div>
      </form>

      <p className="mt-8 text-center text-muted text-sm animate-fade-up" style={{ animationDelay: '500ms' }}>
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:text-accent-light transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}

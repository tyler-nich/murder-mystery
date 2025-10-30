'use client'
import { supabase } from '@/lib/supabaseClient'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)

  // Check for active session
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data?.user)
    }
    getUser()
  }, [])

  useEffect(() => {
    if (user) router.push('/')
  }, [user])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Check your email for a magic link!')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1 className="text-3xl font-bold">🔑 Murder Mystery Login</h1>

      <form onSubmit={handleLogin} className="flex flex-col gap-3 w-80">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded p-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white rounded p-2 hover:bg-blue-700"
        >
          {loading ? 'Sending Magic Link...' : 'Send Magic Link'}
        </button>
      </form>

      {message && <p className="text-gray-600 text-center">{message}</p>}
    </div>
  )
}

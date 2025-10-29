'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function CreateGamePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generateCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    return Array.from({ length: 4 }, () =>
      letters[Math.floor(Math.random() * letters.length)]
    ).join('')
  }

  const handleCreateGame = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const code = generateCode()

    try {
      // 1️⃣ Create game and store host
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .insert([{ code, host_email: email }])
        .select()
        .single()

      if (gameError || !gameData) throw gameError

      // 2️⃣ Add host player to players table
      const { error: playerError } = await supabase.from('players').insert([
        {
          name,
          email,
          game_id: gameData.id,
          is_murderer: false,
          is_dead: false,
        },
      ])

      if (playerError) throw playerError

      console.log(`🧩 Game created with code: ${gameData.code} by ${name}`)

      // 3️⃣ Redirect to lobby with game code
      router.push(`/lobby?code=${gameData.code}`)
    } catch (err) {
      console.error('Error creating game:', err)
      setError('Failed to create game. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold mb-2">Create a New Game</h1>
      <p className="text-gray-600 max-w-md">
        Enter your name and email to host a game and generate a unique code to share with friends.
      </p>

      <form onSubmit={handleCreateGame} className="flex flex-col gap-3 w-full max-w-sm text-left">
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border p-2 rounded"
          required
        />

        <input
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 rounded"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition"
        >
          {loading ? 'Creating...' : 'Create Game'}
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">{error}</p>}
    </main>
  )
}

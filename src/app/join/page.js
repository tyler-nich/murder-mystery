'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function JoinGamePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [gameCode, setGameCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const code = gameCode.trim().toUpperCase()

    // 1️⃣ Find the game by code
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, code')
      .eq('code', code)
      .single()

    if (gameError || !game) {
      setError('Game not found. Check the code and try again.')
      setLoading(false)
      return
    }

    // 2️⃣ Add player to the game
    const { error: playerError } = await supabase.from('players').insert([
      {
        name,
        email,
        game_id: game.id,
        is_dead: false,
        is_murderer: false,
      },
    ])

    if (playerError) {
      setError('Error joining game.')
      setLoading(false)
      return
    }

    setLoading(false)
    console.log(`🧩 Player "${name}" joined game ${game.code}`)

    // 3️⃣ Redirect to lobby
    router.push(`/lobby?code=${game.code}`)
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold mb-2">Join Game</h1>
      <p className="text-gray-600 max-w-md">
        Enter your name, email, and the game code to join the fun.
      </p>

      <form
        onSubmit={handleJoin}
        className="flex flex-col gap-3 w-full max-w-sm text-left"
      >
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

        <input
          type="text"
          placeholder="Game Code"
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value)}
          className="border p-2 rounded uppercase"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900"
        >
          {loading ? 'Joining...' : 'Join Game'}
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">{error}</p>}
    </main>
  )
}

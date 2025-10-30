'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function MurderPage() {
  const router = useRouter()
  const { gameCode, playerId } = useParams()

  const [player, setPlayer] = useState(null)
  const [game, setGame] = useState(null)
  const [method, setMethod] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      // Fetch game info
      const { data: gameData } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .single()
      setGame(gameData)

      // Fetch player info
      const { data: playerData } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single()
      setPlayer(playerData)
      setLoading(false)
    }

    loadData()
  }, [gameCode, playerId])

  const handleKill = async () => {
    if (!method.trim()) {
      alert('You must describe your method of death!')
      return
    }

    setSubmitting(true)

    try {
      // 1️⃣ Mark player as dead
      const { error: playerError } = await supabase
        .from('players')
        .update({ is_dead: true })
        .eq('id', playerId)

      if (playerError) throw playerError

      // 2️⃣ Log event
      const { error: eventError } = await supabase.from('game_events').insert({
        game_id: game.id,
        victim_id: player.id,
        type: 'kill',
        details: method,
      })

      if (eventError) throw eventError

      // 3️⃣ Redirect back to game page
      router.push(`/game/${gameCode}`)
    } catch (err) {
      console.error('❌ Kill action failed:', err)
      alert('Failed to complete the kill. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-center text-white p-8">Loading...</p>

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <button
        onClick={() => router.push(`/game/${gameCode}`)}
        className="absolute top-6 left-6 text-gray-400 hover:text-white transition"
      >
        ← Back to Game
      </button>

      <h1 className="text-3xl font-bold mb-6">Kill {player?.name}</h1>

      <textarea
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        placeholder="Describe your method of death..."
        className="w-full max-w-md h-32 p-4 rounded bg-gray-900 border border-gray-700 text-white mb-6 focus:outline-none focus:ring-2 focus:ring-red-600"
      />

      <button
        onClick={handleKill}
        disabled={submitting}
        className={`bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded text-lg font-semibold transition ${
          submitting ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {submitting ? 'Executing...' : `Kill ${player?.name}`}
      </button>
    </main>
  )
}

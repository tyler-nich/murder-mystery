'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function LobbyPage() {
  const router = useRouter()
  const params = useParams()
  const { gameCode } = params

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch current players for a game
  const fetchPlayers = async (gameId) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)

    if (error) {
      console.error('Failed to fetch players:', error)
      return []
    }
    return data
  }

  useEffect(() => {
    let channel
    const fetchUserAndGame = async () => {
      // 1️⃣ Get current user
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) return router.push('/')

      setUser(userData.user)

      // 2️⃣ Get game by code
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .single()
      if (gameError || !gameData) return router.push('/home')

      setGame(gameData)

      // 3️⃣ Get initial players
      const initialPlayers = await fetchPlayers(gameData.id)
      setPlayers(initialPlayers)
      setLoading(false)

      // 4️⃣ Setup realtime subscription for this game
      channel = supabase
        .channel(`players-game-${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameData.id}` },
          (payload) => {
            setPlayers((prev) => {
              switch (payload.eventType) {
                case 'INSERT':
                  return [...prev, payload.new]
                case 'UPDATE':
                  return prev.map((p) => (p.id === payload.new.id ? payload.new : p))
                case 'DELETE':
                  return prev.filter((p) => p.id !== payload.old.id)
                default:
                  return prev
              }
            })
          }
        )
        .subscribe()
    }

    fetchUserAndGame()

    // cleanup subscription on unmount
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [gameCode, router])

  const handleStartGame = async () => {
    if (!game) return
    await supabase.from('games').update({ status: 'started' }).eq('id', game.id)
    alert('Game started!') // placeholder for now
  }

  if (loading) return <p className="p-4">Loading lobby...</p>

  const isHost = user?.id === game?.host_id

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <button
        onClick={() => router.push('/home')}
        className="mb-4 text-blue-600 hover:underline"
      >
        ← Home
      </button>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Game Code: {game.code}</h1>
        <p className="text-gray-600">{players.length} players</p>
      </div>

      {isHost && (
        <button
          onClick={handleStartGame}
          className="mb-6 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          Start Game
        </button>
      )}

      <ul className="border rounded p-4 space-y-2">
        {players.map((p) => (
          <li key={p.id} className="flex justify-between">
            <span className={p.is_dead ? 'line-through text-gray-400' : ''}>{p.name}</span>
            {p.is_host && <span className="text-sm text-blue-600">(host)</span>}
          </li>
        ))}
      </ul>
    </main>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const { gameCode } = params

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  const [murderTarget, setMurderTarget] = useState('')
  const [method, setMethod] = useState('')

  // Fetch players for a game
  const fetchPlayers = async (gameId) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)

    if (error) console.error('Failed to fetch players:', error)
    return data || []
  }

  useEffect(() => {
    let channel
    const initGame = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) return router.push('/')

      setUser(userData.user)

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .single()

      if (gameError || !gameData) return router.push('/home')

      setGame(gameData)

      // Initial players fetch
      const initialPlayers = await fetchPlayers(gameData.id)
      setPlayers(initialPlayers)
      setLoading(false)

      // Realtime subscription for players
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

      // Redirect to game if lobby is still showing (optional if someone re-enters)
      if (gameData.status !== 'started') {
        const { data: sub } = supabase
          .channel(`games-status-${gameData.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
            (payload) => {
              if (payload.new.status === 'started') router.refresh() // refresh to show game
            }
          )
          .subscribe()
      }
    }

    initGame()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [gameCode, router])

  const handleMurder = async () => {
    if (!murderTarget || !method) return alert('Select a player and method!')
    if (!game) return

    const targetPlayer = players.find((p) => p.id === murderTarget)
    if (!targetPlayer) return alert('Invalid target')

    // Update the victim as dead
    await supabase
      .from('players')
      .update({ is_dead: true })
      .eq('id', targetPlayer.id)

    console.log(`💀 ${targetPlayer.name} was murdered by ${user.name || 'Murderer'} via ${method}`)

    setMurderTarget('')
    setMethod('')
  }

  if (loading) return <p className="p-4">Loading game...</p>

  const currentPlayer = players.find((p) => p.user_id === user.id)
  const isMurderer = currentPlayer?.id === game?.murderer_id

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <button
        onClick={() => router.push('/home')}
        className="mb-4 text-blue-600 hover:underline"
      >
        ← Home
      </button>

      <h1 className="text-2xl font-bold mb-4">Game: {game.code}</h1>

      <ul className="border rounded p-4 mb-6 space-y-2">
        {players.map((p) => (
          <li key={p.id} className={p.is_dead ? 'line-through text-gray-400 flex justify-between' : 'flex justify-between'}>
            <span>{p.name}</span>
            {p.is_host && <span className="text-sm text-blue-600">(host)</span>}
          </li>
        ))}
      </ul>

      {isMurderer && (
        <div className="border p-4 rounded space-y-4">
          <h2 className="text-lg font-semibold">You are the murderer! 🔪</h2>

          <select
            value={murderTarget}
            onChange={(e) => setMurderTarget(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select a player</option>
            {players
              .filter((p) => !p.is_dead && p.id !== currentPlayer.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>

          <input
            type="text"
            placeholder="Method of death"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />

          <button
            onClick={handleMurder}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 w-full"
          >
            Murder!
          </button>
        </div>
      )}

      {!isMurderer && <p className="text-gray-600">Waiting for the murderer to act...</p>}
    </main>
  )
}

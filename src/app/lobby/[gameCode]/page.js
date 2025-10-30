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
  const { gameCode } = useParams()

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  // 🧩 Helper to fetch players
  const fetchPlayers = async (gameId) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
    if (error) {
      console.error('Failed to fetch players:', error)
      return []
    }
    return data || []
  }

  // 1️⃣ Initial load: user + game + initial players
  useEffect(() => {
    const initLobby = async () => {
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

      const initialPlayers = await fetchPlayers(gameData.id)
      setPlayers(initialPlayers)
      setLoading(false)
    }

    initLobby()
  }, [gameCode, router])

  // 2️⃣ Subscribe to realtime updates (runs after `game` is loaded)
  useEffect(() => {
    if (!game?.id) return

    console.log('🔗 Subscribing to realtime for game:', game.id)

    const playersChannel = supabase
      .channel(`players-game-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          setPlayers((prev) => {
            switch (payload.eventType) {
              case 'INSERT':
                return [...prev, payload.new]
              case 'UPDATE':
                return prev.map((p) =>
                  p.id === payload.new.id ? payload.new : p
                )
              case 'DELETE':
                return prev.filter((p) => p.id !== payload.old.id)
              default:
                return prev
            }
          })
        }
      )
      .subscribe((status) =>
        console.log('🧩 Players channel subscription:', status)
      )

    const gameChannel = supabase
      .channel(`game-status-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          console.log('📡 Game status update received:', payload)
          if (payload.new.status === 'started') {
            console.log('🚀 Redirecting to game page...')
            router.push(`/game/${payload.new.code}`)
          }
        }
      )
      .subscribe((status) =>
        console.log('🧩 Game channel subscription:', status)
      )

    // ✅ Cleanup on unmount or when game changes
    return () => {
      console.log('🧹 Cleaning up channels...')
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(gameChannel)
    }
  }, [game, router])

  const handleStartGame = async () => {
    if (!game) return;

    // 1️⃣ Fetch all players
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', game.id);

    if (playersError || !playersData?.length) {
      console.error('No players found', playersError);
      return;
    }

    // 2️⃣ Pick a random murderer
    const randomIndex = Math.floor(Math.random() * playersData.length);
    const murderer = playersData[randomIndex];

    // 3️⃣ Update murderer in players table
    const { error: murdererError } = await supabase
      .from('players')
      .update({ is_murderer: true })
      .eq('id', murderer.id);

    if (murdererError) {
      console.error('Failed to assign murderer:', murdererError);
      return;
    }

    // 4️⃣ Update game status
    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'started', started_at: new Date().toISOString() })
      .eq('id', game.id);

    if (gameError) {
      console.error('Failed to start game:', gameError);
      return;
    }

    // 5️⃣ Redirect host immediately to the game page
    router.push(`/game/${game.code}`);
  };


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
            <span
              className={p.is_dead ? 'line-through text-gray-400' : ''}
            >
              {p.name}
            </span>
            {p.is_host && <span className="text-sm text-blue-600">(host)</span>}
          </li>
        ))}
      </ul>
    </main>
  )
}

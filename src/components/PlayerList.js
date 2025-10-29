'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function PlayerList({ gameCode, currentPlayer }) {
  const [players, setPlayers] = useState([])
  const [gameId, setGameId] = useState(null)
  const [hostEmail, setHostEmail] = useState(null)
  const [gameStatus, setGameStatus] = useState('waiting')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!gameCode) return

    const fetchData = async () => {
      // 1️⃣ Fetch game info
      const { data: game } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .single()

      if (!game) return
      setGameId(game.id)
      setHostEmail(game.host_email)
      setGameStatus(game.status)

      // 2️⃣ Fetch players
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)

      setPlayers(playersData)
    }

    fetchData()

    // 3️⃣ Realtime updates
    const channel = supabase
      .channel('players-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        async () => {
          await fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode])

  // Start game logic (host only)
  const startGame = async () => {
    if (!gameId) return
    setLoading(true)

    try {
      // Fetch all players
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)

      if (!playersData || playersData.length === 0) return

      // Randomly pick a murderer
      const murderer = playersData[Math.floor(Math.random() * playersData.length)]

      // Update murderer
      await supabase
        .from('players')
        .update({ is_murderer: true })
        .eq('id', murderer.id)

      // Update game status
      await supabase
        .from('games')
        .update({ status: 'in_progress' })
        .eq('id', gameId)

      console.log(`Game started! ${murderer.name} is the murderer.`)
      setGameStatus('in_progress')
    } catch (err) {
      console.error('Error starting game:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold mb-2">Players in Game {gameCode}</h2>

      {/* Start Game button visible only to host and if game is waiting */}
      {currentPlayer?.email === hostEmail && gameStatus === 'waiting' && (
        <button
          onClick={startGame}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mb-4"
        >
          {loading ? 'Starting...' : 'Start Game'}
        </button>
      )}

      <div className="flex flex-col gap-2">
        {players.length === 0 && <p>No players yet...</p>}
        {players.map((player) => (
          <div
            key={player.id}
            className={`p-2 rounded border ${
              player.is_dead
                ? 'bg-gray-300 text-gray-600'
                : player.is_murderer
                ? 'bg-red-100 border-red-400'
                : 'bg-green-100'
            }`}
          >
            {player.name}{' '}
            {player.email === hostEmail && <span className="text-blue-600">(host)</span>}
            {player.is_murderer && <span className="text-red-600"> 🩸 Murderer</span>}
            {player.is_dead && ' 💀'}
          </div>
        ))}
      </div>
    </div>
  )
}

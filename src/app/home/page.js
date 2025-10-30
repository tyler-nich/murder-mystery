'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Component for Create Game
function CreateGame({ user }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generateGameCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

const handleCreateGame = async () => {
  if (!user) return
  setLoading(true)
  setError('')

  try {
    const gameCode = generateGameCode()
    const hostName = localStorage.getItem('playerName') || 'Host'

    console.log('Creating game with code:', gameCode)

    // 1️⃣ Insert game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert([
        {
          code: gameCode,
          host_id: user.id,
          host_name: hostName,
          status: 'waiting',
        },
      ])
      .select()
      .single()

    if (gameError) {
      console.error('Game insert failed:', gameError)
      throw gameError
    }

    console.log('Game created:', game)

    // 2️⃣ Insert host into players table
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert([
        {
          game_id: game.id,
          user_id: user.id,
          name: hostName,
          email: user.email,
          is_host: true,
          is_dead: false, // <-- use your actual column
        },
      ])
      .select()
      .single()

    if (playerError) {
      console.error('Player insert failed:', playerError)
      throw playerError
    }

    console.log('Host player added:', player)

    // 3️⃣ Redirect to lobby
    router.push(`/lobby/${gameCode}`)
  } catch (err) {
    console.error('CreateGame error:', err)
    setError(err.message || 'Failed to create game.')
  } finally {
    setLoading(false)
  }
}



  return (
    <div className="flex flex-col items-center w-full gap-4">
      <button
        onClick={handleCreateGame}
        disabled={loading}
        className="bg-red-600 text-white px-8 py-4 text-lg rounded hover:bg-red-700 transition w-3/4"
      >
        {loading ? 'Creating...' : 'Create Game'}
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}

// Component for Join Game
function JoinGame({ user }) {
  const router = useRouter()
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoinGame = async (e) => {
    e.preventDefault()
    if (!joinCode) return setError('Please enter a game code.')
    if (!user) return

    setLoading(true)
    setError('')

    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', joinCode.toUpperCase())
        .single()

      if (gameError || !gameData) throw new Error('Game not found.')

      // Check if user already exists
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameData.id)
        .eq('user_id', user.id)
        .single()

      if (!existingPlayer) {
        const playerName = localStorage.getItem('playerName') || user.email.split('@')[0]
        await supabase.from('players').insert([
          {
            game_id: gameData.id,
            user_id: user.id,
            name: playerName,
            email: user.email,
            is_host: false,
            is_dead: false,
          },
        ])
      }

      router.push(`/lobby/${joinCode.toUpperCase()}`)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to join game.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center w-3/4 p-6 rounded gap-4">
      <input
        type="text"
        placeholder="Enter game code"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        className="w-full border rounded px-3 py-2 text-center uppercase"
      />
      <button
        onClick={handleJoinGame}
        disabled={loading}
        className="bg-gray-800 text-white px-6 py-3 rounded hover:bg-gray-900 w-full"
      >
        {loading ? 'Joining...' : 'Join Game'}
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}

export default function HomePage() {
  const [user, setUser] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) router.push('/')
      else setUser(data.user)
    }
    fetchUser()
  }, [router])

  if (!user) return <p>Loading...</p>

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-12 p-8">
      <h1 className="text-3xl font-bold">
        Welcome, {localStorage.getItem('playerName') || 'Player'}!
      </h1>

      {/* Create Game Section */}
      <CreateGame user={user} />

      {/* Divider */}
      <div className="w-3/4 border-t border-gray-300 my-8"></div>

      {/* Join Game Section */}
      <JoinGame user={user} />
    </main>
  )
}

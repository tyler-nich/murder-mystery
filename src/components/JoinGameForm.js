'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function JoinGameForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()

    // Check game exists
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('*')
      .eq('code', code)
      .single()

    if (gameErr || !game) {
      setMessage('Game code not found.')
      return
    }

    // Add player
    const { error: insertErr } = await supabase.from('players').insert([
      {
        name,
        email,
        game_id: game.id
      }
    ])
    if (insertErr) {
      setMessage('Error joining game.')
      return
    }

    setMessage(`Joined game ${code}!`)
    setName('')
    setEmail('')
    setCode('')
  }

  return (
    <form onSubmit={handleJoin} className="flex flex-col gap-4 p-4 max-w-md mx-auto">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Your Name"
        className="border p-2 rounded"
        required
      />
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        className="border p-2 rounded"
        required
      />
      <input
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Game Code"
        className="border p-2 rounded"
        required
      />
      <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded">
        Join Game
      </button>
      {message && <p className="mt-2 text-center">{message}</p>}
    </form>
  )
}

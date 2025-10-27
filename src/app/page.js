'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function HomePage() {
  const [code, setCode] = useState('')
  const [gameCreated, setGameCreated] = useState(false)

  async function handleCreateGame() {
    const newCode = Math.random().toString(36).substring(2, 7).toUpperCase()
    const { data, error } = await supabase.from('games').insert([{ code: newCode }]).select()
    if (error) console.error(error)
    setCode(newCode)
    setGameCreated(true)
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <h1 className="text-3xl font-bold">Murder Mystery 🕵️‍♀️</h1>
      {!gameCreated ? (
        <button onClick={handleCreateGame} className="bg-red-600 text-white px-4 py-2 rounded-lg">
          Create Game
        </button>
      ) : (
        <div>
          <p>Game created! Share this code:</p>
          <h2 className="text-2xl font-mono">{code}</h2>
        </div>
      )}
    </main>
  )
}

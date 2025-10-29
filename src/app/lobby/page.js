'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PlayerList from '@/components/PlayerList'

export default function LobbyPage() {
  const searchParams = useSearchParams()
  const codeFromURL = searchParams.get('code')
  const [manualCode, setManualCode] = useState('')
  const [submittedCode, setSubmittedCode] = useState(codeFromURL || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmittedCode(manualCode.trim().toUpperCase())
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8 gap-4">
      <h1 className="text-3xl font-bold mb-4">Lobby</h1>

      {!submittedCode ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Enter Game Code"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <button
            type="submit"
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Enter Lobby
          </button>
        </form>
      ) : (
        <PlayerList gameCode={submittedCode} />
      )}
    </main>
  )
}

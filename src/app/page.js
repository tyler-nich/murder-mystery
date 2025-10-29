'use client'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  const handleCreateGame = () => {
    router.push('/create')
  }

  const handleJoinGame = () => {
    router.push('/join')
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold mb-2">🩸 Murder Mystery</h1>
      <p className="text-gray-600 max-w-md">
        A deadly party game. One of you is the murderer... but who?
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mt-6">
        <button
          onClick={handleCreateGame}
          className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition"
        >
          Create Game
        </button>

        <button
          onClick={handleJoinGame}
          className="bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-900 transition"
        >
          Join Game
        </button>
      </div>
    </main>
  )
}

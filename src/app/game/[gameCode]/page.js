'use client'
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function GamePage() {
  const router = useRouter();
  const { gameCode } = useParams();
  const [players, setPlayers] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [isMurderer, setIsMurderer] = useState(false);

  useEffect(() => {
    let channel;

    const initGame = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return router.push('/home');
      setUser(userData.user);

      const { data: gameData } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .single();
      if (!gameData) return router.push('/home');

      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameData.id);
      setPlayers(playersData || []);
      setLoading(false);

      const me = playersData.find(p => p.user_id === userData.user.id);
      setIsMurderer(me?.is_murderer ?? false);

    console.log('🧑 Current player:', me);
    console.log('🩸 Is murderer?', me?.is_murderer);

      // Realtime updates
      channel = supabase
        .channel(`players-game-${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameData.id}` },
          (payload) => {
            setPlayers(prev => {
              switch(payload.eventType){
                case 'INSERT': return [...prev, payload.new];
                case 'UPDATE': return prev.map(p => p.id === payload.new.id ? payload.new : p);
                case 'DELETE': return prev.filter(p => p.id !== payload.old.id);
                default: return prev;
              }
            });
          }
        )
        .subscribe();
    };

    initGame();

    return () => {
      if(channel) supabase.removeChannel(channel);
    };
  }, [gameCode, router]);

  if (loading) return <p className="p-4 text-white">Loading game...</p>;

  const handleClickPlayer = (p) => {
    if (!isMurderer || p.is_dead) return;
    setSelectedPlayerId(prevId => (prevId === p.id ? null : p.id));
  };

  const handleConfirmKill = () => {
    if (!selectedPlayerId) return;
    router.push(`/game/${gameCode}/murder/${selectedPlayerId}`);
  };

  return (
  <main className="p-8 max-w-2xl mx-auto min-h-screen bg-black text-white">
    <h1 className="text-2xl font-bold mb-6">Game: {gameCode}</h1>

    <ul className="grid grid-cols-2 gap-4">
      {players.map((p) => {
        const isSelected = selectedPlayerId === p.id
        const isSelf = p.user_id === user?.id
        const isDead = p.is_dead

        const isDisabled = isDead || isSelf
        const canSelect = isMurderer && !isDisabled

        return (
          <li
            key={p.id}
            className={`
              border-2 rounded p-2 transition
              ${isDead ? 'border-red-600 text-red-600' : 'border-white'}
              ${isSelected ? 'bg-red-800' : ''}
              ${isDisabled ? 'cursor-not-allowed' : canSelect ? 'cursor-pointer hover:bg-gray-800' : ''}
            `}
            onClick={() => {
              if (canSelect) handleClickPlayer(p)
            }}
          >
            {isSelected ? `Kill ${p.name}?` : p.name} {isDead && '💀'}
            {isSelf && ' (You)'}
          </li>
        )
      })}
    </ul>

    {isMurderer && selectedPlayerId && (
      <button
        onClick={handleConfirmKill}
        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
      >
        Proceed to Murder
      </button>
    )}
  </main>
  );
}


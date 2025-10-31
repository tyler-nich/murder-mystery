'use client'
import { useEffect, useState, useRef } from 'react';
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
  const [latestMurder, setLatestMurder] = useState(null);

  // keep previous players to detect transitions
  const prevPlayersRef = useRef([]);

  useEffect(() => {
    let playersChannel = null;
    let gameId = null;
    let mounted = true;

    const init = async () => {
      try {
        // 1) auth
        const { data: authData } = await supabase.auth.getUser();
        const currentUser = authData?.user;
        if (!currentUser) {
          router.push('/home');
          return;
        }
        if (!mounted) return;
        setUser(currentUser);

        // 2) game
        const { data: gameData, error: gameErr } = await supabase
          .from('games')
          .select('*')
          .eq('code', gameCode)
          .single();
        if (gameErr || !gameData) {
          console.error('No game found for code', gameCode, gameErr);
          router.push('/home');
          return;
        }
        gameId = gameData.id;

        // 3) players initial
        const { data: playersData } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);

        if (!mounted) return;
        setPlayers(playersData || []);
        prevPlayersRef.current = (playersData || []).map(p => ({ ...p })); // copy
        setLoading(false);

        // set murderer flag for current user
        const me = (playersData || []).find(p => p.user_id === currentUser.id);
        setIsMurderer(me?.is_murderer ?? false);

        // 4) fetch last kill (in case someone died earlier)
        const { data: recent } = await supabase
          .from('game_events')
          .select('*')
          .eq('game_id', gameId)
          .eq('type', 'kill')
          .order('created_at', { ascending: false })
          .limit(1);
        if (recent?.length) setLatestMurder(recent[0]);

        // 5) subscribe to players UPDATE only
        playersChannel = supabase
          .channel(`players-updates-${gameId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'players',
              // filter ensures we only get updates for this game
              filter: `game_id=eq.${gameId}`
            },
            async (payload) => {
              console.log('[players-channel] payload:', payload);
              // payload.new and payload.old should exist for UPDATE
              const { new: newRow, old: oldRow, eventType } = payload;
              if (!newRow) return;

              // 5.a) update local players state immediately
              setPlayers(prev => {
                const exists = prev.some(p => p.id === newRow.id);
                if (exists) {
                  return prev.map(p => (p.id === newRow.id ? newRow : p));
                } else {
                  return [...prev, newRow];
                }
              });

              // 5.b) detect death transition: old.is_dead === false && new.is_dead === true
              const prev = prevPlayersRef.current.find(p => p.id === newRow.id);
              const justDied = prev && !prev.is_dead && newRow.is_dead;

              // update prevPlayersRef now
              prevPlayersRef.current = prevPlayersRef.current.map(p => (p.id === newRow.id ? newRow : p));

              // 5.c) If someone just died, fetch the most recent kill event for that victim
              if (justDied) {
                try {
                  const { data: killEventArr, error: killErr } = await supabase
                    .from('game_events')
                    .select('*')
                    .eq('game_id', gameId)
                    .eq('type', 'kill')
                    .eq('victim_id', newRow.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                  if (killErr) {
                    console.error('Error fetching kill event for victim:', killErr);
                  } else if (killEventArr?.length) {
                    console.log('[players-channel] found kill event:', killEventArr[0]);
                    setLatestMurder(killEventArr[0]);
                  } else {
                    console.warn('[players-channel] no kill event found for victim', newRow.id);
                  }
                } catch (err) {
                  console.error('Failed to query kill event for victim', err);
                }
              }
            }
          );

        // subscribe and log status
        const sub = await playersChannel.subscribe();
        console.log('[players-channel] subscribe status:', sub?.status ?? sub);

      } catch (err) {
        console.error('init error', err);
      }
    };

    init();

    return () => {
      mounted = false;
      if (playersChannel) {
        supabase.removeChannel(playersChannel).catch(e => console.warn('removeChannel err', e));
      }
    };
  }, [gameCode, router]);

  // helper UI handlers
  if (loading) return <p className="p-4 text-white">Loading game...</p>;

  const handleClickPlayer = (p) => {
    if (!isMurderer || p.is_dead || p.user_id === user?.id) return;
    setSelectedPlayerId(prev => (prev === p.id ? null : p.id));
  };

  const handleConfirmKill = () => {
    if (!selectedPlayerId) return;
    router.push(`/game/${gameCode}/murder/${selectedPlayerId}`);
  };

  const handleVote = () => router.push(`/game/${gameCode}/vote`);
  const getPlayerName = (id) => players.find(p => p.id === id)?.name ?? 'Unknown';

  return (
    <main className="p-8 max-w-2xl mx-auto min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold mb-6">Game: {gameCode}</h1>

      {/* Latest murder display */}
      {latestMurder && (
        <div className="mb-6 p-4 bg-gray-900 rounded border border-red-600">
          <p className="text-red-500 font-bold">
            {getPlayerName(latestMurder.victim_id)} has been murdered!
          </p>
          <p className="text-gray-300">Method of death: {latestMurder.details}</p>
          <button
            onClick={handleVote}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Go vote
          </button>
        </div>
      )}

      {/* Player list */}
      <ul className="grid grid-cols-2 gap-4">
        {players.map(p => {
          const isSelected = selectedPlayerId === p.id;
          const isSelf = p.user_id === user?.id;
          const isDead = p.is_dead;
          const isDisabled = isDead || (isMurderer && isSelf);
          const canSelect = isMurderer && !isDisabled;

          return (
            <li
              key={p.id}
              className={`
                border-2 rounded p-2 transition
                ${isDead ? 'border-red-600 text-red-600' : 'border-white'}
                ${isSelected ? 'bg-red-800' : ''}
                ${isDisabled ? 'cursor-not-allowed' : canSelect ? 'cursor-pointer hover:bg-gray-800' : ''}
              `}
              onClick={() => canSelect && handleClickPlayer(p)}
            >
              {isSelected ? `Kill ${p.name}?` : p.name} {isDead && '💀'}
              {isSelf && ' (You)'}
            </li>
          );
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

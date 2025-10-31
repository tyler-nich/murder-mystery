'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function VotePage() {
  const router = useRouter();
  const { gameCode } = useParams();

  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [votes, setVotes] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [votingEnded, setVotingEnded] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    let votesChannel, eventsChannel, gamesChannel;
    let pollIntervalId;

    const init = async () => {
      try {
        // 1) Authenticate user
        const { data: authData } = await supabase.auth.getUser();
        const currentUser = authData?.user;
        if (!currentUser) {
          router.push('/home');
          return;
        }
        setUser(currentUser);

        // 2) Fetch game details
        const { data: gameData, error: gameErr } = await supabase
          .from('games')
          .select('*')
          .eq('code', gameCode)
          .single();

        if (gameErr || !gameData) {
          console.error('No game found for code:', gameCode, gameErr);
          router.push('/home');
          return;
        }
        setGame(gameData);
        setIsHost(gameData.host_id === currentUser.id);

        // If result already set on game, reflect immediately
        if (gameData.voting_ended) {
          setResultMessage(gameData.result_message || '');
          setVotingEnded(true);
        }

        // Fetch all players (alive and dead)
        const { data: playersData, error: playersErr } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameData.id);

        if (playersErr) {
        console.error('Error fetching players:', playersErr);
        setPlayers([]);
        } else {
        setPlayers(playersData || []);
        }

        // 4) Fetch existing votes
        const { data: votesData, error: votesErr } = await supabase
          .from('votes')
          .select('*')
          .eq('game_id', gameData.id);

        if (votesErr) {
          console.error('Error fetching votes:', votesErr);
          setVotes([]);
        } else {
          setVotes(votesData || []);
        }

        // Check if the user has already voted
        const voter = playersData.find(p => p.user_id === currentUser.id);
        if (votesData.some(v => v.voter_id === voter?.id)) {
          setHasVoted(true);
        }

        // 5) Subscribe to new votes
        votesChannel = supabase
          .channel(`votes-game-${gameData.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'votes',
              filter: `game_id=eq.${gameData.id}`,
            },
            (payload) => {
              setVotes(prev => [...prev, payload.new]);
            }
          );
        await votesChannel.subscribe();

        // 6) Check for existing vote result ONLY if game says voting ended
        if (gameData.voting_ended) {
          const { data: latestEvent, error: latestEventErr } = await supabase
            .from('game_events')
            .select('*')
            .eq('game_id', gameData.id)
            .eq('type', 'vote_result')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestEventErr) {
            console.error('Error fetching latest game event:', latestEventErr);
          } else if (latestEvent) {
            setResultMessage(latestEvent.details ?? '');
            setVotingEnded(true);
          }
        }

        // 7) Subscribe to game events for voting results (real-time updates)
        eventsChannel = supabase
          .channel(`game-events-${gameData.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'game_events',
              filter: `game_id=eq.${gameData.id}`,
            },
            (payload) => {
              console.log('Game event received', payload.new);
              if (payload?.new?.type === 'vote_result') {
                setResultMessage(payload.new.details);
                setVotingEnded(true);
              }
            }
          );
        await eventsChannel.subscribe();

        // 7b) Subscribe to games updates for this game to get result_message/voting_ended
        gamesChannel = supabase
          .channel(`games-${gameData.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'games',
              filter: `id=eq.${gameData.id}`,
            },
            (payload) => {
              const updated = payload?.new;
              if (!updated) return;
              if (updated.voting_ended) {
                setResultMessage(updated.result_message || '');
                setVotingEnded(true);
              }
            }
          );
        await gamesChannel.subscribe();

        setLoading(false);

        // 8) Polling fallback: periodically check for a vote_result until received
        pollIntervalId = setInterval(async () => {
          if (!gameData?.id) return;
          if (votingEnded) return;
          const { data: latest, error: latestErr } = await supabase
            .from('game_events')
            .select('*')
            .eq('game_id', gameData.id)
            .eq('type', 'vote_result')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!latestErr && latest) {
            setResultMessage(latest.details ?? '');
            setVotingEnded(true);
          }
        }, 2000);
      } catch (err) {
        console.error('Error initializing vote page:', err);
        setLoading(false);
      }
    };

    init();

    return () => {
      if (votesChannel) supabase.removeChannel(votesChannel).catch(() => {});
      if (eventsChannel) supabase.removeChannel(eventsChannel).catch(() => {});
      if (gamesChannel) supabase.removeChannel(gamesChannel).catch(() => {});
      if (pollIntervalId) clearInterval(pollIntervalId);

      // Host-only: prepare next round AFTER leaving the vote room
      // If the round just ended, clear votes and reset game so the room is ready next time
      if (isHost && votingEnded && game?.id) {
        (async () => {
          try {
            const { error: clearVotesErr } = await supabase
              .from('votes')
              .delete()
              .eq('game_id', game.id);
            if (clearVotesErr) console.error('Cleanup: error clearing votes:', clearVotesErr);

            const { error: resetGameErr } = await supabase
              .from('games')
              .update({ voting_ended: false, result_message: null })
              .eq('id', game.id);
            if (resetGameErr) console.error('Cleanup: error resetting game:', resetGameErr);
          } catch (e) {
            console.error('Cleanup: unexpected error preparing next round:', e);
          }
        })();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, router]);

  const handleCastVote = async () => {
    if (!selectedPlayerId) {
      alert('Select someone to vote for first.');
      return;
    }

    const voter = players.find(p => p.user_id === user?.id);
    if (!voter) {
      alert('You are not registered as a player in this game.');
      return;
    }

    if (votes.some(v => v.voter_id === voter.id)) {
      alert('You already voted.');
      return;
    }

    try {
      const payload = {
        game_id: game.id,
        voter_id: voter.id,
        voted_for: selectedPlayerId,
      };

      const { error } = await supabase.from('votes').insert(payload);
      if (error) {
        console.error('Error casting vote:', error);
        alert('Failed to cast vote.');
      } else {
        setHasVoted(true);
      }
    } catch (err) {
      console.error('Unexpected error casting vote:', err);
    }
  };

    const handleGetResults = async () => {
    try {
        // Prevent duplicate results via games.voting_ended
        const { data: currentGame, error: gameReadErr } = await supabase
          .from('games')
          .select('*')
          .eq('id', game.id)
          .single();
        if (gameReadErr) {
          console.error('Error reading game before results:', gameReadErr);
        } else if (currentGame?.voting_ended) {
          setResultMessage(currentGame.result_message || '');
          setVotingEnded(true);
          return;
        }

        // Prevent duplicate results: if a vote_result already exists, do nothing
        const { data: existingResult, error: existingErr } = await supabase
          .from('game_events')
          .select('*')
          .eq('game_id', game.id)
          .eq('type', 'vote_result')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingErr && existingResult) {
          setResultMessage(existingResult.details ?? '');
          setVotingEnded(true);
          return;
        }

        // Fetch latest votes from DB to avoid stale state
        const { data: freshVotes, error: votesFetchErr } = await supabase
          .from('votes')
          .select('*')
          .eq('game_id', game.id);

        if (votesFetchErr) {
          console.error('Error fetching votes for results:', votesFetchErr);
          return;
        }

        const tally = {};
        (freshVotes || []).forEach((v) => {
          const key = String(v.voted_for);
          tally[key] = (tally[key] || 0) + 1;
        });

        const counts = Object.values(tally);
        if (counts.length === 0) {
          const { error: insertNoVotesErr } = await supabase.from('game_events').insert({
            game_id: game.id,
            victim_id: null,
            type: 'vote_result',
            details: 'No votes were cast.',
          });
          if (insertNoVotesErr) console.error('Error inserting no-votes event:', insertNoVotesErr);

          // Also update games to broadcast result
          const { error: gameUpdateNoVotesErr } = await supabase
            .from('games')
            .update({ voting_ended: true, result_message: 'No votes were cast.' })
            .eq('id', game.id);
          if (gameUpdateNoVotesErr) console.error('Error updating game no-votes:', gameUpdateNoVotesErr);
          return;
        }

        const maxVotes = Math.max(...counts);
        const winners = Object.entries(tally).filter(([_, count]) => count === maxVotes);

        let resultMessage;
        let victimId = null; // Default to null in case of a tie

        if (winners.length !== 1) {
          resultMessage = 'It was a tie, keep playing!';
        } else {
          const [winnerIdStr] = winners[0];
          victimId = winnerIdStr; // Set the victim_id to the player with the most votes
          const winner = players.find(p => String(p.id) === winnerIdStr);

          if (winner?.is_murderer) {
              resultMessage = `Congrats! You caught the Murderer, it was ${winner?.name ?? 'Unknown'}.`;
          } else {
              resultMessage = `Boo! You failed, it wasn't ${winner?.name ?? 'Unknown'}.`;
          }

          // Update the player as voted out
          await supabase
              .from('players')
              .update({ voted_out: true })
              .eq('id', winnerIdStr);
        }

        // Log the result in the game_events table
        const { error: insertEventErr } = await supabase.from('game_events').insert({
          game_id: game.id,
          victim_id: victimId, // Include the victim_id in the payload
          type: 'vote_result',
          details: resultMessage,
        });
        if (insertEventErr) console.error('Error inserting game event:', insertEventErr);

        // Update game to reflect final state and push to all clients
        const { error: gameUpdateErr } = await supabase
          .from('games')
          .update({ voting_ended: true, result_message: resultMessage })
          .eq('id', game.id);
        if (gameUpdateErr) console.error('Error updating game result:', gameUpdateErr);
    } catch (err) {
        console.error('Error getting results:', err);
    }
    };

  if (loading) return <p className="p-4 text-white">Loading...</p>;

  if (votingEnded) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
        <h1 className="text-3xl font-bold mb-6">{resultMessage}</h1>
        <button
          onClick={() => router.push(`/game/${gameCode}`)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded text-lg font-semibold transition"
        >
          Return to Game
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <h1 className="text-3xl font-bold mb-6">Vote for the Murderer</h1>

        <ul className="grid grid-cols-2 gap-4 w-full max-w-md">
        {players
            .filter(p => !p.is_dead && !p.voted_out) // Only show alive and not voted out players
            .map(p => (
            <li
                key={p.id}
                className={`border-2 rounded p-4 text-center cursor-pointer transition
                ${selectedPlayerId === p.id ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-300'}
                ${hasVoted ? 'bg-green-600 text-white' : ''}`}
                onClick={() => !hasVoted && setSelectedPlayerId(p.id)}
            >
                {p.name}
            </li>
            ))}
        </ul>

      <div className="mt-6 flex flex-col items-center gap-3 w-full max-w-md">
        {!hasVoted && (
          <button
            onClick={handleCastVote}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded text-lg font-semibold transition"
          >
            Vote
          </button>
        )}

        {isHost && (
          <button
            onClick={handleGetResults}
            className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded text-lg font-semibold transition"
          >
            Get Results
          </button>
        )}
      </div>
    </main>
  );
}
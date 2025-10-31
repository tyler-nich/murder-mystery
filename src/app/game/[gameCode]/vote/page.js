'use client';
import { useEffect, useState, useMemo } from 'react';
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
  const [votes, setVotes] = useState([]); // raw vote rows
  const [isHost, setIsHost] = useState(false);
  const [votingEnded, setVotingEnded] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState(false); // Track if the user has voted

  // Dynamically calculate votesCast
  const votesCast = useMemo(() => {
    const count = new Set(votes.map(v => v.voter_id)).size;
    console.log('Votes cast updated:', count); // Debugging log
    return count;
  }, [votes]);

  useEffect(() => {
    let votesChannel, gamesChannel;

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

        // 2) Resolve game by code -> get UUID
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

        // Check if voting has already ended
        if (gameData.voting_ended) {
          setResultMessage(gameData.result_message);
          setVotingEnded(true);
          return;
        }

        // 3) Fetch all players for the game
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

        // 4) Fetch existing votes for this game
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

        // 5) Subscribe to new votes (realtime)
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
              console.log('New vote received:', payload.new); // Debugging log
              setVotes(prev => [...prev, payload.new]); // Update votes state
            }
          );
        await votesChannel.subscribe();

        // 6) Subscribe to game updates (realtime)
        gamesChannel = supabase
          .channel(`games-updates-${gameData.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'games',
              filter: `id=eq.${gameData.id}`,
            },
            (payload) => {
              console.log('Game update received:', payload.new); // Debugging log
              if (payload.new.voting_ended) {
                setResultMessage(payload.new.result_message); // Update result message
                setVotingEnded(true); // Mark voting as ended
              }
            }
          );
        await gamesChannel.subscribe();

        setLoading(false);
      } catch (err) {
        console.error('init error', err);
        setLoading(false);
      }
    };

    init();

    return () => {
      if (votesChannel) supabase.removeChannel(votesChannel).catch(() => {});
      if (gamesChannel) supabase.removeChannel(gamesChannel).catch(() => {});
    };
  }, [gameCode, router]);

  const handleCastVote = async () => {
    if (!selectedPlayerId) {
        alert('Select someone to vote for first.');
        return;
    }
    if (!game) {
        alert('Game not loaded yet.');
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
        voted_for: selectedPlayerId
        };

        const { data, error } = await supabase
        .from('votes')
        .insert(payload)
        .select()
        .single();

        if (error) {
        console.error('Error submitting vote:', error);
        alert(error.message || 'Failed to submit vote.');
        return;
        }

        setVotes(prev => [...prev, data]);
        setSelectedPlayerId(null);
        setHasVoted(true); // Mark the user as having voted
    } catch (err) {
        console.error('Unexpected error submitting vote:', err);
        alert('Unexpected error submitting vote.');
    }
    };

  const endVoting = async () => {
    const tally = {};
    votes.forEach(v => {
      tally[v.voted_for] = (tally[v.voted_for] || 0) + 1;
    });

    const maxVotes = Math.max(...Object.values(tally));
    const winners = Object.entries(tally).filter(([_, count]) => count === maxVotes);

    let resultMessage;
    if (winners.length !== 1) {
      resultMessage = 'It’s a tie! No one was caught.';
    } else {
      const [winnerId] = winners[0];
      const winner = players.find(p => p.id === winnerId);

      if (winner?.is_murderer) {
        resultMessage = `You caught the Murderer! It was ${winner.name}.`;
      } else {
        resultMessage = `${winner.name} was not the Murderer. You failed.`;
      }
    }

    try {
      const { error } = await supabase
        .from('games')
        .update({ voting_ended: true, result_message: resultMessage })
        .eq('id', game.id);

      if (error) {
        console.error('Error ending voting:', error);
        alert('Failed to end voting.');
      } else {
        setResultMessage(resultMessage);
        setVotingEnded(true);
      }
    } catch (err) {
      console.error('Unexpected error ending voting:', err);
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
        {players.filter(p => !p.is_dead).map(p => (
          <li
            key={p.id}
            className={`border-2 rounded p-4 text-center cursor-pointer transition
              ${selectedPlayerId === p.id ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-300'}`}
            onClick={() => setSelectedPlayerId(p.id)}
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
            Cast Vote
          </button>
        )}

        {isHost && (
          <button
            onClick={endVoting}
            className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded text-lg font-semibold transition"
          >
            End Vote ({votesCast}/{players.length} votes cast)
          </button>
        )}
      </div>
    </main>
  );
}
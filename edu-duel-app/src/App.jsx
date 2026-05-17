import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { supabase } from "./lib/supabaseClient";
import AdminDashboard from "./components/AdminDashboard";

// ─── Constants ────────────────────────────────────────────────────────────────
const TIERS = [
  { name: "Resistor",      min: 0,    max: 500,  color: "#a0522d", icon: "⟿" },
  { name: "Capacitor",     min: 501,  max: 1000, color: "#4a9eff", icon: "⊣⊢" },
  { name: "Inductor",      min: 1001, max: 1500, color: "#9b59b6", icon: "∿∿" },
  { name: "Transistor",    min: 1501, max: 2000, color: "#2ecc71", icon: "△" },
  { name: "Superconductor",min: 2001, max: 9999, color: "#f39c12", icon: "⚡" },
];

const GAME_DURATION = 15 * 60; // Max match time
const Q_TIMER_DURATION = 20; // 20 seconds per question

const DEPARTMENTS = ["EEE","CSE","ME","CE","ECE","BBA","ETE","Physics","Chemistry","Math"];

const SAMPLE_QUESTIONS = [
  { q:"What does CPU stand for?", options:["Central Processing Unit","Computer Personal Unit","Central Program Utility","Core Processing Unit"], answer:0, subject:"CSE" },
  { q:"Ohm's Law states V = ?", options:["I²R","IR","I/R","P/I"], answer:1, subject:"EEE" },
  { q:"What is the time complexity of binary search?", options:["O(n)","O(n²)","O(log n)","O(1)"], answer:2, subject:"CSE" },
  { q:"Which component stores electrical charge?", options:["Resistor","Inductor","Capacitor","Diode"], answer:2, subject:"EEE" },
  { q:"RAM stands for?", options:["Read Access Memory","Random Access Memory","Run Access Module","Rapid Array Memory"], answer:1, subject:"CSE" },
  { q:"The unit of frequency is?", options:["Volt","Ampere","Hertz","Watt"], answer:2, subject:"EEE" },
  { q:"What does HTML stand for?", options:["Hyper Text Markup Language","High Tech Modern Language","Hyper Transfer Markup Logic","Home Text Make Language"], answer:0, subject:"CSE" },
  { q:"P = IV is the formula for?", options:["Pressure","Power","Potential","Period"], answer:1, subject:"EEE" },
  { q:"Which data structure uses LIFO?", options:["Queue","Stack","Array","Tree"], answer:1, subject:"CSE" },
  { q:"The SI unit of resistance is?", options:["Ampere","Volt","Ohm","Farad"], answer:2, subject:"EEE" },
];

function getTier(elo) {
  return TIERS.find(t => elo >= t.min && elo <= t.max) || TIERS[TIERS.length - 1];
}

function calcElo(myElo, oppElo, won) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
  const score = won ? 1 : 0;
  return Math.round(K * (score - expected));
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,"0")}`;
}

// ─── Mock leaderboard data ────────────────────────────────────────────────────
const INIT_LEADERBOARD = [
  { username: "VoltageKing",   department: "EEE", elo: 2340, wins: 87 },
  { username: "ByteCrusher",   department: "CSE", elo: 1980, wins: 64 },
  { username: "CircuitBreaker",department: "EEE", elo: 1750, wins: 55 },
  { username: "NullPointer",   department: "CSE", elo: 1620, wins: 49 },
  { username: "OhmBoy",        department: "EEE", elo: 1440, wins: 38 },
  { username: "KernelPanic",   department: "CSE", elo: 1280, wins: 31 },
  { username: "WaveFunction",  department: "Physics", elo: 1100, wins: 24 },
  { username: "GradientDrop",  department: "ME", elo: 890,  wins: 18 },
  { username: "MatrixNerd",    department: "Math", elo: 710,  wins: 12 },
  { username: "SignalLost",    department: "ECE", elo: 530,  wins: 7  },
];

const BOT_NAMES = ["AIRival","CircuitBot","ByteGhost","VoltBot","OhmEngine"];

// ─── App ──────────────────────────────────────────────────────────────────────
export default function EduDuel() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [leaderboard, setLeaderboard] = useState(INIT_LEADERBOARD);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [qTimeLeft, setQTimeLeft] = useState(Q_TIMER_DURATION);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [matchmakingStep, setMatchmakingStep] = useState(0);
  const [battleId, setBattleId] = useState(null);
  const [myRole, setMyRole] = useState(null); 
  const [onlineUsers, setOnlineUsers] = useState({});
  const [forfeit, setForfeit] = useState(false);
  const [oppHasAnswered, setOppHasAnswered] = useState(false);
  const [waitingForNext, setWaitingForNext] = useState(false);

  const battleChannelRef = useRef(null);
  const presenceChannelRef = useRef(null);
  const timerRef = useRef(null);
  const qTimerRef = useRef(null);
  const matchmakingRef = useRef(null);
  const feedbackRef = useRef(null);

    // Track online presence
    useEffect(() => {
      if (!supabase || !user) return;

      console.log("Setting up Presence for:", user.username);
      const channel = supabase.channel('online-combatants', {
        config: { presence: { key: user.username } }
      });

      presenceChannelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          console.log("Presence Sync event fired. State:", state);
          const simplified = {};
          for (const key in state) {
            if (state[key][0]) simplified[key] = state[key][0];
          }
          setOnlineUsers(simplified);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('User joined presence:', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('User left presence:', key, leftPresences);
        })
        .subscribe(async (status) => {
          console.log("Presence subscription status:", status);
          if (status === 'SUBSCRIBED') {
            const trackStatus = await channel.track({
              username: user.username,
              department: user.department,
              elo: user.elo,
              status: 'idle',
              online_at: new Date().toISOString()
            });
            console.log("Initial track result:", trackStatus);
          }
        });

      return () => {
        console.log("Cleaning up Presence channel");
        supabase.removeChannel(channel);
        presenceChannelRef.current = null;
      };
    }, [user]);

  const updatePresence = useCallback(async (status) => {
    if (!supabase || !user || !presenceChannelRef.current) {
      console.warn("Cannot update presence: Supabase or User or Channel missing", { user: !!user, channel: !!presenceChannelRef.current });
      return;
    }
    console.log(`Updating presence status to: ${status}`);
    await presenceChannelRef.current.track({
      username: user.username,
      department: user.department,
      elo: user.elo,
      status: status,
      online_at: new Date().toISOString()
    });
  }, [user]);

  // Fetch leaderboard from Supabase and subscribe to changes
  useEffect(() => {
    if (!supabase) return;

    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, department, elo, wins')
        .order('elo', { ascending: false })
        .limit(10);
      
      if (!error && data) {
        setLeaderboard(data);
      }
    };

    fetchLeaderboard();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchLeaderboard()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const loadQuestions = async (dept, customQuestions = null) => {
    if (customQuestions) {
      setQuestions(customQuestions);
      setLoadingQ(false);
      return;
    }
    setLoadingQ(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .eq('subject', dept)
          .limit(15);
        
        if (!error && data && data.length > 0) {
          const formatted = data.map(q => ({
            q: q.q,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            answer: q.answer,
            subject: q.subject
          }));
          const shuffled = formatted.sort(() => Math.random() - 0.5);
          setQuestions(shuffled);
          setLoadingQ(false);
          return shuffled; // Return for the matchmaking logic
        }
      }
      
      let filteredSamples = SAMPLE_QUESTIONS.filter(q => q.subject === dept);
      if (filteredSamples.length === 0) {
        filteredSamples = SAMPLE_QUESTIONS.filter(q => q.subject === "CSE" || q.subject === "EEE");
      }

      const shuffled = [...filteredSamples].sort(() => Math.random() - 0.5);
      setQuestions(shuffled);
      setLoadingQ(false);
      return shuffled;
    } catch(e) {
      const shuffled = [...SAMPLE_QUESTIONS].sort(() => Math.random() - 0.5);
      setQuestions(shuffled);
      setLoadingQ(false);
      return shuffled;
    }
  };

  const handleLogin = async ({username, department, isNew}) => {
    let u;
    
    if (supabase) {
      // Try to fetch existing profile
      const { data: existing, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (!error && existing) {
        u = existing;
      } else if (isNew) {
        // Create new profile
        const newUser = { username, department, elo: 400, wins: 0, losses: 0, total_matches: 0 };
        const { data, error: insertError } = await supabase
          .from('profiles')
          .insert([newUser])
          .select()
          .single();
        
        if (!insertError) u = data;
      }
    }

    // Fallback to localStorage if Supabase fails or is not configured
    if (!u) {
      const savedUsers = JSON.parse(localStorage.getItem("edu_users")||"{}");
      if(isNew) {
        u = { username, department, elo: 400, wins: 0, losses: 0, total_matches: 0 };
        savedUsers[username] = u;
      } else {
        u = savedUsers[username] || { username, department, elo: 400, wins: 0, losses: 0, total_matches: 0 };
      }
      localStorage.setItem("edu_users", JSON.stringify(savedUsers));
    }

    setUser(u);
    setScreen("lobby");
  };

  const startMatchmaking = async () => {
    // 0. Kill any old timers/channels
    if (matchmakingRef.current) clearInterval(matchmakingRef.current);
    
    // Reset state for new match
    setMyScore(0);
    setOppScore(0);
    setQIndex(0);
    setBattleId(null);
    setMatchResult(null);
    setForfeit(false);

    if (!supabase) {
      const bot = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
      setOpponent({ username: bot, elo: user.elo + 50, department: user.department, is_bot: true });
      setScreen("matchmaking");
      setTimeout(() => startBattle(), 3000);
      return;
    }

    setScreen("matchmaking");
    setMatchmakingStep(0);
    // 1. Join the queue (with Presence update)
    await updatePresence('searching');

    const { error: joinError } = await supabase
      .from('matchmaking_queue')
      .upsert({ 
        username: user.username, 
        elo: user.elo, 
        department: user.department, 
        status: 'searching',
        matched_with: null,
        battle_id: null,
        created_at: new Date().toISOString()
      });

    if (joinError) {
      console.error("Queue error:", joinError);
      return;
    }

    // 2. Subscribe to our own queue status
    const channel = supabase
      .channel(`match-${user.username}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matchmaking_queue', filter: `username=eq.${user.username}` },
        (payload) => {
          if (payload.new.status === 'matched') {
            if (!matchmakingRef.current) return; // Prevent double-trigger
            clearInterval(matchmakingRef.current);
            matchmakingRef.current = null;
            setMyRole('B');
            fetchOpponentAndStart(payload.new.matched_with, payload.new.battle_id);
          }
        }
      )
      .subscribe();

    // 3. Try to find someone else already searching
    const findMatch = async () => {
      // SELF-CHECK: See if someone else matched ME first
      const { data: me } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('username', user.username)
        .single();
      
      if (me && me.status === 'matched' && me.matched_with) {
        console.log("[MATCH] I was matched by:", me.matched_with);
        if (!matchmakingRef.current) return true; // Prevent double-trigger
        clearInterval(matchmakingRef.current);
        matchmakingRef.current = null;
        setMyRole('B');
        fetchOpponentAndStart(me.matched_with, me.battle_id);
        return true;
      }

      const { data: allMatches } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('status', 'searching')
        .neq('username', user.username)
        .limit(20);

      let opponentData = null;

      if (allMatches && allMatches.length > 0) {
        // Sort matches: Same department first, then closest ELO
        allMatches.sort((a, b) => {
          if (a.department === user.department && b.department !== user.department) return -1;
          if (a.department !== user.department && b.department === user.department) return 1;
          const diffA = Math.abs(a.elo - user.elo);
          const diffB = Math.abs(b.elo - user.elo);
          return diffA - diffB;
        });

        // Get the best ELO diff among the top candidates (who share the same department status)
        const topDept = allMatches[0].department;
        const closestEloDiff = Math.abs(allMatches[0].elo - user.elo);
        
        // Find all candidates who are within 100 ELO of the closest match, to randomize
        const bestCandidates = allMatches.filter(m => 
          (m.department === topDept || topDept !== user.department) && 
          Math.abs(m.elo - user.elo) <= closestEloDiff + 100
        );

        // Pick one randomly from the best candidates
        opponentData = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
      }

      if (opponentData) {
        const { error: lockError } = await supabase
          .from('matchmaking_queue')
          .update({ status: 'locking', matched_with: user.username })
          .eq('username', opponentData.username)
          .eq('status', 'searching');

        if (!lockError) {
          // Player A generates questions for BOTH players
          const battleQuestions = await loadQuestions(user.department);

          // Initialize the battle session with question data
          const { data: battle, error: battleError } = await supabase
            .from('battles')
            .insert([{ 
              player_a: user.username, 
              player_b: opponentData.username,
              question_data: battleQuestions
            }])
            .select()
            .single();

          if (!battleError) {
            // Update opponent FIRST to 'matched' so they get the Battle ID and trigger their listener
            await supabase
              .from('matchmaking_queue')
              .update({ status: 'matched', matched_with: user.username, battle_id: battle.id })
              .eq('username', opponentData.username);

            // Update OURSELVES to matched too, so Player B can see us if they check
            await supabase
              .from('matchmaking_queue')
              .update({ status: 'matched', matched_with: opponentData.username, battle_id: battle.id })
              .eq('username', user.username);
            
            setMyRole('A');
            setBattleId(battle.id);
            setOpponent(opponentData);
            setMatchmakingStep(3);
      setTimeout(() => {
        if (matchmakingRef.current) {
          clearInterval(matchmakingRef.current);
          matchmakingRef.current = null;
        }
        // Cleanup queue entries for BOTH players after a delay
        supabase.from('matchmaking_queue').delete().eq('username', user.username).then();
        
        supabase.removeChannel(channel);
        startBattle(battleQuestions); // Pass shared questions
      }, 1000);
            return true;
          }
        }
      }
      return false;
    };

    const fetchOpponentAndStart = async (oppUsername, bId) => {
      // 1. Fetch Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', oppUsername)
        .single();
      
      setOpponent(profile || { username: oppUsername, elo: 400, department: 'Unknown' });
      setBattleId(bId);
      setMatchmakingStep(3);

      // 2. RETRY loop to wait for Player A's questions to save
      let battleData = null;
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase.from('battles').select('*').eq('id', bId).single();
        if (data?.question_data) {
          battleData = data;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      // Clean up queue
      supabase.from('matchmaking_queue').delete().eq('username', user.username).then();

      setTimeout(() => {
        if (matchmakingRef.current) {
          clearInterval(matchmakingRef.current);
          matchmakingRef.current = null;
        }
        supabase.removeChannel(channel);
        startBattle(battleData?.question_data);
      }, 1000);
    };

    // 4. Matchmaking Loop & Timeout
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      setMatchmakingStep(Math.min(2, Math.floor(attempts / 2)));
      
      const found = await findMatch();
      // If we got matched elsewhere, or we are already in battle, STOP EVERYTHING
      if (found || screen === "battle" || battleId) {
        clearInterval(interval);
        matchmakingRef.current = null;
        return;
      }
      
      if (attempts >= 30) { 
    // Fallback to bot after 30 seconds
        clearInterval(interval);
        matchmakingRef.current = null;
        supabase.removeChannel(channel);
        const bot = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
        setOpponent({ username: bot, elo: user.elo + 50, department: user.department, is_bot: true });
        setMatchmakingStep(3);
        setTimeout(() => startBattle(), 1000);
        // Clean up our queue entry
        await supabase.from('matchmaking_queue').delete().eq('username', user.username);
      }
    }, 1000);

    matchmakingRef.current = interval;
  };

  const startBattle = async (customQuestions = null) => {
    // FINAL SAFETY: Kill ALL matchmaking timers
    if (matchmakingRef.current) {
      clearInterval(matchmakingRef.current);
      matchmakingRef.current = null;
    }
    
    setMyScore(0); setOppScore(0); setQIndex(0);
    setSelectedOpt(null); setFeedback(null);
    setOppHasAnswered(false); setWaitingForNext(false);
    setTimeLeft(GAME_DURATION); setQTimeLeft(Q_TIMER_DURATION);
    await updatePresence('battling');
    if (customQuestions) {
      setQuestions(customQuestions);
    } else {
      await loadQuestions(user.department);
    }
    setScreen("battle");
  };

  // Sync scores and track forfeit
  useEffect(() => {
    if (!supabase || !battleId || screen !== "battle" || !myRole) return;

    const channel = supabase.channel(`battle-${battleId}`, {
      config: { 
        broadcast: { self: false },
      }
    });

    battleChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'score_update' }, (payload) => {
        const data = payload.payload;
        if (data && data.role !== myRole) {
          setOppScore(data.score);
          setOppHasAnswered(true);
        }
      })
      .on('broadcast', { event: 'next_question' }, (payload) => {
        console.log("[BATTLE] Received next_question sync:", payload.payload.index);
        handleNextQuestionSync(payload.payload.index);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` }, (payload) => {
        // Backup sync from DB
        const data = payload.new;
        const oppField = myRole === 'A' ? 'score_b' : 'score_a';
        setOppScore(data[oppField]);
        
        if (data.current_q_index > qIndex) {
          handleNextQuestionSync(data.current_q_index);
        }
      })
      .subscribe();

    // Presence forfeit detection (Re-enabled with status check)
    const checkForfeit = setInterval(() => {
      if (opponent && !opponent.is_bot && !matchResult) {
        const oppPresence = onlineUsers[opponent.username];
        
        // Trigger forfeit if:
        // 1. They are completely offline
        // 2. They are back in the lobby ('idle' or 'searching') while I am still battling them
        if (!oppPresence || (oppPresence.status !== 'battling')) {
          console.log(`[BATTLE] Opponent ${opponent.username} left battle. Status: ${oppPresence?.status}. Forfeit triggered.`);
          setForfeit(true);
          clearInterval(checkForfeit);
          setTimeout(() => endGame(), 3000);
        }
      }
    }, 15000);

    return () => {
      clearInterval(checkForfeit);
      supabase.removeChannel(channel);
      battleChannelRef.current = null;
    };
  }, [screen, battleId, myRole, onlineUsers, opponent]);

  useEffect(() => {
    if (screen !== "battle") return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); endGame(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [screen]);

  useEffect(() => {
    if (screen !== "battle" || selectedOpt !== null || waitingForNext) return;
    setQTimeLeft(Q_TIMER_DURATION);
    qTimerRef.current = setInterval(() => {
      setQTimeLeft(t => {
        if (t <= 1) {
          handleAnswer(-1); // Auto-fail on timeout
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(qTimerRef.current);
  }, [screen, qIndex, selectedOpt, waitingForNext]);

  useEffect(() => {
    if (screen !== "battle" || !questions.length || (opponent && !opponent.is_bot)) return;
    const delay = 4000 + Math.random() * 8000;
    const t = setTimeout(() => {
      const correct = Math.random() > 0.4;
      if(correct) setOppScore(s => s + 10 + (Math.random()>0.5 ? 5 : 0));
    }, delay);
    return () => clearTimeout(t);
  }, [screen, qIndex, questions]);

  const handleAnswer = (idx) => {
    if (selectedOpt !== null || waitingForNext) return;
    clearInterval(qTimerRef.current);
    setSelectedOpt(idx);
    const q = questions[qIndex];
    const correct = idx === q?.answer;
    const pts = correct ? 10 + (qTimeLeft > 10 ? 5 : 0) : 0;
    const newScore = myScore + pts;
    
    if (correct) {
      setMyScore(newScore);
      setFeedback({ type: "correct", pts });
    } else {
      setFeedback({ type: "incorrect", pts: 0 });
    }

    setWaitingForNext(true);

    // Sync score and state
    if (supabase && battleId && battleChannelRef.current) {
      battleChannelRef.current.send({
        type: 'broadcast',
        event: 'score_update',
        payload: { role: myRole, score: newScore, answered: true }
      });
      
      const scoreField = myRole === 'A' ? 'score_a' : 'score_b';
      const answeredField = myRole === 'A' ? 'player_a_answered' : 'player_b_answered';
      supabase.from('battles').update({ [scoreField]: newScore, [answeredField]: true }).eq('id', battleId).then();
    }
  };

  useEffect(() => {
    // Both players move to next question ONLY when both answered
    if (waitingForNext) {
      // If opponent answered, move in 2s
      if (oppHasAnswered) {
        const t = setTimeout(() => {
          if (myRole === 'A') {
            const nextIdx = qIndex + 1;
            nextIdx >= questions.length ? endGame() : handleNextQuestionSync(nextIdx);
          }
        }, 2000);
        return () => clearTimeout(t);
      }
      
      // SAFETY VALVE: If timer is 0 and we've waited 8s without opponent answering, move anyway
      if (qTimeLeft <= 0) {
        const t = setTimeout(() => {
          console.log("[BATTLE] Safety Valve: Opponent unresponsive, skipping...");
          const nextIdx = qIndex + 1;
          nextIdx >= questions.length ? endGame() : handleNextQuestionSync(nextIdx);
        }, 8000);
        return () => clearTimeout(t);
      }
    }
  }, [waitingForNext, oppHasAnswered, qIndex, questions, myRole, qTimeLeft]);

  const handleNextQuestionSync = (idx) => {
    setQIndex(idx);
    setSelectedOpt(null);
    setFeedback(null);
    setOppHasAnswered(false);
    setWaitingForNext(false);
    setQTimeLeft(Q_TIMER_DURATION);
    
    if (myRole === 'A' && battleChannelRef.current) {
      battleChannelRef.current.send({
        type: 'broadcast',
        event: 'next_question',
        payload: { index: idx }
      });
    }
    
    if (supabase && battleId) {
      supabase.from('battles').update({ 
        player_a_answered: false, 
        player_b_answered: false,
        current_q_index: idx 
      }).eq('id', battleId).then();
    }
  };

  const endGame = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(qTimerRef.current);
    setScreen("result");
    
    // Update presence back to idle
    updatePresence('idle');
    setMyScore(ms => {
      setOppScore(os => {
        const won = ms > os;
        const draw = ms === os;
        const eloChange = calcElo(user.elo, opponent.elo, won ? 1 : draw ? 0.5 : 0);
        const updatedUser = {
          ...user,
          elo: Math.max(0, user.elo + eloChange),
          wins: won ? user.wins + 1 : user.wins,
          losses: !won && !draw ? (user.losses||0)+1 : (user.losses||0),
          total_matches: (user.total_matches||0)+1,
        };

        // Sync to Supabase
        if (supabase) {
          supabase
            .from('profiles')
            .update(updatedUser)
            .eq('username', user.username)
            .then(({ error }) => {
              if (error) console.error("Sync error:", error);
            });
        }

        const savedUsers = JSON.parse(localStorage.getItem("edu_users")||"{}");
        savedUsers[user.username] = updatedUser;
        localStorage.setItem("edu_users", JSON.stringify(savedUsers));
        setUser(updatedUser);
        setMatchResult({ won, draw, eloChange, myFinal: ms, oppFinal: os });
        
        // Local leaderboard update (real-time subscription will also trigger an update)
        setLeaderboard(lb => {
          const existing = lb.findIndex(r => r.username === user.username);
          const entry = { username: user.username, department: user.department, elo: updatedUser.elo, wins: updatedUser.wins };
          if (existing >= 0) { const next = [...lb]; next[existing] = entry; return next.sort((a,b)=>b.elo-a.elo).slice(0,10); }
          return [...lb, entry].sort((a,b)=>b.elo-a.elo).slice(0,10);
        });
        return os;
      });
      return ms;
    });
  }, [user, opponent]);

  if (screen === "login") return (
    <div className="app">
      <div className="screen">
        <div className="logo">EduDuel</div>
        <div className="logo-sub">ACADEMIC COMBAT SYSTEM v2.0</div>
        <LoginForm onLogin={handleLogin} />
      </div>
    </div>
  );

  if (screen === "lobby") return (
    <div className="app">
      <nav className="nav">
        <span className="nav-logo">EduDuel</span>
        <div className="nav-user">
          <div className="pulse-dot"/>
          <span style={{fontFamily:"Share Tech Mono",fontSize:"0.8rem"}}>{user.username}</span>
        </div>
      </nav>
      <div className="screen" style={{paddingTop:80}}>
        <div className="lobby-grid">
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="panel">
              <div className="section-title">Combat Profile</div>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#0077aa,var(--accent))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.8rem",margin:"0 auto 12px",border:"3px solid var(--border)"}}>
                  {user.username[0].toUpperCase()}
                </div>
                <div style={{fontFamily:"Orbitron",fontWeight:700,fontSize:"1.2rem"}}>{user.username}</div>
                <div style={{color:"var(--muted)",fontSize:"0.85rem",marginTop:4}}>{user.department}</div>
              </div>
              <TierDisplay elo={user.elo} />
              <div style={{marginTop:16}}>
                {[["ELO Rating", user.elo],["Total Wins", user.wins || 0],["Matches", user.total_matches || 0]].map(([label, val]) => (
                  <div key={label} className="stat-row">
                    <span className="stat-label">{label}</span>
                    <span className="stat-value" style={{color:"var(--accent)"}}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={startMatchmaking}>⚡ Find Match</button>
            {user.is_admin && (
              <button className="btn btn-danger" onClick={() => setScreen("admin")}>🛠 Admin Panel</button>
            )}
            <button className="btn btn-ghost" onClick={()=>{setUser(null);setScreen("login");}}>Logout</button>
          </div>
          <div className="panel">
            <div className="section-title">
              <div className="pulse-dot"></div>
              ONLINE COMBATANTS ({Object.keys(onlineUsers).length})
            </div>
            <div className="leaderboard-list" style={{maxHeight: 300, overflowY: 'auto'}}>
              {Object.values(onlineUsers).map((u, i) => {
                const isMe = u.username === user.username;
                const statusColor = u.status === 'searching' ? 'var(--accent3)' : u.status === 'battling' ? 'var(--accent2)' : 'var(--muted)';
                return (
                  <div key={i} className="leaderboard-row" style={{opacity: 1, padding: '12px 0', borderBottom: '1px solid var(--border)'}}>
                    <div className="rank-num">
                      <div className="pulse-dot" style={{background: statusColor, boxShadow: `0 0 8px ${statusColor}`, animation: u.status === 'searching' ? 'pulseDot 1s ease-in-out infinite' : 'none'}} />
                    </div>
                    <div className="p-info">
                      <div style={{fontWeight:700,fontSize:"0.9rem",color: isMe ? 'var(--accent)' : 'var(--text)'}}>
                        {u.username} {isMe ? "(you)" : ""}
                      </div>
                      <div style={{fontSize:"0.7rem",color:"var(--muted)", display: 'flex', alignItems: 'center', gap: 6}}>
                        {u.department} · <span style={{color: statusColor, fontWeight: 700, fontSize: '0.65rem'}}>{u.status.toUpperCase()}</span>
                      </div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div style={{fontFamily:"Orbitron",fontWeight:700,fontSize:"0.8rem",color:"var(--accent)"}}>{u.elo}</div>
                      {u.status === 'searching' && !isMe && (
                        <button className="btn btn-primary" style={{padding: '4px 8px', fontSize: '0.6rem', marginTop: 4, height: 'auto'}} onClick={startMatchmaking}>JOIN</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="section-title">Global Leaderboard</div>
            {leaderboard.map((p,i) => {
              const tier = getTier(p.elo);
              const isMe = p.username === user.username;
              return (
                <div key={p.username} className="leaderboard-row" style={isMe?{background:"rgba(0,212,255,0.05)"}:{}}>
                  <span className={`rank-num ${i===0?"rank-1":i===1?"rank-2":i===2?"rank-3":""}`}>
                    {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                  </span>
                  <div>
                    <div style={{fontWeight:700,fontSize:"0.95rem",color:isMe?"var(--accent)":"var(--text)"}}>{p.username}{isMe?" (you)":""}</div>
                    <div style={{fontSize:"0.75rem",color:"var(--muted)"}}>{p.department}</div>
                  </div>
                  <span className="tier-badge" style={{background:`${tier.color}22`,color:tier.color,border:`1px solid ${tier.color}44`}}>{tier.name}</span>
                  <span style={{fontFamily:"Orbitron",fontWeight:700,fontSize:"0.9rem",color:"var(--accent)"}}>{p.elo}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === "admin") return (
    <div className="app">
      <nav className="nav">
        <span className="nav-logo">EduDuel Admin</span>
        <div className="nav-user">
          <span style={{fontFamily:"Share Tech Mono",fontSize:"0.8rem"}}>Super Admin Access</span>
        </div>
      </nav>
      <div className="screen" style={{paddingTop:80}}>
        <AdminDashboard onBack={() => setScreen("lobby")} />
      </div>
    </div>
  );

  if (screen === "matchmaking") {
    const steps = ["Scanning global queue...","Analyzing ELO brackets...","Opponent found!","Loading arena..."];
    const seekers = Object.values(onlineUsers).filter(u => u.status === 'searching' && u.username !== user.username);
    
    return (
      <div className="app">
        <div className="screen">
          <div style={{display:"flex",gap:24,maxWidth:900,width:"100%",alignItems:"flex-start"}}>
            <div className="panel" style={{textAlign:"center",flex:1}}>
              <div className="section-title" style={{justifyContent:"center"}}>Matchmaking</div>
              <div className="radar"><span style={{fontSize:"1.5rem"}}>🎯</span></div>
              {steps.map((s,i)=>(
                <div key={i} style={{padding:"10px 16px",margin:"6px 0",borderRadius:6,background:matchmakingStep>i?"rgba(0,212,255,0.1)":"transparent",border:`1px solid ${matchmakingStep>i?"var(--accent)":"var(--border)"}`,color:matchmakingStep>i?"var(--accent)":"var(--muted)",fontFamily:"Share Tech Mono",fontSize:"0.8rem",letterSpacing:"0.15em",transition:"all 0.3s",display:"flex",alignItems:"center",gap:10}}>
                  {matchmakingStep>i?"✓":matchmakingStep===i?"›":"○"} {s}
                </div>
              ))}
              {opponent && matchmakingStep >= 3 && (
                <div style={{marginTop:20,padding:16,background:"rgba(0,255,157,0.08)",border:"1px solid var(--accent3)",borderRadius:8}}>
                  <div style={{color:"var(--accent3)",fontFamily:"Share Tech Mono",fontSize:"0.7rem",letterSpacing:"0.2em",marginBottom:8}}>OPPONENT LOCKED</div>
                  <div style={{fontFamily:"Orbitron",fontWeight:700,fontSize:"1.1rem"}}>{opponent.username}</div>
                  <div style={{color:"var(--muted)",fontSize:"0.85rem"}}>{opponent.department} · ELO {opponent.elo}</div>
                </div>
              )}
            </div>
            
            <div className="panel" style={{width:300}}>
              <div className="section-title">Active Seekers</div>
              {seekers.length === 0 ? (
                <div style={{color:"var(--muted)",fontSize:"0.8rem",textAlign:"center",padding:"20px 0"}}>Waiting for more players...</div>
              ) : (
                <div className="leaderboard-list">
                  {seekers.map((u,i) => (
                    <div key={i} className="leaderboard-row" style={{borderBottom:"1px solid var(--border)"}}>
                      <div className="pulse-dot" style={{width:6,height:6}}/>
                      <div>
                        <div style={{fontWeight:700,fontSize:"0.85rem"}}>{u.username}</div>
                        <div style={{fontSize:"0.7rem",color:"var(--muted)"}}>{u.department}</div>
                      </div>
                      <div style={{fontFamily:"Orbitron",fontSize:"0.75rem",color:"var(--accent)"}}>{u.elo}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "battle") {
    const q = questions[qIndex] || null;
    const maxScore = Math.max(myScore, oppScore, 1);
    return (
      <div className="app">
        <div className={`feedback-toast ${feedback?"show":""} ${feedback?.type==="correct"?"correct-toast":"incorrect-toast"}`}>
          {feedback?.type==="correct" ? `✓ CORRECT! +${feedback.pts} pts${feedback.bonus?" ⚡ SPEED BONUS":""}` : "✗ INCORRECT"}
        </div>
        <div className="screen" style={{paddingTop:24,paddingBottom:24}}>
          {forfeit && (
            <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",animation:"fadeIn 0.5s"}}>
              <div style={{fontSize:"3rem",marginBottom:20}}>🏳️</div>
              <div style={{fontFamily:"Orbitron",fontSize:"1.5rem",color:"var(--accent2)",textAlign:"center",padding:"0 40px"}}>OPPONENT FORFEITED</div>
              <div style={{color:"var(--muted)",marginTop:10}}>Ending match in your favor...</div>
            </div>
          )}
          <div className="battle-screen">
            <div className="battle-header">
              <div className="player-bar">
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#0077aa,var(--accent))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.9rem",fontWeight:700}}>{user.username[0].toUpperCase()}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:"0.9rem"}}>{user.username}</div>
                    <div style={{fontSize:"0.7rem",color:"var(--muted)"}}>{getTier(user.elo).name}</div>
                  </div>
                </div>
                <div className="score-display" style={{color:"var(--accent)"}}>{myScore}</div>
                <div className="progress-track"><div className="progress-fill my-fill" style={{width:`${Math.min(100,(myScore/maxScore)*100)}%`}}/></div>
              </div>
              <div className="timer-block">
                <div style={{fontFamily:"Share Tech Mono",fontSize:"0.6rem",letterSpacing:"0.3em",color:"var(--muted)",marginBottom:4}}>⚡ DUEL</div>
                <div className={`timer-value ${timeLeft<=60?"urgent":""}`}>{formatTime(timeLeft)}</div>
                <div className="timer-label">REMAINING</div>
                <div style={{fontSize:"0.7rem",color:"var(--muted)",marginTop:6,fontFamily:"Share Tech Mono"}}>Q {qIndex+1}/{questions.length}</div>
              </div>
              <div className="player-bar opponent">
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,justifyContent:"flex-end"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"0.9rem"}}>{opponent?.username}</div>
                    <div style={{fontSize:"0.7rem",color:"var(--muted)"}}>{getTier(opponent?.elo||400).name}</div>
                  </div>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#aa0033,var(--accent2))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.9rem",fontWeight:700}}>{opponent?.username?.[0]?.toUpperCase()||"?"}</div>
                </div>
                <div className="score-display" style={{color:"var(--accent2)"}}>{oppScore}</div>
                <div className="progress-track"><div className="progress-fill opp-fill" style={{width:`${Math.min(100,(oppScore/maxScore)*100)}%`}}/></div>
              </div>
            </div>
            {loadingQ ? (
              <div className="panel">
                <div className="ai-loading">
                  <div className="dot-anim"><span/><span/><span/></div>
                  GENERATING QUESTIONS VIA AI...
                </div>
              </div>
            ) : q ? (
              <div className="q-card">
                <div className="q-meta">
                  <span className="q-tag">{q.subject||"GENERAL"}</span>
                  <span className="q-number">Q{qIndex+1} OF {questions.length}</span>
                </div>
                <div className="q-text">{q.q}</div>
                <div className="speed-bar-track"><div className="speed-bar-fill" style={{width:`${(qTimeLeft/Q_TIMER_DURATION)*100}%`}}/></div>
                <div style={{fontFamily:"Share Tech Mono",fontSize:"0.6rem",color:"var(--muted)",letterSpacing:"0.2em",marginTop:4,marginBottom:16}}>
                  {qTimeLeft > 10 ? `⚡ SPEED BONUS ACTIVE — ${qTimeLeft - 10}s` : "SPEED BONUS EXPIRED"}
                </div>
                <div className="options-grid">
                  {q.options.map((opt,i)=>{
                    let cls="option-btn";
                    if(selectedOpt!==null){ if(i===q.answer) cls+=" correct"; else if(i===selectedOpt&&selectedOpt!==q.answer) cls+=" incorrect"; }
                    return (
                      <button key={i} className={cls} disabled={selectedOpt!==null} onClick={()=>handleAnswer(i)}>
                        <span className="option-key">{["A","B","C","D"][i]}</span>{opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <button className="btn btn-ghost" style={{maxWidth:200,margin:"0 auto"}} onClick={endGame}>Forfeit Match</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "result" && matchResult) {
    const { won, draw, eloChange, myFinal, oppFinal } = matchResult;
    return (
      <div className="app">
        <div className="screen">
          <div className="panel" style={{maxWidth:560,width:"100%"}}>
            <div className="result-header">
              <div className={`result-title ${won?"win-title":draw?"draw-title":"lose-title"}`}>{won?"VICTORY":draw?"DRAW":"DEFEAT"}</div>
              <div className={`elo-change ${eloChange>=0?"elo-up":"elo-down"}`}>{eloChange>=0?"▲":"▼"} {Math.abs(eloChange)} ELO</div>
              <div style={{color:"var(--muted)",fontSize:"0.85rem",fontFamily:"Share Tech Mono",letterSpacing:"0.15em"}}>
                NEW RATING: <span style={{color:"var(--accent)",fontWeight:700}}>{user.elo}</span>
              </div>
              <div style={{marginTop:12}}><TierDisplay elo={user.elo}/></div>
            </div>
            <div className="stats-grid">
              <div className="stat-box"><div className="stat-box-val" style={{color:"var(--accent)"}}>{myFinal}</div><div className="stat-box-label">Your Score</div></div>
              <div className="stat-box"><div className="stat-box-val" style={{color:won?"var(--accent3)":"var(--accent2)"}}>{won?"WIN":draw?"DRAW":"LOSS"}</div><div className="stat-box-label">Result</div></div>
              <div className="stat-box"><div className="stat-box-val" style={{color:"var(--accent2)"}}>{oppFinal}</div><div className="stat-box-label">{opponent?.username}</div></div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <button className="btn btn-primary" onClick={startMatchmaking}>⚡ Find New Match</button>
              <button className="btn btn-ghost" onClick={()=>setScreen("lobby")}>Return to Lobby</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function TierDisplay({ elo }) {
  const tier = getTier(elo);
  const nextTier = TIERS[TIERS.indexOf(tier) + 1];
  const progress = nextTier ? ((elo - tier.min) / (tier.max - tier.min)) * 100 : 100;
  return (
    <div style={{textAlign:"center"}}>
      <span className="tier-badge" style={{background:`${tier.color}22`,color:tier.color,border:`1px solid ${tier.color}55`,fontSize:"0.9rem",padding:"6px 18px"}}>
        {tier.icon} {tier.name}
      </span>
      <div style={{marginTop:10}}>
        <div style={{display:"flex",justifyContent:"space-between",fontFamily:"Share Tech Mono",fontSize:"0.6rem",color:"var(--muted)",marginBottom:4}}>
          <span>{tier.min}</span><span>{nextTier?nextTier.min:"MAX"}</span>
        </div>
        <div style={{height:6,background:"rgba(255,255,255,0.05)",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min(100,progress)}%`,background:tier.color,borderRadius:3,transition:"width 1s ease"}}/>
        </div>
        <div style={{fontFamily:"Share Tech Mono",fontSize:"0.65rem",color:"var(--muted)",marginTop:4}}>
          {nextTier?`${nextTier.min-elo} ELO to ${nextTier.name}`:"MAX TIER REACHED"}
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onLogin }) {
  const [username, setUsername] = useState("");
  const [department, setDepartment] = useState("CSE");
  const [isNew, setIsNew] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!username.trim() || username.trim().length < 3) { setError("Username must be at least 3 characters"); return; }
    setError("");
    onLogin({ username: username.trim(), department, isNew });
  };

  return (
    <div className="panel" style={{maxWidth:400,width:"100%"}}>
      <div className="section-title">{isNew?"Create Account":"Login"}</div>
      <div className="field">
        <label>Username</label>
        <input value={username} onChange={e=>setUsername(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="Enter your callsign..." maxLength={20}/>
      </div>
      <div className="field">
        <label>Department</label>
        <select value={department} onChange={e=>setDepartment(e.target.value)}>
          {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {error && <div style={{color:"var(--accent2)",fontFamily:"Share Tech Mono",fontSize:"0.75rem",marginBottom:12}}>{error}</div>}
      <button className="btn btn-primary" onClick={handleSubmit} style={{marginBottom:12}}>{isNew?"⚡ Create & Enter":"⚡ Enter Arena"}</button>
      <button className="btn btn-ghost" onClick={()=>setIsNew(v=>!v)}>{isNew?"Already have an account? Login":"New player? Create account"}</button>
    </div>
  );
}

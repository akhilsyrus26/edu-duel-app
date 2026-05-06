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

const GAME_DURATION = 7 * 60; // 420 seconds
const SPEED_BONUS_WINDOW = 10;

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

    // Subscribe to real-time updates on the profiles table
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

  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [qTimeLeft, setQTimeLeft] = useState(SPEED_BONUS_WINDOW + 5);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [matchmakingStep, setMatchmakingStep] = useState(0);
  const [battleId, setBattleId] = useState(null);
  const [myRole, setMyRole] = useState(null); // 'A' or 'B'

  const timerRef = useRef(null);
  const qTimerRef = useRef(null);
  const matchmakingRef = useRef(null);
  const feedbackRef = useRef(null);

  const loadQuestions = async (dept) => {
    setLoadingQ(true);
    try {
      if (supabase) {
        // 1. Try to fetch questions for the EXACT department from Supabase
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
          setQuestions(formatted.sort(() => Math.random() - 0.5));
          setLoadingQ(false);
          return;
        }
      }
      
      // 2. If no DB questions, try to find EXACT department matches in SAMPLE_QUESTIONS
      let filteredSamples = SAMPLE_QUESTIONS.filter(q => q.subject === dept);
      
      // 3. If still no matches (for a new department), use general STEM samples as a final fallback
      if (filteredSamples.length === 0) {
        filteredSamples = SAMPLE_QUESTIONS.filter(q => q.subject === "CSE" || q.subject === "EEE");
      }

      setQuestions([...filteredSamples].sort(() => Math.random() - 0.5));
    } catch(e) {
      setQuestions([...SAMPLE_QUESTIONS].sort(() => Math.random() - 0.5));
    }
    setLoadingQ(false);
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

    if (!supabase) {
      const bot = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
      setOpponent({ username: bot, elo: user.elo + 50, department: user.department, is_bot: true });
      setScreen("matchmaking");
      setTimeout(() => startBattle(), 3000);
      return;
    }

    setScreen("matchmaking");
    setMatchmakingStep(0);
    // 1. Join the queue
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
            // We were matched! We are Player B
            setMyRole('B');
            fetchOpponentAndStart(payload.new.matched_with, payload.new.battle_id);
          }
        }
      )
      .subscribe();

    // 3. Try to find someone else already searching
    const findMatch = async () => {
      const { data: matches } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('status', 'searching')
        .neq('username', user.username)
        .eq('department', user.department)
        .order('created_at', { ascending: true })
        .limit(1);

      let opponentData = matches?.[0];

      if (!opponentData) {
        const { data: globalMatches } = await supabase
          .from('matchmaking_queue')
          .select('*')
          .eq('status', 'searching')
          .neq('username', user.username)
          .gte('elo', user.elo - 300)
          .lte('elo', user.elo + 300)
          .limit(1);
        opponentData = globalMatches?.[0];
      }

      if (opponentData) {
        const { error: lockError } = await supabase
          .from('matchmaking_queue')
          .update({ status: 'matched', matched_with: user.username })
          .eq('username', opponentData.username)
          .eq('status', 'searching');

        if (!lockError) {
          // Initialize the battle session
          const { data: battle, error: battleError } = await supabase
            .from('battles')
            .insert([{ player_a: user.username, player_b: opponentData.username }])
            .select()
            .single();

          if (!battleError) {
            // Update opponent first so they get the Battle ID
            await supabase
              .from('matchmaking_queue')
              .update({ status: 'matched', matched_with: user.username, battle_id: battle.id })
              .eq('username', opponentData.username);

            // Clean up our own queue entry immediately
            await supabase.from('matchmaking_queue').delete().eq('username', user.username);
            
            setMyRole('A');
            setBattleId(battle.id);
            setOpponent(opponentData);
            setMatchmakingStep(3);
            setTimeout(() => {
              supabase.removeChannel(channel);
              startBattle();
            }, 1000);
            return true;
          }
        }
      }
      return false;
    };

    const fetchOpponentAndStart = async (oppUsername, bId) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', oppUsername)
        .single();
      
      setBattleId(bId);
      setOpponent(profile || { username: oppUsername, elo: 400, department: 'Unknown' });
      setMatchmakingStep(3);
      
      // Clean up our own queue entry
      supabase.from('matchmaking_queue').delete().eq('username', user.username).then();

      setTimeout(() => {
        supabase.removeChannel(channel);
        startBattle();
      }, 1000);
    };

    // 4. Matchmaking Loop & Timeout
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      setMatchmakingStep(Math.min(2, Math.floor(attempts / 2)));
      
      const found = await findMatch();
      if (found) {
        clearInterval(interval);
      } else if (attempts >= 10) {
        // Fallback to bot after ~10 seconds
        clearInterval(interval);
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

  const startBattle = async () => {
    setMyScore(0); setOppScore(0); setQIndex(0);
    setSelectedOpt(null); setFeedback(null);
    setTimeLeft(GAME_DURATION); setQTimeLeft(SPEED_BONUS_WINDOW + 5);
    await loadQuestions(user.department);
    setScreen("battle");
  };

  // Sync scores in real-time during battle using Broadcast
  useEffect(() => {
    if (!supabase || !battleId || screen !== "battle" || !myRole) return;

    console.log(`Joining broadcast channel battle-${battleId} as Player ${myRole}`);
    const channel = supabase.channel(`battle-${battleId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'score_update' }, (payload) => {
        console.log("Broadcast received:", payload);
        if (payload.payload.role !== myRole) {
          setOppScore(payload.payload.score);
        }
      })
      .subscribe((status) => {
        console.log("Broadcast status:", status);
      });

    return () => supabase.removeChannel(channel);
  }, [screen, battleId, myRole]);

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
    if (screen !== "battle" || selectedOpt !== null) return;
    setQTimeLeft(SPEED_BONUS_WINDOW + 5);
    qTimerRef.current = setInterval(() => {
      setQTimeLeft(t => Math.max(0, t-1));
    }, 1000);
    return () => clearInterval(qTimerRef.current);
  }, [screen, qIndex, selectedOpt]);

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
    if (selectedOpt !== null) return;
    clearInterval(qTimerRef.current);
    setSelectedOpt(idx);
    const q = questions[qIndex];
    const correct = idx === q.answer;
    const speedBonus = qTimeLeft > (SPEED_BONUS_WINDOW + 5 - SPEED_BONUS_WINDOW);
    const isPlayerA = myRole === 'A';
    const scoreField = isPlayerA ? 'score_a' : 'score_b';
    
    if (correct) {
      const pts = 10 + (speedBonus ? 5 : 0);
      const newScore = myScore + pts;
      setMyScore(newScore);
      setFeedback({ type: "correct", bonus: speedBonus, pts });

      // Sync score via Real-time Broadcast (Fastest)
      if (supabase && battleId) {
        console.log(`Broadcasting score for Player ${myRole}: ${newScore}`);
        supabase.channel(`battle-${battleId}`).send({
          type: 'broadcast',
          event: 'score_update',
          payload: { role: myRole, score: newScore }
        });
        
        // Also update DB for persistence (in background)
        supabase.from('battles').update({ [scoreField]: newScore }).eq('id', battleId).then();
      }
    } else {
      setFeedback({ type: "incorrect", bonus: false, pts: 0 });
    }
    clearTimeout(feedbackRef.current);
    feedbackRef.current = setTimeout(() => {
      setFeedback(null); setSelectedOpt(null);
      setQIndex(i => (i + 1 >= questions.length ? 0 : i + 1));
    }, 1400);
  };

  const endGame = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(qTimerRef.current);
    setScreen("result");
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
    return (
      <div className="app">
        <div className="screen">
          <div className="panel" style={{textAlign:"center",maxWidth:400,width:"100%"}}>
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
                <div className="speed-bar-track"><div className="speed-bar-fill" style={{width:`${(qTimeLeft/(SPEED_BONUS_WINDOW+5))*100}%`}}/></div>
                <div style={{fontFamily:"Share Tech Mono",fontSize:"0.6rem",color:"var(--muted)",letterSpacing:"0.2em",marginTop:4,marginBottom:16}}>
                  {qTimeLeft>SPEED_BONUS_WINDOW?`⚡ SPEED BONUS ACTIVE — ${qTimeLeft-SPEED_BONUS_WINDOW}s`:"SPEED BONUS EXPIRED"}
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

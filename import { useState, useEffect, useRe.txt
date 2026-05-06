import { useState, useEffect, useRef, useCallback } from "react";

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #050a0f;
    --panel: #0a1520;
    --panel2: #0d1e2e;
    --border: #1a3a5c;
    --accent: #00d4ff;
    --accent2: #ff4d6d;
    --accent3: #00ff9d;
    --text: #c8e6f5;
    --muted: #4a7a9b;
    --gold: #f0b429;
  }

  body { background: var(--bg); font-family: 'Rajdhani', sans-serif; color: var(--text); }

  .app {
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 20% 50%, rgba(0,212,255,0.04) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(255,77,109,0.04) 0%, transparent 60%),
      var(--bg);
    background-attachment: fixed;
  }

  .app::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .screen {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .logo {
    font-family: 'Orbitron', monospace;
    font-weight: 900;
    font-size: clamp(2.5rem, 6vw, 4rem);
    letter-spacing: 0.1em;
    background: linear-gradient(135deg, var(--accent), var(--accent3));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: none;
    margin-bottom: 4px;
    animation: glowPulse 3s ease-in-out infinite;
  }
  .logo-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.4em;
    color: var(--muted);
    text-align: center;
    margin-bottom: 40px;
  }

  @keyframes glowPulse {
    0%,100% { filter: brightness(1); }
    50% { filter: brightness(1.3) drop-shadow(0 0 20px var(--accent)); }
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 32px;
    position: relative;
    overflow: hidden;
  }
  .panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: scanline 4s linear infinite;
  }
  @keyframes scanline {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
  .field label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .field input, .field select {
    background: rgba(0,0,0,0.4);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: 'Rajdhani', sans-serif;
    font-size: 1rem;
    font-weight: 600;
    padding: 12px 16px;
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
  }
  .field input:focus, .field select:focus { border-color: var(--accent); }
  .field select option { background: #0a1520; }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 28px;
    border-radius: 8px;
    font-family: 'Orbitron', monospace;
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    text-transform: uppercase;
    width: 100%;
  }
  .btn-primary {
    background: linear-gradient(135deg, #0077aa, var(--accent));
    color: #000;
    box-shadow: 0 0 20px rgba(0,212,255,0.3);
  }
  .btn-primary:hover { box-shadow: 0 0 30px rgba(0,212,255,0.6); transform: translateY(-1px); }
  .btn-danger {
    background: linear-gradient(135deg, #aa0033, var(--accent2));
    color: #fff;
    box-shadow: 0 0 20px rgba(255,77,109,0.3);
  }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

  .tier-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
  }

  .lobby-grid {
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: 20px;
    width: 100%;
    max-width: 900px;
  }
  @media(max-width:700px){ .lobby-grid { grid-template-columns:1fr; } }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid rgba(26,58,92,0.5);
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .stat-value {
    font-family: 'Orbitron', monospace;
    font-weight: 700;
    font-size: 1.1rem;
  }

  .leaderboard-row {
    display: grid;
    grid-template-columns: 30px 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid rgba(26,58,92,0.3);
    font-size: 0.9rem;
  }
  .leaderboard-row:last-child { border-bottom: none; }
  .rank-num {
    font-family: 'Share Tech Mono', monospace;
    color: var(--muted);
    font-size: 0.75rem;
    text-align: center;
  }
  .rank-1 { color: var(--gold); }
  .rank-2 { color: #c0c0c0; }
  .rank-3 { color: #cd7f32; }

  .radar {
    width: 80px; height: 80px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }
  .radar::before {
    content: '';
    position: absolute;
    width: 100%; height: 100%;
    border-radius: 50%;
    border: 2px solid var(--accent);
    animation: radarPing 1.5s ease-out infinite;
  }
  .radar::after {
    content: '';
    position: absolute;
    width: 100%; height: 100%;
    border-radius: 50%;
    border: 2px solid var(--accent);
    animation: radarPing 1.5s ease-out infinite 0.75s;
  }
  @keyframes radarPing {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(2); opacity: 0; }
  }

  .battle-screen {
    width: 100%;
    max-width: 860px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .battle-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    align-items: center;
  }

  .player-bar { display: flex; flex-direction: column; gap: 6px; }
  .player-bar.opponent { text-align: right; }

  .score-display {
    font-family: 'Orbitron', monospace;
    font-weight: 900;
    font-size: 2rem;
  }

  .progress-track {
    height: 8px;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  .my-fill { background: linear-gradient(90deg, #0077aa, var(--accent)); }
  .opp-fill { background: linear-gradient(90deg, #aa0033, var(--accent2)); }

  .timer-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .timer-value {
    font-family: 'Orbitron', monospace;
    font-weight: 900;
    font-size: 2.2rem;
    color: var(--accent3);
    line-height: 1;
  }
  .timer-value.urgent { color: var(--accent2); animation: blink 0.5s step-end infinite; }
  @keyframes blink { 50% { opacity: 0.3; } }
  .timer-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    color: var(--muted);
  }

  .q-card {
    background: var(--panel2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    position: relative;
  }
  .q-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .q-tag {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--muted);
    text-transform: uppercase;
  }
  .q-number {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    color: var(--muted);
  }
  .q-text {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.5;
    margin-bottom: 24px;
    color: #e8f4ff;
  }

  .options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media(max-width:500px){ .options-grid { grid-template-columns: 1fr; } }

  .option-btn {
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    font-family: 'Rajdhani', sans-serif;
    font-size: 1rem;
    font-weight: 600;
    padding: 14px 16px;
    text-align: left;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .option-btn:hover:not(:disabled) {
    border-color: var(--accent);
    background: rgba(0,212,255,0.08);
    transform: translateX(4px);
  }
  .option-btn.correct {
    border-color: var(--accent3);
    background: rgba(0,255,157,0.15);
    color: var(--accent3);
  }
  .option-btn.incorrect {
    border-color: var(--accent2);
    background: rgba(255,77,109,0.15);
    color: var(--accent2);
  }
  .option-btn:disabled { cursor: default; }
  .option-key {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: var(--muted);
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
    padding: 2px 6px;
    flex-shrink: 0;
  }

  .feedback-toast {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(-20px);
    padding: 12px 28px;
    border-radius: 8px;
    font-family: 'Orbitron', monospace;
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: 0.1em;
    opacity: 0;
    pointer-events: none;
    z-index: 999;
    transition: all 0.3s;
  }
  .feedback-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .feedback-toast.correct-toast {
    background: rgba(0,255,157,0.2);
    border: 1px solid var(--accent3);
    color: var(--accent3);
  }
  .feedback-toast.incorrect-toast {
    background: rgba(255,77,109,0.2);
    border: 1px solid var(--accent2);
    color: var(--accent2);
  }

  .speed-bar-track {
    height: 4px;
    background: rgba(255,255,255,0.05);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 12px;
  }
  .speed-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 1s linear;
    background: linear-gradient(90deg, var(--accent3), var(--gold), var(--accent2));
  }

  .result-header {
    text-align: center;
    margin-bottom: 32px;
  }
  .result-title {
    font-family: 'Orbitron', monospace;
    font-weight: 900;
    font-size: 3rem;
    letter-spacing: 0.1em;
  }
  .win-title { color: var(--accent3); text-shadow: 0 0 30px rgba(0,255,157,0.5); }
  .lose-title { color: var(--accent2); text-shadow: 0 0 30px rgba(255,77,109,0.5); }
  .draw-title { color: var(--gold); text-shadow: 0 0 30px rgba(240,180,41,0.5); }

  .elo-change {
    font-family: 'Orbitron', monospace;
    font-weight: 700;
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 12px 0;
  }
  .elo-up { color: var(--accent3); }
  .elo-down { color: var(--accent2); }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  @media(max-width:500px){ .stats-grid { grid-template-columns: 1fr; } }

  .stat-box {
    background: var(--panel2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .stat-box-val {
    font-family: 'Orbitron', monospace;
    font-weight: 700;
    font-size: 1.6rem;
    color: var(--accent);
  }
  .stat-box-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: var(--muted);
    text-transform: uppercase;
    margin-top: 4px;
  }

  .ai-loading {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: center;
    padding: 40px;
    color: var(--muted);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    letter-spacing: 0.2em;
  }
  .dot-anim span {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    margin: 0 2px;
    animation: dotBounce 1.2s ease-in-out infinite;
  }
  .dot-anim span:nth-child(2) { animation-delay: 0.2s; }
  .dot-anim span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dotBounce {
    0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  .nav {
    position: fixed; top: 0; left: 0; right: 0;
    height: 56px;
    background: rgba(5,10,15,0.9);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    z-index: 100;
  }
  .nav-logo {
    font-family: 'Orbitron', monospace;
    font-weight: 900;
    font-size: 1.1rem;
    background: linear-gradient(135deg, var(--accent), var(--accent3));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .nav-user {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9rem;
  }

  .section-title {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.3em;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .pulse-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--accent3);
    box-shadow: 0 0 6px var(--accent3);
    animation: pulseDot 2s ease-in-out infinite;
  }
  @keyframes pulseDot {
    0%,100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }
`;

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
  const [qTimeLeft, setQTimeLeft] = useState(SPEED_BONUS_WINDOW + 5);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [matchmakingStep, setMatchmakingStep] = useState(0);

  const timerRef = useRef(null);
  const qTimerRef = useRef(null);
  const matchmakingRef = useRef(null);
  const feedbackRef = useRef(null);

  const loadQuestions = async (dept) => {
    setLoadingQ(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Generate 15 multiple-choice trivia questions for a competitive academic game. Mix general STEM topics with some specific to "${dept}". For each question: make it challenging but fair (undergraduate level). Respond ONLY with a JSON array, no markdown, no explanation. Format: [{"q":"question text","options":["A","B","C","D"],"answer":0,"subject":"topic"}] where answer is the 0-based index of the correct option.`
          }]
        })
      });
      const data = await res.json();
      const raw = data.content[0].text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw);
      setQuestions(parsed.slice(0,15));
    } catch(e) {
      setQuestions([...SAMPLE_QUESTIONS].sort(()=>Math.random()-0.5));
    }
    setLoadingQ(false);
  };

  const handleLogin = async ({username, department, isNew}) => {
    const savedUsers = JSON.parse(localStorage.getItem("edu_users")||"{}");
    let u;
    if(isNew) {
      u = { username, department, elo: 400, wins: 0, losses: 0, totalMatches: 0 };
      savedUsers[username] = u;
    } else {
      u = savedUsers[username] || { username, department, elo: 400, wins: 0, losses: 0, totalMatches: 0 };
    }
    localStorage.setItem("edu_users", JSON.stringify(savedUsers));
    setUser(u);
    setScreen("lobby");
  };

  const startMatchmaking = async () => {
    setScreen("matchmaking");
    setMatchmakingStep(0);
    const bot = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
    const botElo = user.elo + Math.floor((Math.random()-0.5)*300);
    setOpponent({ username: bot, elo: Math.max(100, botElo), department: DEPARTMENTS[Math.floor(Math.random()*DEPARTMENTS.length)] });
    let i = 0;
    matchmakingRef.current = setInterval(()=>{
      i++;
      setMatchmakingStep(i);
      if(i >= 4) {
        clearInterval(matchmakingRef.current);
        setTimeout(() => startBattle(), 800);
      }
    }, 900);
  };

  const startBattle = async () => {
    setMyScore(0); setOppScore(0); setQIndex(0);
    setSelectedOpt(null); setFeedback(null);
    setTimeLeft(GAME_DURATION); setQTimeLeft(SPEED_BONUS_WINDOW + 5);
    await loadQuestions(user.department);
    setScreen("battle");
  };

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
    if (screen !== "battle" || !questions.length) return;
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
    if (correct) {
      const pts = 10 + (speedBonus ? 5 : 0);
      setMyScore(s => s + pts);
      setFeedback({ type: "correct", bonus: speedBonus, pts });
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
          totalMatches: (user.totalMatches||0)+1,
        };
        const savedUsers = JSON.parse(localStorage.getItem("edu_users")||"{}");
        savedUsers[user.username] = updatedUser;
        localStorage.setItem("edu_users", JSON.stringify(savedUsers));
        setUser(updatedUser);
        setMatchResult({ won, draw, eloChange, myFinal: ms, oppFinal: os });
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
    <>
      <style>{styles}</style>
      <div className="app">
        <div className="screen">
          <div className="logo">EduDuel</div>
          <div className="logo-sub">ACADEMIC COMBAT SYSTEM v2.0</div>
          <LoginForm onLogin={handleLogin} />
        </div>
      </div>
    </>
  );

  if (screen === "lobby") return (
    <>
      <style>{styles}</style>
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
                  {[["ELO Rating", user.elo],["Total Wins", user.wins || 0],["Matches", user.totalMatches || 0]].map(([label, val]) => (
                    <div key={label} className="stat-row">
                      <span className="stat-label">{label}</span>
                      <span className="stat-value" style={{color:"var(--accent)"}}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={startMatchmaking}>⚡ Find Match</button>
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
    </>
  );

  if (screen === "matchmaking") {
    const steps = ["Scanning global queue...","Analyzing ELO brackets...","Opponent found!","Loading arena..."];
    return (
      <>
        <style>{styles}</style>
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
      </>
    );
  }

  if (screen === "battle") {
    const q = questions[qIndex] || null;
    const maxScore = Math.max(myScore, oppScore, 1);
    return (
      <>
        <style>{styles}</style>
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
      </>
    );
  }

  if (screen === "result" && matchResult) {
    const { won, draw, eloChange, myFinal, oppFinal } = matchResult;
    return (
      <>
        <style>{styles}</style>
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
      </>
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
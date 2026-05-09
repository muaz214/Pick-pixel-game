import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, RefreshCw, Play, AlertTriangle } from 'lucide-react';

// --- Constants & Utilities ---

const INITIAL_TIME = 10;
const MAX_GRID_SIZE = 60; // Increased for even smaller pixels

// --- Audio Service ---

let audioContext: AudioContext | null = null;

const initAudio = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

const playSound = (freq: number, type: OscillatorType, duration: number, volume: number = 0.1) => {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio not supported or blocked', e);
  }
};

const sounds = {
  correct: () => playSound(880, 'sine', 0.1, 0.05),
  wrong: () => {
    playSound(150, 'sawtooth', 0.4, 0.05);
    playSound(100, 'sawtooth', 0.4, 0.05);
  },
  start: () => {
    playSound(440, 'sine', 0.15, 0.05);
    setTimeout(() => playSound(554.37, 'sine', 0.15, 0.05), 100);
    setTimeout(() => playSound(659.25, 'sine', 0.15, 0.05), 200);
  }
};

// --- Utilities ---

const generateColor = () => {
  const h = Math.floor(Math.random() * 360);
  const s = Math.floor(Math.random() * 40) + 40; // 40-80%
  const l = Math.floor(Math.random() * 30) + 40; // 40-70%
  return { h, s, l };
};

const getOddColor = ({ h, s, l }: { h: number; s: number; l: number }, level: number) => {
  // Start with a slightly larger difference (25) and decrease more slowly (0.4 per level)
  // Ensure a minimum floor of 4 so it never becomes truly impossible
  const diff = Math.max(4, 25 - (level * 0.4));
  
  const r = Math.random();
  if (r < 0.25) {
    // Shift Hue (creates a slight temperature/tint difference)
    const hShift = Math.random() > 0.5 ? diff : -diff;
    return `hsl(${(h + hShift + 360) % 360}, ${s}%, ${l}%)`;
  } else if (r < 0.6) {
    // Shift Saturation
    const sShift = Math.random() > 0.5 ? diff : -diff;
    const finalS = Math.min(100, Math.max(0, s + sShift));
    return `hsl(${h}, ${finalS}%, ${l}%)`;
  } else {
    // Shift Lightness
    const lShift = Math.random() > 0.5 ? diff : -diff;
    const finalL = Math.min(100, Math.max(0, l + lShift));
    return `hsl(${h}, ${s}%, ${finalL}%)`;
  }
};

type GameStatus = 'idle' | 'playing' | 'gameOver';

export default function App() {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('pick_pixel_high_score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isWrong, setIsWrong] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('pick_pixel_high_score', highScore.toString());
  }, [highScore]);

  // Derived state for the current level
  const gridSize = useMemo(() => {
    // Grow every level: 2x2, 3x3, 4x4, 5x5...
    return Math.min(MAX_GRID_SIZE, level + 1);
  }, [level]);

  const colors = useMemo(() => {
    const base = generateColor();
    const odd = getOddColor(base, level);
    const baseColorStr = `hsl(${base.h}, ${base.s}%, ${base.l}%)`;
    
    const count = gridSize * gridSize;
    const oddIndex = Math.floor(Math.random() * count);
    
    return {
      items: Array.from({ length: count }, (_, i) => i === oddIndex ? odd : baseColorStr),
      oddIndex
    };
  }, [level, gridSize]);

  // --- Handlers ---

  const startGame = () => {
    initAudio(); // Initialize audio on user gesture
    sounds.start();
    setLevel(1);
    setScore(0);
    setTimeLeft(INITIAL_TIME);
    setStatus('playing');
  };

  const handlePick = (index: number) => {
    if (status !== 'playing') return;

    if (index === colors.oddIndex) {
      // Correct!
      sounds.correct();
      setScore(prev => prev + 1);
      setLevel(prev => prev + 1);
      setTimeLeft(INITIAL_TIME); // Reset to 10s for each level
    } else {
      // Wrong pick is GAME OVER
      sounds.wrong();
      setIsWrong(true);
      setTimeout(() => setIsWrong(false), 400);
      setStatus('gameOver');
      setHighScore(prev => Math.max(prev, score));
    }
  };

  // --- Effects ---

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'playing') {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            sounds.wrong();
            setStatus('gameOver');
            setHighScore(current => Math.max(current, score));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, score]);

  // --- Render Components ---

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans flex flex-col items-center justify-center p-4 select-none overflow-hidden">
      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center"
          >
            <h1 className="text-5xl font-black mb-3 tracking-tighter text-emerald-400 uppercase italic">
              Pick Pixel
            </h1>
            <p className="text-neutral-500 mb-10 leading-relaxed font-semibold uppercase tracking-[0.3em] text-[10px]">
              Catch the odd pixel
            </p>
            <button
              onClick={startGame}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-900 px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-500/10 active:scale-95 transition-all flex items-center gap-3 mx-auto uppercase tracking-tight"
            >
              <Play size={22} fill="currentColor" />
              Start Game
            </button>
          </motion.div>
        )}

        {status === 'playing' && (
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-xl flex flex-col gap-8"
          >
            {/* Header Stats */}
            <div className="flex justify-between items-center">
              {/* Timer on Left */}
              <div className="flex flex-col items-start translate-y-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-neutral-500 mb-1 ml-1">Time</span>
                <div className={`px-4 py-2 rounded-xl flex items-center justify-center min-w-[90px] gap-2 border transition-all duration-300 ${timeLeft <= 3 ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse scale-110' : 'bg-neutral-800/80 border-neutral-700/50 text-emerald-400'}`}>
                  <Timer size={18} className={timeLeft <= 3 ? 'animate-bounce' : ''} />
                  <span className="font-mono text-3xl font-black tabular-nums tracking-tighter">
                    {timeLeft.toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
              
              {/* Score on Right */}
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-1 mr-1">Points</span>
                <div className="bg-neutral-800/80 border border-neutral-700/50 px-5 py-2 rounded-xl flex flex-col items-end min-w-[100px]">
                  <motion.span 
                    key={score}
                    initial={{ scale: 1.2, color: '#34d399' }}
                    animate={{ scale: 1, color: '#f5f5f5' }}
                    transition={{ duration: 0.3 }}
                    className="text-3xl font-black tabular-nums tracking-tight leading-none"
                  >
                    {score}
                  </motion.span>
                </div>
              </div>
            </div>

            {/* Game Grid */}
            <motion.div 
              animate={isWrong ? { x: [-10, 10, -10, 10, 0] } : {}}
              className="aspect-square w-full bg-neutral-800/50 rounded-[2rem] p-4 shadow-2xl backdrop-blur-sm border border-neutral-700/30"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gap: `${Math.max(1, 8 - (gridSize / 4))}px`
              }}
            >
              {colors.items.map((color, i) => (
                <motion.button
                  key={`${level}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ 
                    duration: 0.05,
                    ease: "linear"
                  }}
                  onClick={() => handlePick(i)}
                  className="w-full h-full rounded-sm shadow-sm active:scale-90 transition-transform cursor-pointer"
                  style={{ backgroundColor: color }}
                  whileHover={{ filter: 'brightness(1.15)', scale: 1.05, zIndex: 10 }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}

        {status === 'gameOver' && (
          <motion.div
            key="gameOver"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs text-center"
          >
            <div className="bg-neutral-800/90 border border-neutral-700/50 p-6 rounded-3xl backdrop-blur-xl shadow-2xl">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tight text-neutral-100">
                  {timeLeft <= 0 ? "Time's Up" : "Game Over"}
                </h2>
                <div className="h-px w-12 bg-emerald-500 mx-auto mt-2" />
              </div>
              
              {/* Scores */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center px-4 py-3 bg-neutral-900/50 rounded-xl border border-neutral-700/30">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Your Score</span>
                  <span className="text-2xl font-black text-emerald-400 tabular-nums">{score}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-neutral-900/50 rounded-xl border border-neutral-700/30">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Highest Score</span>
                  <span className="text-xl font-black text-neutral-300 tabular-nums">{highScore}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={startGame}
                  className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-900 py-3 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                >
                  <RefreshCw size={16} />
                  PLAY AGAIN
                </button>
                <button
                  onClick={() => setStatus('idle')}
                  className="text-neutral-500 hover:text-neutral-300 text-[10px] font-bold uppercase tracking-widest py-2 transition-colors"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating background elements for polish */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, ChevronRight, Pause, X, ArrowLeft, Dice5, User, Bot, Sparkles, HelpCircle, Info } from 'lucide-react';
import { db, collection, setDoc, doc, serverTimestamp, OperationType, handleFirestoreError } from '../firebase';
import { soundService } from '../lib/soundService';

const GRID_SIZE = 10;
const TOTAL_SQUARES = GRID_SIZE * GRID_SIZE;

const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91
};

const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 18, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78
};

type GameStatus = 'START' | 'PLAYING' | 'GAMEOVER';
type PlayerType = 'MANUAL';

interface Player {
  id: number;
  name: string;
  type: PlayerType;
  position: number; // 1 to 100
  color: string;
  targetPosition: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface SnakesAndLaddersProps {
  onBack: () => void;
  user: any;
  onGameEnd?: (score: number, playtime: number) => void;
}

export default function SnakesAndLadders({ onBack, user, onGameEnd }: SnakesAndLaddersProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeImgsRef = useRef<HTMLImageElement[]>([]);
  const [status, setStatus] = useState<GameStatus>('START');
  const [highScore, setHighScore] = useState(0);
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: user?.username || 'Player 1', type: 'MANUAL', position: 1, targetPosition: 1, color: '#4f46e5' },
    { id: 2, name: 'Player 2', type: 'MANUAL', position: 1, targetPosition: 1, color: '#ef4444' }
  ]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [message, setMessage] = useState('Welcome to Mars Snakes & Ladders!');
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const savedHighScore = localStorage.getItem('snakesAndLaddersHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));
    
    // Load multiple snake images for variety
    const urls = [
      'https://img.icons8.com/color/96/snake.png',
      'https://img.icons8.com/color/96/cobra.png',
      'https://img.icons8.com/color/96/python.png'
    ];
    
    urls.forEach(url => {
      const img = new Image();
      img.src = url;
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        snakeImgsRef.current.push(img);
      };
    });
  }, []);
  
  const gameState = useRef({
    particles: [] as Particle[],
    shake: 0,
    lastFrameTime: 0,
    startTime: 0,
    isMoving: false,
    playerVisuals: [
      { pos: 1, currentSquare: 1 },
      { pos: 1, currentSquare: 1 }
    ]
  });

  const getSquarePos = (square: number) => {
    const zeroIndexed = square - 1;
    const row = Math.floor(zeroIndexed / GRID_SIZE);
    let col = zeroIndexed % GRID_SIZE;
    
    // Boustrophedon (snake-like) grid
    if (row % 2 !== 0) {
      col = (GRID_SIZE - 1) - col;
    }
    
    return { row, col };
  };

  const spawnParticles = (x: number, y: number, color: string, count = 20) => {
    for (let i = 0; i < count; i++) {
      gameState.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color
      });
    }
  };

  const rollDice = async () => {
    if (isRolling || gameState.current.isMoving || status !== 'PLAYING') return;
    
    soundService.play('click');
    setIsRolling(true);
    setMessage(`${players[currentPlayerIndex].name} is rolling...`);
    
    // Dice animation
    for (let i = 0; i < 12; i++) {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      if (i % 3 === 0) soundService.play('move');
      await new Promise(r => setTimeout(r, 60));
    }
    
    const roll = Math.floor(Math.random() * 6) + 1;
    setDiceValue(roll);
    setIsRolling(false);
    
    movePlayer(currentPlayerIndex, roll);
  };

  const movePlayer = async (playerIdx: number, steps: number) => {
    gameState.current.isMoving = true;
    const player = players[playerIdx];
    let currentPos = player.position;
    const targetPos = Math.min(TOTAL_SQUARES, currentPos + steps);
    
    setMessage(`${player.name} rolled a ${steps}!`);

    // Step by step movement
    for (let i = currentPos + 1; i <= targetPos; i++) {
      setPlayers(prev => prev.map((p, idx) => idx === playerIdx ? { ...p, position: i } : p));
      soundService.play('move');
      await new Promise(r => setTimeout(r, 300)); // Slightly slower for better visual tracking
    }
    
    currentPos = targetPos;
    await new Promise(r => setTimeout(r, 200)); // Pause at destination

    // Check for win
    if (currentPos === TOTAL_SQUARES) {
      setWinner(player);
      setStatus('GAMEOVER');
      setMessage(`${player.name} Wins!`);
      spawnParticles(300, 300, player.color, 100);
      soundService.play('score');
      
      if (player.type === 'PLAYER') {
        const newHighScore = highScore + 1;
        setHighScore(newHighScore);
        localStorage.setItem('snakesAndLaddersHighScore', newHighScore.toString());
        
        const playtime = Math.floor((performance.now() - gameState.current.startTime) / 1000);
        onGameEnd?.(500, playtime); // Fixed win score
        
        // Save score to Firestore
        try {
          await setDoc(doc(collection(db, 'scores')), {
            userId: user.uid,
            username: user.username,
            gameId: 'SNAKES_AND_LADDERS',
            score: 500,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'scores');
        }
      }
      gameState.current.isMoving = false;
      return;
    }

    // Check for ladders
    if (LADDERS[currentPos]) {
      const endPos = LADDERS[currentPos];
      setMessage(`${player.name} climbed a ladder to ${endPos}!`);
      spawnParticles(300, 300, '#4ade80', 40);
      soundService.play('success');
      await new Promise(r => setTimeout(r, 500));
      setPlayers(prev => prev.map((p, idx) => idx === playerIdx ? { ...p, position: endPos } : p));
      currentPos = endPos;
    } 
    // Check for snakes
    else if (SNAKES[currentPos]) {
      const endPos = SNAKES[currentPos];
      setMessage(`${player.name} was bitten by a snake! Down to ${endPos}.`);
      gameState.current.shake = 15;
      spawnParticles(300, 300, '#ef4444', 40);
      soundService.play('fail');
      await new Promise(r => setTimeout(r, 500));
      setPlayers(prev => prev.map((p, idx) => idx === playerIdx ? { ...p, position: endPos } : p));
      currentPos = endPos;
    }

    gameState.current.isMoving = false;
    
    // Switch turn
    const nextIdx = (playerIdx + 1) % players.length;
    setCurrentPlayerIndex(nextIdx);
  };

  const startGame = () => {
    soundService.play('click');
    setPlayers([
      { id: 1, name: user?.username || 'Player 1', type: 'MANUAL', position: 1, targetPosition: 1, color: '#4f46e5' },
      { id: 2, name: 'Player 2', type: 'MANUAL', position: 1, targetPosition: 1, color: '#ef4444' }
    ]);
    gameState.current.playerVisuals = [
      { pos: 1, currentSquare: 1 },
      { pos: 1, currentSquare: 1 }
    ];
    setCurrentPlayerIndex(0);
    setWinner(null);
    setStatus('PLAYING');
    setMessage('Game Started! Your turn.');
    gameState.current.startTime = performance.now();
  };

  const getSquarePosVisual = (square: number) => {
    const zeroIndexed = Math.max(0, square - 1);
    const row = Math.floor(zeroIndexed / GRID_SIZE);
    let col = zeroIndexed % GRID_SIZE;
    
    // Boustrophedon (snake-like) grid
    if (row % 2 !== 0) {
      col = (GRID_SIZE - 1) - col;
    }
    
    return { row, col };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const update = () => {
      const now = performance.now();
      const dt = (now - gameState.current.lastFrameTime) / 16.67;
      gameState.current.lastFrameTime = now;

      // Update particles
      for (let i = gameState.current.particles.length - 1; i >= 0; i--) {
        const p = gameState.current.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) gameState.current.particles.splice(i, 1);
      }

      // Update player visual positions for smooth interpolation
      players.forEach((p, idx) => {
        const visual = gameState.current.playerVisuals[idx];
        const target = p.position;
        const diff = target - visual.pos;
        
        if (Math.abs(diff) > 0.01) {
          visual.pos += diff * 0.15 * dt;
        } else {
          visual.pos = target;
        }
      });

      // Update shake
      if (gameState.current.shake > 0) {
        gameState.current.shake *= 0.9;
        if (gameState.current.shake < 0.1) gameState.current.shake = 0;
      }

      draw();
      animationId = requestAnimationFrame(update);
    };

    const draw = () => {
      ctx.save();
      if (gameState.current.shake > 0) {
        ctx.translate((Math.random() - 0.5) * gameState.current.shake, (Math.random() - 0.5) * gameState.current.shake);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cellSize = canvas.width / GRID_SIZE;

      // Draw Grid
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const squareNum = (r * GRID_SIZE) + (r % 2 === 0 ? c + 1 : GRID_SIZE - c);
          const x = c * cellSize;
          const y = canvas.height - (r + 1) * cellSize;
          
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.strokeRect(x, y, cellSize, cellSize);
          
          // Glowing effect for special squares
          if (LADDERS[squareNum]) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.1)';
            ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          } else if (SNAKES[squareNum]) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
            ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.font = '10px font-sans';
          ctx.fillText(squareNum.toString(), x + 5, y + 15);
        }
      }

      // Draw Snakes & Ladders
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';

      // Ladders
      Object.entries(LADDERS).forEach(([from, to]) => {
        const start = getSquarePos(parseInt(from));
        const end = getSquarePos(to);
        const sx = start.col * cellSize + cellSize / 2;
        const sy = canvas.height - (start.row + 1) * cellSize + cellSize / 2;
        const ex = end.col * cellSize + cellSize / 2;
        const ey = canvas.height - (end.row + 1) * cellSize + cellSize / 2;

        // Draw ladder rails
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        ctx.setLineDash([]);
        
        const dx = ex - sx;
        const dy = ey - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / dist * 8;
        const perpY = dx / dist * 8;

        ctx.beginPath();
        ctx.moveTo(sx + perpX, sy + perpY);
        ctx.lineTo(ex + perpX, ey + perpY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sx - perpX, sy - perpY);
        ctx.lineTo(ex - perpX, ey - perpY);
        ctx.stroke();

        // Draw rungs
        ctx.lineWidth = 2;
        const rungs = 8;
        for (let i = 1; i < rungs; i++) {
          const rx = sx + (dx * i / rungs);
          const ry = sy + (dy * i / rungs);
          ctx.beginPath();
          ctx.moveTo(rx + perpX, ry + perpY);
          ctx.lineTo(rx - perpX, ry - perpY);
          ctx.stroke();
        }
        ctx.lineWidth = 6;
      });

      // Snakes
      Object.entries(SNAKES).forEach(([from, to]) => {
        const start = getSquarePos(parseInt(from));
        const end = getSquarePos(to);
        const sx = start.col * cellSize + cellSize / 2;
        const sy = canvas.height - (start.row + 1) * cellSize + cellSize / 2;
        const ex = end.col * cellSize + cellSize / 2;
        const ey = canvas.height - (end.row + 1) * cellSize + cellSize / 2;

        const dx = ex - sx;
        const dy = ey - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Draw snake body with a bezier curve
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        
        const midX = (sx + ex) / 2;
        const midY = (sy + ey) / 2;
        const offset = Math.sin(performance.now() / 500) * 20;
        const perpX = -dy / dist * offset;
        const perpY = dx / dist * offset;
        
        ctx.bezierCurveTo(sx + perpX, sy + perpY, midX - perpX, midY - perpY, ex, ey);
        
        // Add some "scales" or texture to the body
        ctx.setLineDash([10, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 4;
        ctx.stroke();

        if (snakeImgsRef.current.length > 0) {
          // Use the 'from' square number to pick a consistent image for this snake's head
          const imgIdx = parseInt(from) % snakeImgsRef.current.length;
          const snakeImg = snakeImgsRef.current[imgIdx];

          // Draw head
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle + Math.PI); // Face towards the start
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
          ctx.drawImage(snakeImg, -20, -20, 40, 40);
          ctx.restore();
        }
        ctx.restore();
      });

      // Draw Players
      players.forEach((p, idx) => {
        const visual = gameState.current.playerVisuals[idx];
        const pos = getSquarePosVisual(visual.pos);
        let x = pos.col * cellSize + cellSize / 2;
        let y = canvas.height - (pos.row + 1) * cellSize + cellSize / 2;

        // Offset players if they are on the same square (visually)
        const otherVisual = gameState.current.playerVisuals[1 - idx];
        if (Math.abs(visual.pos - otherVisual.pos) < 0.5) {
          x += (idx === 0 ? -12 : 12);
        }

        // Bounce animation when moving
        const isCurrentPlayer = currentPlayerIndex === idx;
        const bounce = (gameState.current.isMoving && isCurrentPlayer) ? Math.abs(Math.sin(performance.now() / 150)) * 15 : 0;

        ctx.save();
        ctx.translate(x, y - bounce);
        
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = p.color;
        
        // Draw player token (astronaut helmet shape)
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Helmet visor
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, -2, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Player indicator for current turn
        if (isCurrentPlayer && status === 'PLAYING') {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 20 + Math.sin(performance.now() / 200) * 5, 0, Math.PI * 2);
          ctx.stroke();
          
          // Floating arrow
          const arrowY = -30 + Math.sin(performance.now() / 200) * 5;
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.moveTo(0, arrowY + 5);
          ctx.lineTo(-5, arrowY);
          ctx.lineTo(5, arrowY);
          ctx.fill();
        }
        
        ctx.restore();
      });

      // Draw Particles
      gameState.current.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [players, currentPlayerIndex, status]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-[600px] flex justify-between items-end mb-6 z-10">
        <div className="flex flex-col gap-2">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold mb-2"
          >
            <ArrowLeft size={14} /> Back to Hub
          </button>
          <h1 className="text-3xl font-black tracking-tighter uppercase">Snakes & Ladders</h1>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{message}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Wins</div>
          <div className="text-xl font-black text-indigo-400">{highScore}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-2">Current Turn</div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: players[currentPlayerIndex].color }} />
            <span className="font-black text-sm">{players[currentPlayerIndex].name}</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 bg-white/5 p-4 rounded-[32px] border border-white/10 backdrop-blur-xl shadow-2xl">
        <canvas 
          ref={canvasRef}
          width={500}
          height={500}
          className="rounded-2xl bg-black/40"
        />

        <AnimatePresence>
          {status === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-[32px] z-20"
            >
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-600/40">
                  < Dice5 size={40} className="text-white" />
                </div>
                <h2 className="text-4xl font-black tracking-tighter mb-4 uppercase">Mars Expedition</h2>
                <p className="text-white/40 text-sm font-medium mb-8 max-w-xs mx-auto">Race to the finish line! Watch out for Martian sand-snakes and use the gravity-ladders to boost ahead.</p>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={startGame}
                    className="px-12 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all active:scale-95 flex items-center gap-3 mx-auto"
                  >
                    <Play size={20} fill="currentColor" /> Start Race
                  </button>
                  <button 
                    onClick={() => setShowTutorial(true)}
                    className="px-12 py-4 bg-white/10 text-white font-black rounded-2xl hover:bg-white/20 transition-all active:scale-95 flex items-center gap-3 mx-auto"
                  >
                    <HelpCircle size={20} /> How to Play
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {showTutorial && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md rounded-[32px] z-30 p-6 overflow-y-auto"
            >
              <div className="text-left w-full max-w-md">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Mission Briefing</h3>
                  <button onClick={() => setShowTutorial(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center shrink-0">
                      <Trophy size={20} className="text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm uppercase mb-1">The Objective</h4>
                      <p className="text-white/60 text-xs leading-relaxed">Be the first explorer to reach square 100 on the Martian surface. You must land exactly on 100 to win!</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-green-600/20 rounded-xl flex items-center justify-center shrink-0">
                      <ChevronRight size={20} className="text-green-400 rotate-[-90deg]" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm uppercase mb-1 text-green-400">Gravity Ladders</h4>
                      <p className="text-white/60 text-xs leading-relaxed">Landing on the base of a green ladder will boost you up to a higher square instantly.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-red-600/20 rounded-xl flex items-center justify-center shrink-0">
                      <ChevronRight size={20} className="text-red-400 rotate-[90deg]" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm uppercase mb-1 text-red-400">Sand Snakes</h4>
                      <p className="text-white/60 text-xs leading-relaxed">Watch out! Landing on a red snake's head will cause you to slide down to its tail.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                      <Dice5 size={20} className="text-white/60" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm uppercase mb-1">Turns & Controls</h4>
                      <p className="text-white/60 text-xs leading-relaxed">Players take turns. Use your specific dice button (Left for Player 1, Right for Player 2) to move.</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowTutorial(false)}
                  className="w-full mt-8 py-4 bg-white text-black font-black rounded-2xl hover:bg-indigo-50 transition-all active:scale-95"
                >
                  Understood, Commander
                </button>
              </div>
            </motion.div>
          )}

          {status === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-[32px] z-20"
            >
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-yellow-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-yellow-500/40">
                  <Trophy size={40} className="text-black" />
                </div>
                <h2 className="text-4xl font-black tracking-tighter mb-2 uppercase">Winner!</h2>
                <p className="text-yellow-500 font-black text-2xl mb-8">{winner?.name}</p>
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={startGame}
                    className="px-8 py-4 bg-white text-black font-black rounded-2xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <RotateCcw size={20} /> Play Again
                  </button>
                  <button 
                    onClick={onBack}
                    className="px-8 py-4 bg-white/10 text-white font-black rounded-2xl hover:bg-white/20 transition-all active:scale-95"
                  >
                    Exit
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 flex items-center justify-between w-full max-w-[700px] z-10 px-4">
        {/* Player 1 Dice */}
        <div className="flex flex-col items-center gap-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{players[0].name}</div>
          <motion.div 
            animate={isRolling && currentPlayerIndex === 0 ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.2, 1] } : {}}
            transition={isRolling && currentPlayerIndex === 0 ? { repeat: Infinity, duration: 0.2 } : {}}
            className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl transition-all ${currentPlayerIndex === 0 ? 'bg-white shadow-white/10' : 'bg-white/10 shadow-none opacity-40'}`}
          >
            <span className={`text-4xl font-black ${currentPlayerIndex === 0 ? 'text-black' : 'text-white/20'}`}>{currentPlayerIndex === 0 ? diceValue : '-'}</span>
          </motion.div>
          <button 
            onClick={rollDice}
            disabled={isRolling || gameState.current.isMoving || status !== 'PLAYING' || currentPlayerIndex !== 0}
            className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Dice5 size={20} /> Roll Dice
          </button>
        </div>

        {/* Player Info List (Center) */}
        <div className="flex flex-col gap-3">
          {players.map(p => (
            <div key={p.id} className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${players[currentPlayerIndex].id === p.id ? 'bg-white/10 border-white/20 scale-105' : 'bg-transparent border-transparent opacity-40'}`}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: p.color }}>
                <User size={20} />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-sm">{p.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Square {p.position}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Player 2 Dice */}
        <div className="flex flex-col items-center gap-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{players[1].name}</div>
          <motion.div 
            animate={isRolling && currentPlayerIndex === 1 ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.2, 1] } : {}}
            transition={isRolling && currentPlayerIndex === 1 ? { repeat: Infinity, duration: 0.2 } : {}}
            className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl transition-all ${currentPlayerIndex === 1 ? 'bg-white shadow-white/10' : 'bg-white/10 shadow-none opacity-40'}`}
          >
            <span className={`text-4xl font-black ${currentPlayerIndex === 1 ? 'text-black' : 'text-white/20'}`}>{currentPlayerIndex === 1 ? diceValue : '-'}</span>
          </motion.div>
          <button 
            onClick={rollDice}
            disabled={isRolling || gameState.current.isMoving || status !== 'PLAYING' || currentPlayerIndex !== 1}
            className="px-8 py-3 bg-red-600 text-white font-black rounded-xl shadow-xl shadow-red-600/20 hover:bg-red-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Dice5 size={20} /> Roll Dice
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Calendar, Zap, ChevronRight, Info, Pause, X, ArrowLeft } from 'lucide-react';
import { db, collection, setDoc, doc, serverTimestamp, OperationType, handleFirestoreError } from '../firebase';

// --- Constants & Types ---
const INITIAL_GRID_SIZE = 5;
const BASE_SPEED = 2;
const COLORS = [
  '#FF5555', // Red
  '#55FF55', // Green
  '#5555FF', // Blue
  '#FFFF55', // Yellow
  '#FF55FF', // Magenta
  '#55FFFF', // Cyan
];

type GameStatus = 'START' | 'TUTORIAL' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

interface Tile {
  id: number;
  x: number;
  y: number;
  color: string;
  targetColor: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface ComboPopup {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

const getSeededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const getDailySeed = () => {
  const date = new Date();
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
};

interface ColorDashGridProps {
  onBack: () => void;
  user: any;
  onGameEnd?: (score: number, playtime: number) => void;
}

export default function ColorDashGrid({ onBack, user, onGameEnd }: ColorDashGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isDaily, setIsDaily] = useState(false);
  const [gridSize, setGridSize] = useState(INITIAL_GRID_SIZE);
  const [combo, setCombo] = useState(0);
  const [tutorialStep, setTutorialStep] = useState(0);

  const tutorialSteps = [
    {
      title: "Movement",
      description: "Use Arrow Keys or Swipe to move your block left and right.",
      icon: <ChevronRight className="w-8 h-8 text-blue-400" />
    },
    {
      title: "Matching",
      description: "Match your block's color with the incoming tiles to score points.",
      icon: <Zap className="w-8 h-8 text-yellow-400" />
    },
    {
      title: "Avoidance",
      description: "Avoid tiles with different colors! The game speeds up as you score.",
      icon: <X className="w-8 h-8 text-red-400" />
    }
  ];

  const gameState = useRef({
    playerX: Math.floor(INITIAL_GRID_SIZE / 2),
    playerColor: COLORS[0],
    tiles: [] as Tile[],
    particles: [] as Particle[],
    lastTileTime: 0,
    speed: BASE_SPEED,
    gridSize: INITIAL_GRID_SIZE,
    score: 0,
    tileId: 0,
    rng: Math.random,
    lastFrameTime: 0,
    touchStart: { x: 0, y: 0 },
    comboFlash: 0,
    shake: 0,
    comboPopups: [] as ComboPopup[],
    popupId: 0,
    startTime: 0,
  });

  useEffect(() => {
    const savedHighScore = localStorage.getItem('colorDashHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));
  }, []);

  const startGame = (daily = false) => {
    setIsDaily(daily);
    const seed = daily ? getDailySeed() : Math.random() * 1000000;
    gameState.current = {
      playerX: Math.floor(INITIAL_GRID_SIZE / 2),
      playerColor: COLORS[0],
      tiles: [],
      particles: [],
      lastTileTime: 0,
      speed: BASE_SPEED,
      gridSize: INITIAL_GRID_SIZE,
      score: 0,
      tileId: 0,
      rng: daily ? getSeededRandom(seed) : Math.random,
      lastFrameTime: performance.now(),
      touchStart: { x: 0, y: 0 },
      comboFlash: 0,
      shake: 0,
      comboPopups: [],
      popupId: 0,
      startTime: performance.now(),
    };
    setScore(0);
    setGridSize(INITIAL_GRID_SIZE);
    setCombo(0);
    setStatus('PLAYING');
  };

  const startTutorial = () => {
    setTutorialStep(0);
    setStatus('TUTORIAL');
  };

  const gameOver = useCallback(async () => {
    setStatus('GAMEOVER');
    const currentScore = gameState.current.score;
    const playtime = Math.floor((performance.now() - gameState.current.startTime) / 1000);
    
    if (currentScore > highScore) {
      setHighScore(currentScore);
      localStorage.setItem('colorDashHighScore', currentScore.toString());
    }

    if (onGameEnd) {
      onGameEnd(currentScore, playtime);
    }

    if (user && currentScore > 0) {
      try {
        const scoreRef = doc(collection(db, 'scores'));
        await setDoc(scoreRef, {
          userId: user.uid,
          username: user.username,
          gameId: 'COLOR_DASH',
          score: currentScore,
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'scores');
      }
    }
  }, [highScore, user, onGameEnd]);

  const togglePause = useCallback(() => {
    if (status === 'PLAYING') {
      setStatus('PAUSED');
    } else if (status === 'PAUSED') {
      gameState.current.lastFrameTime = performance.now();
      setStatus('PLAYING');
    }
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== 'PLAYING') return;
      if (e.key === 'ArrowLeft') {
        gameState.current.playerX = Math.max(0, gameState.current.playerX - 1);
      } else if (e.key === 'ArrowRight') {
        gameState.current.playerX = Math.min(gameState.current.gridSize - 1, gameState.current.playerX + 1);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      gameState.current.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (status !== 'PLAYING') return;
      const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const dx = touchEnd.x - gameState.current.touchStart.x;
      const dy = touchEnd.y - gameState.current.touchStart.y;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        if (dx < 0) {
          gameState.current.playerX = Math.max(0, gameState.current.playerX - 1);
        } else {
          gameState.current.playerX = Math.min(gameState.current.gridSize - 1, gameState.current.playerX + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    const preventDefault = (e: Event) => e.preventDefault();
    if (status === 'PLAYING') {
      window.addEventListener('touchmove', preventDefault, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchmove', preventDefault);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'PLAYING' && status !== 'PAUSED') return;

    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const update = (time: number) => {
      if (status === 'PAUSED') {
        draw();
        animationId = requestAnimationFrame(update);
        return;
      }
      const dt = (time - gameState.current.lastFrameTime) / 16.67;
      gameState.current.lastFrameTime = time;

      const currentScore = gameState.current.score;
      gameState.current.speed = BASE_SPEED + (currentScore * 0.04);
      
      const newGridSize = INITIAL_GRID_SIZE + Math.floor(currentScore / 25);
      if (newGridSize !== gameState.current.gridSize) {
        gameState.current.gridSize = newGridSize;
        setGridSize(newGridSize);
      }

      const spawnInterval = Math.max(700, 1800 - (currentScore * 15));
      if (time - gameState.current.lastTileTime > spawnInterval) {
        const x = Math.floor(gameState.current.rng() * gameState.current.gridSize);
        
        let color: string;
        if (currentScore > 50) {
          const shades = ['#00FFFF', '#00EEEE', '#00DDDD', '#00CCCC', '#00BBBB', '#00AAAA'];
          color = shades[Math.floor(gameState.current.rng() * shades.length)];
        } else if (currentScore > 30) {
          const shades = ['#FF5555', '#FF7755', '#FF9955', '#FFBB55', '#FFDD55'];
          color = shades[Math.floor(gameState.current.rng() * shades.length)];
        } else {
          const colorIdx = Math.floor(gameState.current.rng() * Math.min(COLORS.length, 3 + Math.floor(currentScore / 10)));
          color = COLORS[colorIdx];
        }
        
        gameState.current.tiles.push({
          id: gameState.current.tileId++,
          x,
          y: -50,
          color,
          targetColor: color,
        });
        gameState.current.lastTileTime = time;
        
        if (gameState.current.tiles.length === 1) {
          gameState.current.playerColor = gameState.current.tiles[0].color;
        }
      }

      for (let i = gameState.current.tiles.length - 1; i >= 0; i--) {
        const tile = gameState.current.tiles[i];
        tile.y += gameState.current.speed * dt;

        const cellSize = canvas.width / gameState.current.gridSize;
        const playerY = canvas.height - cellSize;

        if (tile.y + cellSize > playerY + 10 && tile.y < playerY + cellSize - 10) {
          if (tile.x === gameState.current.playerX) {
            if (tile.color === gameState.current.playerColor) {
              gameState.current.score += 1;
              setScore(gameState.current.score);
              setCombo(c => c + 1);
              
              for (let p = 0; p < 10; p++) {
                gameState.current.particles.push({
                  x: tile.x * cellSize + cellSize / 2,
                  y: playerY + cellSize / 2,
                  vx: (gameState.current.rng() - 0.5) * 10,
                  vy: (gameState.current.rng() - 0.5) * 10,
                  life: 1,
                  color: tile.color,
                });
              }
              
              if (gameState.current.score % 5 === 0) {
                gameState.current.comboFlash = 1.0;
                gameState.current.shake = 15;
              }

              // Add floating combo text
              const currentCombo = combo + 1;
              if (currentCombo >= 2) {
                gameState.current.comboPopups.push({
                  id: gameState.current.popupId++,
                  x: tile.x * cellSize + cellSize / 2,
                  y: playerY,
                  text: `+${currentCombo}x`,
                  life: 1.0,
                  color: tile.color,
                });
              }

              gameState.current.tiles.splice(i, 1);
              
              if (gameState.current.tiles.length > 0) {
                 gameState.current.playerColor = gameState.current.tiles[0].color;
              }
            } else {
              gameOver();
            }
          }
        }

        if (tile.y > canvas.height) {
          gameOver();
        }
      }

      for (let i = gameState.current.particles.length - 1; i >= 0; i--) {
        const p = gameState.current.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) gameState.current.particles.splice(i, 1);
      }

      for (let i = gameState.current.comboPopups.length - 1; i >= 0; i--) {
        const p = gameState.current.comboPopups[i];
        p.y -= 2 * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) gameState.current.comboPopups.splice(i, 1);
      }

      if (gameState.current.comboFlash > 0) {
        gameState.current.comboFlash -= 0.05 * dt;
      }

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
        const sx = (Math.random() - 0.5) * gameState.current.shake;
        const sy = (Math.random() - 0.5) * gameState.current.shake;
        ctx.translate(sx, sy);
      }
      
      ctx.clearRect(-50, -50, canvas.width + 100, canvas.height + 100);
      const cellSize = canvas.width / gameState.current.gridSize;

      if (gameState.current.comboFlash > 0) {
        ctx.save();
        const gradient = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, 0,
          canvas.width / 2, canvas.height / 2, canvas.width
        );
        gradient.addColorStop(0, `${gameState.current.playerColor}${Math.floor(gameState.current.comboFlash * 40).toString(16).padStart(2, '0')}`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= gameState.current.gridSize; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
      }

      gameState.current.tiles.forEach(tile => {
        ctx.fillStyle = tile.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = tile.color;
        const r = 8;
        const x = tile.x * cellSize + 4;
        const y = tile.y;
        const w = cellSize - 8;
        const h = cellSize - 8;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
      });

      const px = gameState.current.playerX * cellSize + 4;
      const py = canvas.height - cellSize + 4;
      const pw = cellSize - 8;
      const ph = cellSize - 8;
      const pr = 12;

      ctx.shadowBlur = 25;
      ctx.shadowColor = gameState.current.playerColor;
      ctx.fillStyle = gameState.current.playerColor;
      ctx.beginPath();
      ctx.moveTo(px + pr, py);
      ctx.lineTo(px + pw - pr, py);
      ctx.quadraticCurveTo(px + pw, py, px + pw, py + pr);
      ctx.lineTo(px + pw, py + ph - pr);
      ctx.quadraticCurveTo(px + pw, py + ph, px + pw - pr, py + ph);
      ctx.lineTo(px + pr, py + ph);
      ctx.quadraticCurveTo(px, py + ph, px, py + ph - pr);
      ctx.lineTo(px, py + pr);
      ctx.quadraticCurveTo(px, py, px + pr, py);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.shadowBlur = 0;
      gameState.current.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      gameState.current.comboPopups.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${20 + (p.life * 10)}px font-sans`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillText(p.text, p.x, p.y);
      });

      ctx.globalAlpha = 1.0;
      ctx.restore();
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [status, gameOver]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = Math.min(window.innerWidth - 40, 500);
      canvas.width = size;
      canvas.height = size;
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-[500px] flex justify-between items-end mb-6 z-10">
        <div className="flex flex-col gap-2">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold"
          >
            <ArrowLeft size={14} /> Back to Hub
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-1">Score</p>
            <div className="flex items-baseline gap-2">
              <motion.h1 
                key={score}
                initial={{ scale: 1 }}
                animate={{ 
                  scale: combo > 5 ? [1, 1.5, 1] : [1, 1.2, 1],
                  rotate: combo > 10 ? [0, -5, 5, 0] : 0,
                  color: combo > 10 ? ['#ffffff', '#fbbf24', '#ffffff'] : '#ffffff'
                }}
                transition={{ duration: 0.2 }}
                className="text-5xl font-bold tracking-tighter"
              >
                {score}
              </motion.h1>
              {combo > 5 && (
                <motion.span 
                  initial={{ scale: 0, x: -20 }} 
                  animate={{ scale: 1, x: 0 }} 
                  className="text-orange-400 text-sm font-bold bg-orange-400/10 px-2 py-0.5 rounded-full border border-orange-400/20 shadow-[0_0_15px_rgba(251,191,36,0.2)]"
                >
                  {combo}x COMBO
                </motion.span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-1">Best</p>
          <div className="flex items-center justify-end gap-2 text-xl font-semibold text-white/80 mb-2">
            <Trophy size={18} className="text-yellow-500" />
            {highScore}
          </div>
          {status === 'PLAYING' && (
            <button 
              onClick={togglePause}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
            >
              <Pause size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
        <canvas
          ref={canvasRef}
          className="relative bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl touch-none"
        />

        <AnimatePresence>
          {status === 'START' && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl p-8 text-center"
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-indigo-600/20">
                  <Play size={40} fill="white" />
                </div>
                <h2 className="text-3xl font-bold mb-2 tracking-tight">Color Dash Grid</h2>
                <p className="text-white/60 mb-8 max-w-[280px] text-sm leading-relaxed">
                  Match your color with falling tiles. Don't miss any!
                </p>
                
                <div className="flex flex-col gap-3 w-full max-w-[240px] mx-auto">
                  <button
                    onClick={() => startGame(false)}
                    className="w-full py-4 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl"
                  >
                    Start Game <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={startTutorial}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10"
                  >
                    <Info size={18} /> Tutorial
                  </button>
                  <button
                    onClick={() => startGame(true)}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10"
                  >
                    <Calendar size={18} /> Daily Challenge
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {status === 'TUTORIAL' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white/5 rounded-2xl">
                  {tutorialSteps[tutorialStep].icon}
                </div>
              </div>
              <h2 className="text-3xl font-bold mb-4">{tutorialSteps[tutorialStep].title}</h2>
              <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
                {tutorialSteps[tutorialStep].description}
              </p>
              <div className="flex gap-4">
                {tutorialStep > 0 && (
                  <button
                    onClick={() => setTutorialStep(s => s - 1)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (tutorialStep < tutorialSteps.length - 1) {
                      setTutorialStep(s => s + 1);
                    } else {
                      startGame(false);
                    }
                  }}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-colors"
                >
                  {tutorialStep < tutorialSteps.length - 1 ? "Next" : "Got it!"}
                </button>
              </div>
              <div className="flex justify-center gap-2 mt-8">
                {tutorialSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i === tutorialStep ? "w-8 bg-blue-500" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {status === 'PAUSED' && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl p-8 text-center"
            >
              <h2 className="text-3xl font-bold mb-8 tracking-tight">Paused</h2>
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button
                  onClick={togglePause}
                  className="w-full py-4 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl"
                >
                  <Play size={18} fill="black" /> Resume
                </button>
                <button
                  onClick={() => startGame(isDaily)}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10"
                >
                  <RotateCcw size={18} /> Restart
                </button>
                <button
                  onClick={() => setStatus('START')}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <X size={18} /> Quit
                </button>
              </div>
            </motion.div>
          )}

          {status === 'GAMEOVER' && (
            <motion.div
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl rounded-2xl p-8 text-center z-50"
            >
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-8"
              >
                <motion.p 
                  animate={{ 
                    opacity: [0.5, 1, 0.5],
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 2,
                    ease: "easeInOut"
                  }}
                  className="text-red-500 font-black uppercase tracking-[0.5em] text-[12px] mb-6"
                >
                  Game Over
                </motion.p>
                
                <div className="flex justify-center items-center gap-1 sm:gap-2 mb-2">
                  {score.toString().split('').map((char, i) => (
                    <motion.span
                      key={i}
                      initial={{ 
                        opacity: 0, 
                        x: (Math.random() - 0.5) * 400, 
                        y: (Math.random() - 0.5) * 400,
                        rotate: (Math.random() - 0.5) * 360,
                        scale: 2,
                        filter: 'blur(10px)'
                      }}
                      animate={{ 
                        opacity: 1, 
                        x: 0, 
                        y: 0, 
                        rotate: 0,
                        scale: 1,
                        filter: 'blur(0px)'
                      }}
                      transition={{ 
                        type: 'spring', 
                        damping: 12, 
                        stiffness: 90,
                        delay: 0.4 + (i * 0.08) 
                      }}
                      className="text-6xl sm:text-8xl font-black tracking-tighter inline-block text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                    >
                      {char}
                    </motion.span>
                  ))}
                </div>
                
                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 }}
                  className="text-white/40 text-sm font-bold uppercase tracking-widest"
                >
                  Final Score
                </motion.p>
              </motion.div>

              {score >= highScore && score > 0 && (
                <motion.div 
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    type: 'spring',
                    damping: 8,
                    stiffness: 200,
                    delay: 1.5 
                  }}
                  className="bg-yellow-500 text-black px-6 sm:px-8 py-2 sm:py-2.5 rounded-full font-black text-[10px] sm:text-xs mb-8 sm:mb-12 flex items-center gap-2 shadow-[0_0_30px_rgba(234,179,8,0.4)] uppercase tracking-widest"
                >
                  <Trophy size={14} fill="black" /> New High Score!
                </motion.div>
              )}

              <div className="flex flex-col gap-3 sm:gap-4 w-full max-w-[260px]">
                <motion.button
                  onClick={() => startGame(isDaily)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    scale: [1, 1.05, 1],
                    boxShadow: [
                      "0 0 0px rgba(79, 70, 229, 0)",
                      "0 0 20px rgba(79, 70, 229, 0.4)",
                      "0 0 0px rgba(79, 70, 229, 0)"
                    ]
                  }}
                  transition={{
                    opacity: { delay: 1.8 },
                    y: { delay: 1.8 },
                    scale: {
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "easeInOut"
                    },
                    boxShadow: {
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "easeInOut"
                    }
                  }}
                  whileHover={{ scale: 1.1, backgroundColor: '#6366f1' }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full py-3 sm:py-4 bg-indigo-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-indigo-600/40 border border-indigo-400/30 text-base sm:text-lg"
                >
                  <RotateCcw size={20} /> Try Again
                </motion.button>
                <motion.button
                  onClick={() => setStatus('START')}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.0 }}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white font-bold rounded-2xl transition-all border border-white/5 uppercase tracking-widest text-[10px]"
                >
                  Main Menu
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 flex gap-8 text-white/30 text-xs font-medium uppercase tracking-widest z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
            <Zap size={14} />
          </div>
          <span>Swipe to Move</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
            <Info size={14} />
          </div>
          <span>Match Colors</span>
        </div>
      </div>
    </div>
  );
}

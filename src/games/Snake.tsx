/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, ChevronRight, Pause, X, ArrowLeft, Apple, Info } from 'lucide-react';
import { db, collection, setDoc, doc, serverTimestamp, OperationType, handleFirestoreError } from '../firebase';
import { soundService } from '../lib/soundService';

const GRID_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };
const INITIAL_SPEED = 150;

type GameStatus = 'START' | 'TUTORIAL' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

interface SnakeProps {
  onBack: () => void;
  user: any;
  onGameEnd?: (score: number, playtime: number) => void;
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

export default function Snake({ onBack, user, onGameEnd }: SnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [tutorialStep, setTutorialStep] = useState(0);

  const tutorialSteps = [
    {
      title: "Movement",
      description: "Use Arrow Keys or Swipe to change the snake's direction.",
      icon: <ChevronRight className="w-8 h-8 text-blue-400" />
    },
    {
      title: "Eating",
      description: "Eat the glowing apples to grow longer and score points.",
      icon: <Apple className="w-8 h-8 text-red-400" />
    },
    {
      title: "Survival",
      description: "Don't hit the walls or your own tail, or it's game over!",
      icon: <X className="w-8 h-8 text-red-500" />
    }
  ];
  
  const gameState = useRef({
    snake: [...INITIAL_SNAKE],
    direction: { ...INITIAL_DIRECTION },
    nextDirection: { ...INITIAL_DIRECTION },
    food: { x: 5, y: 5 },
    speed: INITIAL_SPEED,
    lastMoveTime: 0,
    score: 0,
    touchStart: { x: 0, y: 0 },
    combo: 0,
    lastEatTime: 0,
    shake: 0,
    comboPopups: [] as ComboPopup[],
    popupId: 0,
    particles: [] as Particle[],
    startTime: 0,
    headFlash: 0,
  });

  useEffect(() => {
    const savedHighScore = localStorage.getItem('snakeHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));
  }, []);

  const spawnFood = useCallback(() => {
    let newFood;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const onSnake = gameState.current.snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
      if (!onSnake) break;
    }
    gameState.current.food = newFood;
  }, []);

  const startGame = () => {
    soundService.play('click');
    gameState.current = {
      snake: [...INITIAL_SNAKE],
      direction: { ...INITIAL_DIRECTION },
      nextDirection: { ...INITIAL_DIRECTION },
      food: { x: 5, y: 5 },
      speed: INITIAL_SPEED,
      lastMoveTime: performance.now(),
      score: 0,
      touchStart: { x: 0, y: 0 },
      combo: 0,
      lastEatTime: 0,
      shake: 0,
      comboPopups: [],
      popupId: 0,
      particles: [],
      startTime: performance.now(),
      headFlash: 0,
    };
    setScore(0);
    spawnFood();
    setStatus('PLAYING');
  };

  const startTutorial = () => {
    setTutorialStep(0);
    setStatus('TUTORIAL');
  };

  const gameOver = useCallback(async () => {
    soundService.play('gameover');
    setStatus('GAMEOVER');
    const currentScore = gameState.current.score;
    const playtime = Math.floor((performance.now() - gameState.current.startTime) / 1000);

    if (currentScore > highScore) {
      setHighScore(currentScore);
      localStorage.setItem('snakeHighScore', currentScore.toString());
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
          gameId: 'SNAKE',
          score: currentScore,
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'scores');
      }
    }
  }, [highScore, user, onGameEnd]);

  const togglePause = useCallback(() => {
    soundService.play('click');
    if (status === 'PLAYING') setStatus('PAUSED');
    else if (status === 'PAUSED') {
      gameState.current.lastMoveTime = performance.now();
      setStatus('PLAYING');
    }
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== 'PLAYING') return;
      const { direction } = gameState.current;
      
      switch (e.key) {
        case 'ArrowUp':
          if (direction.y === 0) gameState.current.nextDirection = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
          if (direction.y === 0) gameState.current.nextDirection = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
          if (direction.x === 0) gameState.current.nextDirection = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
          if (direction.x === 0) gameState.current.nextDirection = { x: 1, y: 0 };
          break;
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
      const { direction } = gameState.current;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) {
          if (dx < 0 && direction.x === 0) gameState.current.nextDirection = { x: -1, y: 0 };
          else if (dx > 0 && direction.x === 0) gameState.current.nextDirection = { x: 1, y: 0 };
        }
      } else {
        if (Math.abs(dy) > 30) {
          if (dy < 0 && direction.y === 0) gameState.current.nextDirection = { x: 0, y: -1 };
          else if (dy > 0 && direction.y === 0) gameState.current.nextDirection = { x: 0, y: 1 };
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

      if (time - gameState.current.lastMoveTime > gameState.current.speed) {
        gameState.current.lastMoveTime = time;
        gameState.current.direction = { ...gameState.current.nextDirection };
        
        const head = { 
          x: gameState.current.snake[0].x + gameState.current.direction.x,
          y: gameState.current.snake[0].y + gameState.current.direction.y 
        };

        // Wall Collision
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
          gameState.current.shake = 30;
          gameOver();
          return;
        }

        // Self Collision
        if (gameState.current.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
          gameState.current.shake = 30;
          gameOver();
          return;
        }

        gameState.current.snake.unshift(head);

        // Food Collision
        if (head.x === gameState.current.food.x && head.y === gameState.current.food.y) {
          soundService.play('score');
          const now = performance.now();
          const timeSinceLastEat = now - gameState.current.lastEatTime;
          
          if (timeSinceLastEat < 3000) {
            gameState.current.combo += 1;
          } else {
            gameState.current.combo = 1;
          }
          
          gameState.current.lastEatTime = now;
          gameState.current.headFlash = 1.0;
          const comboBonus = Math.min(50, (gameState.current.combo - 1) * 5);
          gameState.current.score += 10 + comboBonus;
          setScore(gameState.current.score);
          
          if (gameState.current.combo >= 2) {
            gameState.current.shake = 10;
            gameState.current.comboPopups.push({
              id: gameState.current.popupId++,
              x: head.x * (canvas.width / GRID_SIZE) + (canvas.width / GRID_SIZE) / 2,
              y: head.y * (canvas.width / GRID_SIZE) + (canvas.width / GRID_SIZE) / 2,
              text: `x${gameState.current.combo}`,
              life: 1.0,
              color: '#4ade80',
            });
          }

          // Particles
          for (let i = 0; i < 20; i++) {
            gameState.current.particles.push({
              x: head.x * (canvas.width / GRID_SIZE) + (canvas.width / GRID_SIZE) / 2,
              y: head.y * (canvas.width / GRID_SIZE) + (canvas.width / GRID_SIZE) / 2,
              vx: (Math.random() - 0.5) * 12,
              vy: (Math.random() - 0.5) * 12,
              life: 1.0,
              color: '#4ade80',
            });
          }

          gameState.current.speed = Math.max(60, INITIAL_SPEED - Math.floor(gameState.current.score / 50) * 5);
          spawnFood();
        } else {
          gameState.current.snake.pop();
        }
      }

      draw();
      
      // Update effects
      const dt = 1; // Simplified dt for Snake
      for (let i = gameState.current.particles.length - 1; i >= 0; i--) {
        const p = gameState.current.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.03 * dt;
        if (p.life <= 0) gameState.current.particles.splice(i, 1);
      }

      for (let i = gameState.current.comboPopups.length - 1; i >= 0; i--) {
        const p = gameState.current.comboPopups[i];
        p.y -= 1 * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) gameState.current.comboPopups.splice(i, 1);
      }

      if (gameState.current.shake > 0) {
        gameState.current.shake *= 0.9;
        if (gameState.current.shake < 0.1) gameState.current.shake = 0;
      }

      if (gameState.current.headFlash > 0) {
        gameState.current.headFlash -= 0.1 * dt;
      }

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
      const cellSize = canvas.width / GRID_SIZE;

      // Draw Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize); ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
      }

      // Draw Food
      const fx = gameState.current.food.x * cellSize + cellSize / 2;
      const fy = gameState.current.food.y * cellSize + cellSize / 2;
      ctx.fillStyle = '#ff4444';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ff4444';
      ctx.beginPath();
      ctx.arc(fx, fy, cellSize / 2 - 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw Snake
      gameState.current.snake.forEach((segment, i) => {
        const isHead = i === 0;
        ctx.fillStyle = isHead ? '#4ade80' : '#22c55e';
        ctx.shadowBlur = isHead ? 20 : 0;
        ctx.shadowColor = '#4ade80';
        
        if (isHead && gameState.current.headFlash > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${gameState.current.headFlash})`;
          ctx.shadowBlur = 30;
          ctx.shadowColor = 'white';
        }

        const r = isHead ? 6 : 4;
        const x = segment.x * cellSize + 2;
        const y = segment.y * cellSize + 2;
        const w = cellSize - 4;
        const h = cellSize - 4;

        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      // Draw Particles
      gameState.current.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Popups
      gameState.current.comboPopups.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${16 + (p.life * 10)}px font-sans`;
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
  }, [status, gameOver, spawnFood]);

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
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
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
            <h1 className="text-5xl font-bold tracking-tighter">{score}</h1>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-1">Best</p>
          <div className="flex items-center justify-end gap-2 text-xl font-semibold text-white/80 mb-2">
            <Trophy size={18} className="text-yellow-500" />
            {highScore}
          </div>
          {status === 'PLAYING' && (
            <button onClick={togglePause} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10">
              <Pause size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl blur opacity-20 transition duration-1000"></div>
        <canvas ref={canvasRef} className="relative bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl touch-none" />

        <AnimatePresence>
          {status === 'START' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl p-8 text-center backdrop-blur-md">
              <div className="w-20 h-20 bg-green-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-green-600/20">
                <Play size={40} fill="white" />
              </div>
              <h2 className="text-3xl font-bold mb-2 tracking-tight">Neon Snake</h2>
              <p className="text-white/60 mb-8 max-w-[280px] text-sm">Eat the apples, grow long, and don't hit the walls!</p>
              <div className="flex flex-col gap-3 w-full max-w-[240px] mx-auto">
                <button onClick={startGame} className="w-full py-4 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl">
                  Start Game <ChevronRight size={18} />
                </button>
                <button
                  onClick={startTutorial}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10"
                >
                  <Info size={18} /> Tutorial
                </button>
              </div>
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
                      startGame();
                    }
                  }}
                  className="flex-1 py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold shadow-lg shadow-green-500/20 transition-colors"
                >
                  {tutorialStep < tutorialSteps.length - 1 ? "Next" : "Got it!"}
                </button>
              </div>
              <div className="flex justify-center gap-2 mt-8">
                {tutorialSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i === tutorialStep ? "w-8 bg-green-500" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {status === 'PAUSED' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl p-8 text-center backdrop-blur-md">
              <h2 className="text-3xl font-bold mb-8 tracking-tight">Paused</h2>
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button onClick={togglePause} className="w-full py-4 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 shadow-xl">
                  <Play size={18} fill="black" /> Resume
                </button>
                <button onClick={startGame} className="w-full py-3 bg-white/10 text-white font-semibold rounded-xl flex items-center justify-center gap-2 border border-white/10">
                  <RotateCcw size={18} /> Restart
                </button>
                <button onClick={() => setStatus('START')} className="w-full py-3 bg-white/5 text-white/60 font-semibold rounded-xl flex items-center justify-center gap-2">
                  <X size={18} /> Quit
                </button>
              </div>
            </motion.div>
          )}

          {status === 'GAMEOVER' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-2xl p-4 sm:p-8 text-center">
              <p className="text-red-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-2">Game Over</p>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tighter mb-1">{score}</h2>
              <p className="text-white/40 text-xs sm:text-sm mb-6 sm:mb-8">Points Collected</p>
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button onClick={startGame} className="w-full py-3 sm:py-4 bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 text-sm sm:text-base">
                  <RotateCcw size={18} /> Try Again
                </button>
                <button onClick={() => setStatus('START')} className="w-full py-2 sm:py-3 bg-white/5 text-white/60 font-semibold rounded-xl text-xs sm:text-sm">Main Menu</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 flex gap-8 text-white/30 text-xs font-medium uppercase tracking-widest z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
            <ChevronRight size={14} className="rotate-[-90deg]" />
          </div>
          <span>Arrows to Move</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
            <Apple size={14} />
          </div>
          <span>Eat to Grow</span>
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, X, HelpCircle, Heart, Zap, Bomb, Apple, Target } from 'lucide-react';
import { soundService } from '../lib/soundService';
import { db, collection, setDoc, doc, serverTimestamp, OperationType, handleFirestoreError } from '../firebase';

interface GameObject {
  id: number;
  x: number;
  y: number;
  type: 'FRUIT' | 'BOMB';
  fruitType: number;
  speed: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  isSmashed: boolean;
  smashTime?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const FRUIT_COLORS = ['#ff4d4d', '#ffcc00', '#4dff4d', '#ff4dff', '#4dffff'];
const SMASH_ZONE_Y = 300;
const SMASH_ZONE_HEIGHT = 80;

export default function FruitSmash({ onBack, user, onGameEnd }: { onBack: () => void; user: any; onGameEnd?: (score: number, playtime: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'START' | 'PLAYING' | 'GAMEOVER'>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const gameState = useRef({
    objects: [] as GameObject[],
    particles: [] as Particle[],
    lastSpawnTime: 0,
    spawnInterval: 1200,
    speedMultiplier: 1.0,
    lastFrameTime: 0,
    startTime: 0,
    nextId: 0,
  });

  useEffect(() => {
    const saved = localStorage.getItem('fruitSmashHighScore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  const startGame = () => {
    soundService.play('click');
    setStatus('PLAYING');
    setScore(0);
    setLives(3);
    gameState.current = {
      objects: [],
      particles: [],
      lastSpawnTime: 0,
      spawnInterval: 1200,
      speedMultiplier: 1.0,
      lastFrameTime: performance.now(),
      startTime: performance.now(),
      nextId: 0,
    };
  };

  const spawnObject = () => {
    const type = Math.random() > 0.2 ? 'FRUIT' : 'BOMB';
    const x = 50 + Math.random() * 500;
    gameState.current.objects.push({
      id: gameState.current.nextId++,
      x,
      y: -50,
      type,
      fruitType: Math.floor(Math.random() * FRUIT_COLORS.length),
      speed: (2 + Math.random() * 2) * gameState.current.speedMultiplier,
      radius: 25,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      isSmashed: false,
    });
  };

  const spawnParticles = (x: number, y: number, color: string, count = 15) => {
    for (let i = 0; i < count; i++) {
      gameState.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== 'PLAYING') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    // Check if click is in smash zone
    const inZone = y >= SMASH_ZONE_Y && y <= SMASH_ZONE_Y + SMASH_ZONE_HEIGHT;

    let hit = false;
    gameState.current.objects.forEach(obj => {
      if (!obj.isSmashed) {
        const dist = Math.sqrt((obj.x - x) ** 2 + (obj.y - y) ** 2);
        if (dist < obj.radius + 20) {
          hit = true;
          if (obj.type === 'BOMB') {
            soundService.play('bomb');
            setLives(prev => prev - 1);
            spawnParticles(obj.x, obj.y, '#ff0000', 30);
            obj.isSmashed = true;
            if (lives <= 1) gameOver();
          } else {
            if (inZone) {
              soundService.play('smash');
              setScore(prev => prev + 10);
              spawnParticles(obj.x, obj.y, FRUIT_COLORS[obj.fruitType], 20);
              obj.isSmashed = true;
              obj.smashTime = performance.now();
            } else {
              // Missed zone penalty or just no points
              soundService.play('fail');
            }
          }
        }
      }
    });

    if (!hit) {
      // Optional: miss penalty
    }
  };

  const gameOver = async () => {
    setStatus('GAMEOVER');
    soundService.play('gameover');
    
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('fruitSmashHighScore', score.toString());
    }

    const playtime = Math.floor((performance.now() - gameState.current.startTime) / 1000);
    onGameEnd?.(score, playtime);

    try {
      await setDoc(doc(collection(db, 'scores')), {
        userId: user.uid,
        username: user.username,
        gameId: 'FRUIT_SMASH',
        score,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'scores');
    }
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

      if (status === 'PLAYING') {
        // Difficulty scaling
        gameState.current.speedMultiplier = 1.0 + (score / 500);
        gameState.current.spawnInterval = Math.max(400, 1200 - (score / 2));

        // Spawning
        if (now - gameState.current.lastSpawnTime > gameState.current.spawnInterval) {
          spawnObject();
          gameState.current.lastSpawnTime = now;
        }

        // Update objects
        for (let i = gameState.current.objects.length - 1; i >= 0; i--) {
          const obj = gameState.current.objects[i];
          if (!obj.isSmashed) {
            obj.y += obj.speed * dt;
            obj.rotation += obj.rotationSpeed * dt;

            // Missed fruit
            if (obj.y > canvas.height + 50) {
              if (obj.type === 'FRUIT') {
                setLives(prev => prev - 1);
                soundService.play('fail');
                if (lives <= 1) gameOver();
              }
              gameState.current.objects.splice(i, 1);
            }
          } else {
            // Remove smashed objects after a delay or immediately
            if (obj.smashTime && now - obj.smashTime > 100) {
              gameState.current.objects.splice(i, 1);
            }
          }
        }
      }

      // Update particles
      for (let i = gameState.current.particles.length - 1; i >= 0; i--) {
        const p = gameState.current.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) gameState.current.particles.splice(i, 1);
      }

      draw();
      animationId = requestAnimationFrame(update);
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Smash Zone
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, SMASH_ZONE_Y, canvas.width, SMASH_ZONE_HEIGHT);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(0, SMASH_ZONE_Y, canvas.width, SMASH_ZONE_HEIGHT);
      ctx.setLineDash([]);

      // Draw Zone Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 14px font-sans';
      ctx.textAlign = 'center';
      ctx.fillText('SMASH ZONE', canvas.width / 2, SMASH_ZONE_Y + SMASH_ZONE_HEIGHT / 2 + 5);

      // Draw Objects
      gameState.current.objects.forEach(obj => {
        if (obj.isSmashed) return;

        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);

        if (obj.type === 'BOMB') {
          // Draw Bomb
          ctx.fillStyle = '#333';
          ctx.beginPath();
          ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Fuse
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -obj.radius);
          ctx.quadraticCurveTo(10, -obj.radius - 10, 5, -obj.radius - 20);
          ctx.stroke();

          // Spark
          ctx.fillStyle = '#ff4d4d';
          ctx.beginPath();
          ctx.arc(5, -obj.radius - 20, 4, 0, Math.PI * 2);
          ctx.fill();
          
          // Glow
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#ff0000';
          ctx.strokeStyle = '#ff4d4d';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Draw Fruit
          ctx.fillStyle = FRUIT_COLORS[obj.fruitType];
          ctx.beginPath();
          ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.beginPath();
          ctx.ellipse(-8, -8, 8, 5, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();

          // Stem
          ctx.strokeStyle = '#4d2600';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -obj.radius);
          ctx.lineTo(0, -obj.radius - 10);
          ctx.stroke();
        }
        ctx.restore();
      });

      // Draw Particles
      gameState.current.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [status, lives, score]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm overflow-hidden">
      {/* Game Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
        <button
          onClick={onBack}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/20">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-white font-mono font-bold">{score}</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/20">
            <Heart className="w-5 h-5 text-red-500" />
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-colors ${i < lives ? 'bg-red-500' : 'bg-white/20'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowTutorial(true)}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <HelpCircle className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative w-full max-w-[600px] aspect-[3/4] bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <canvas
          ref={canvasRef}
          width={600}
          height={800}
          className="w-full h-full cursor-crosshair touch-none"
          onMouseDown={handleCanvasClick}
          onTouchStart={handleCanvasClick}
        />

        {/* Start Screen */}
        <AnimatePresence>
          {status === 'START' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-20"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="text-center p-8"
              >
                <div className="w-24 h-24 bg-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/20 rotate-12">
                  <Apple className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-5xl font-black text-white mb-2 tracking-tighter uppercase italic">Fruit Smash</h1>
                <p className="text-orange-400 font-mono text-sm mb-8 uppercase tracking-widest">Martian Harvest Edition</p>
                
                <div className="flex flex-col gap-4">
                  <button
                    onClick={startGame}
                    className="group relative px-12 py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-full font-bold text-xl transition-all shadow-lg shadow-orange-500/25 flex items-center gap-3"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    START MISSION
                  </button>
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="px-12 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-lg transition-all border border-white/10"
                  >
                    HOW TO PLAY
                  </button>
                </div>

                <div className="mt-12 flex items-center justify-center gap-2 text-white/40">
                  <Trophy className="w-4 h-4" />
                  <span className="font-mono text-sm uppercase tracking-tighter">High Score: {highScore}</span>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Game Over Screen */}
          {status === 'GAMEOVER' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl z-30"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="text-center p-8 max-w-sm w-full"
              >
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/20">
                  <Bomb className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-4xl font-black text-white mb-2 uppercase italic">Mission Failed</h2>
                <p className="text-red-400 font-mono text-sm mb-8 uppercase tracking-widest">Harvest Terminated</p>

                <div className="bg-white/5 rounded-2xl p-6 mb-8 border border-white/10">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Final Score</div>
                  <div className="text-5xl font-black text-white mb-4 font-mono">{score}</div>
                  <div className="h-px bg-white/10 mb-4" />
                  <div className="flex justify-between items-center">
                    <span className="text-white/40 text-xs uppercase tracking-widest">High Score</span>
                    <span className="text-white font-mono font-bold">{highScore}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <button
                    onClick={startGame}
                    className="px-12 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-xl transition-all flex items-center justify-center gap-3"
                  >
                    <RotateCcw className="w-6 h-6" />
                    RETRY MISSION
                  </button>
                  <button
                    onClick={onBack}
                    className="px-12 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-lg transition-all border border-white/10"
                  >
                    EXIT TO HUB
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tutorial Modal */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-white uppercase italic">Mission Briefing</h3>
                  <p className="text-orange-500 font-mono text-xs uppercase tracking-widest">Fruit Smash Tutorial</p>
                </div>
                <button
                  onClick={() => setShowTutorial(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Apple className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Smash Fruits</h4>
                    <p className="text-white/60 text-sm">Click or tap fruits as they fall. For maximum points, smash them while they are inside the <span className="text-white font-bold italic">SMASH ZONE</span>.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                    <Bomb className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Avoid Bombs</h4>
                    <p className="text-white/60 text-sm">Do NOT touch the bombs! Smashing a bomb will cost you a life and cause a massive explosion.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                    <Target className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Don't Miss</h4>
                    <p className="text-white/60 text-sm">Letting a fruit fall past the bottom of the screen will also cost you a life. You only have 3 lives!</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                    <Zap className="w-6 h-6 text-yellow-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Speed Up</h4>
                    <p className="text-white/60 text-sm">The game gets faster as your score increases. Stay sharp, Martian!</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowTutorial(false)}
                className="w-full mt-8 py-4 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-all uppercase tracking-widest"
              >
                UNDERSTOOD
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

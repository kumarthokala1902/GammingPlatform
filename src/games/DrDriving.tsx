/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, X, HelpCircle, Info, Navigation, Gauge, Fuel, Car, AlertTriangle, ArrowUp, ArrowDown, RotateCw, Target } from 'lucide-react';
import { soundService } from '../lib/soundService';
import { db, collection, setDoc, doc, serverTimestamp, OperationType, handleFirestoreError } from '../firebase';

interface CarState {
  x: number;
  y: number;
  angle: number;
  speed: number;
  steering: number;
  gear: 'D' | 'R' | 'P';
  fuel: number;
  damage: number;
  velocityX: number;
  velocityY: number;
  angularVelocity: number;
  drift: number;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'CURB' | 'CAR' | 'PARKING';
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 80;

export default function DrDriving({ onBack, user, onGameEnd }: { onBack: () => void; user: any; onGameEnd?: (score: number, playtime: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'START' | 'PLAYING' | 'GAMEOVER' | 'SUCCESS'>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [showTutorial, setShowTutorial] = useState(false);
  const [mission, setMission] = useState('PARKING');
  
  const [car, setCar] = useState<CarState>({
    x: 400,
    y: 500,
    angle: -Math.PI / 2,
    speed: 0,
    steering: 0,
    gear: 'P',
    fuel: 100,
    damage: 0,
    velocityX: 0,
    velocityY: 0,
    angularVelocity: 0,
    drift: 0,
  });

  const controls = useRef({
    gas: false,
    brake: false,
    steering: 0, // -1 to 1
  });

  const gameState = useRef({
    obstacles: [] as Obstacle[],
    target: { x: 400, y: 100, w: 60, h: 100 },
    lastFrameTime: 0,
    startTime: 0,
    cameraY: 0,
  });

  useEffect(() => {
    const savedHighScore = localStorage.getItem('drDrivingHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));

    const savedLevel = localStorage.getItem('drDrivingLevel');
    if (savedLevel) setLevel(parseInt(savedLevel));
  }, []);

  useEffect(() => {
    generateLevel(level);
  }, [level]);

  const generateLevel = (lvl: number) => {
    const obs: Obstacle[] = [
      // Common Curbs
      { x: 0, y: 0, w: 150, h: 1000, type: 'CURB' },
      { x: 650, y: 0, w: 150, h: 1000, type: 'CURB' },
    ];

    if (lvl === 1) {
      obs.push(
        { x: 250, y: 300, w: 40, h: 80, type: 'CAR' },
        { x: 500, y: 150, w: 40, h: 80, type: 'CAR' },
        { x: 370, y: 50, w: 60, h: 100, type: 'PARKING' }
      );
      gameState.current.target = { x: 370, y: 50, w: 60, h: 100 };
    } else if (lvl === 2) {
      obs.push(
        { x: 200, y: 400, w: 40, h: 80, type: 'CAR' },
        { x: 400, y: 300, w: 40, h: 80, type: 'CAR' },
        { x: 550, y: 200, w: 40, h: 80, type: 'CAR' },
        { x: 200, y: 50, w: 60, h: 100, type: 'PARKING' }
      );
      gameState.current.target = { x: 200, y: 50, w: 60, h: 100 };
    } else if (lvl === 3) {
      obs.push(
        { x: 150, y: 350, w: 200, h: 20, type: 'CURB' },
        { x: 450, y: 250, w: 200, h: 20, type: 'CURB' },
        { x: 300, y: 150, w: 40, h: 80, type: 'CAR' },
        { x: 550, y: 50, w: 60, h: 100, type: 'PARKING' }
      );
      gameState.current.target = { x: 550, y: 50, w: 60, h: 100 };
    } else {
      // Procedural-ish for higher levels
      for (let i = 0; i < Math.min(lvl + 2, 8); i++) {
        obs.push({
          x: 150 + Math.random() * 400,
          y: 100 + Math.random() * 400,
          w: 40,
          h: 80,
          type: 'CAR'
        });
      }
      const tx = 150 + Math.random() * 440;
      const ty = 20 + Math.random() * 80;
      obs.push({ x: tx, y: ty, w: 60, h: 100, type: 'PARKING' });
      gameState.current.target = { x: tx, y: ty, w: 60, h: 100 };
    }
    
    gameState.current.obstacles = obs;
  };

  const startGame = (resetLevel = false) => {
    soundService.play('click');
    setStatus('PLAYING');
    if (resetLevel) {
      setScore(0);
      setLevel(1);
      localStorage.setItem('drDrivingLevel', '1');
    }
    setCar({
      x: 400,
      y: 500,
      angle: -Math.PI / 2,
      speed: 0,
      steering: 0,
      gear: 'D',
      fuel: 100,
      damage: 0,
      velocityX: 0,
      velocityY: 0,
      angularVelocity: 0,
      drift: 0,
    });
    gameState.current.startTime = performance.now();
    gameState.current.lastFrameTime = performance.now();
  };

  const nextLevel = () => {
    soundService.play('click');
    const newLevel = level + 1;
    setLevel(newLevel);
    localStorage.setItem('drDrivingLevel', newLevel.toString());
    setStatus('PLAYING');
    setCar({
      x: 400,
      y: 500,
      angle: -Math.PI / 2,
      speed: 0,
      steering: 0,
      gear: 'D',
      fuel: 100,
      damage: 0,
      velocityX: 0,
      velocityY: 0,
      angularVelocity: 0,
      drift: 0,
    });
    gameState.current.startTime = performance.now();
    gameState.current.lastFrameTime = performance.now();
  };

  const checkCollision = (newCar: CarState) => {
    // Simple AABB collision for car corners
    const corners = [
      { x: -CAR_WIDTH/2, y: -CAR_HEIGHT/2 },
      { x: CAR_WIDTH/2, y: -CAR_HEIGHT/2 },
      { x: -CAR_WIDTH/2, y: CAR_HEIGHT/2 },
      { x: CAR_WIDTH/2, y: CAR_HEIGHT/2 },
    ];

    for (const corner of corners) {
      // Rotate corner
      const rx = corner.x * Math.cos(newCar.angle) - corner.y * Math.sin(newCar.angle);
      const ry = corner.x * Math.sin(newCar.angle) + corner.y * Math.cos(newCar.angle);
      const worldX = newCar.x + rx;
      const worldY = newCar.y + ry;

      for (const obs of gameState.current.obstacles) {
        if (obs.type === 'PARKING') continue;
        if (worldX > obs.x && worldX < obs.x + obs.w && worldY > obs.y && worldY < obs.y + obs.h) {
          return true;
        }
      }
      
      // Screen bounds
      if (worldX < 0 || worldX > CANVAS_WIDTH || worldY < 0 || worldY > CANVAS_HEIGHT) {
        return true;
      }
    }
    return false;
  };

  const update = useCallback(() => {
    if (status !== 'PLAYING') return;

    const now = performance.now();
    const dt = (now - gameState.current.lastFrameTime) / 16.67;
    gameState.current.lastFrameTime = now;

    setCar(prev => {
      let next = { ...prev };

      // Steering Input Response
      const targetSteering = controls.current.steering;
      next.steering += (targetSteering - next.steering) * 0.2 * dt;
      
      // Constants for physics
      const enginePower = 0.15 * dt;
      const brakePower = 0.8 * dt; // Increased from 0.3 for more effectiveness
      const friction = 0.02 * dt;
      const drag = 0.01;
      const lateralGrip = 0.15;
      const driftFactor = 0.95;

      // Longitudinal Force (Gas/Brake)
      let force = 0;
      if (controls.current.gas && next.fuel > 0) {
        if (next.gear === 'D') force = enginePower;
        else if (next.gear === 'R') force = -enginePower;
        next.fuel -= 0.05 * dt;
      } else if (controls.current.brake) {
        if (next.speed > 0) next.speed = Math.max(0, next.speed - brakePower);
        else if (next.speed < 0) next.speed = Math.min(0, next.speed + brakePower);
        
        // Also reduce lateral velocity when braking for better control
        next.velocityX *= (1 - 0.1 * dt);
        next.velocityY *= (1 - 0.1 * dt);
        
        soundService.play('brake');
      }

      // Update Speed based on force and drag
      next.speed += force;
      next.speed *= (1 - drag * dt);
      
      // Apply friction
      if (Math.abs(next.speed) < friction) next.speed = 0;
      else next.speed -= Math.sign(next.speed) * friction;

      // Speed limits
      const maxSpeed = next.gear === 'D' ? 8 : 3;
      next.speed = Math.max(-maxSpeed, Math.min(maxSpeed, next.speed));

      // Rotation / Steering Physics
      // Car turns more at medium speeds, less at very high or very low speeds
      const steeringEffect = Math.min(Math.abs(next.speed) / 2, 1.5);
      const turnAmount = next.steering * steeringEffect * 0.05 * dt;
      next.angle += turnAmount;

      // Drifting / Lateral Velocity
      // Calculate target velocity based on heading
      const targetVelX = Math.cos(next.angle) * next.speed;
      const targetVelY = Math.sin(next.angle) * next.speed;

      // Blend current velocity towards target velocity based on grip
      // If speed is high and turn is sharp, grip is lost (drifting)
      const currentGrip = lateralGrip / (1 + Math.abs(next.speed) * 0.1);
      next.velocityX += (targetVelX - next.velocityX) * currentGrip * dt;
      next.velocityY += (targetVelY - next.velocityY) * currentGrip * dt;

      // Calculate drift amount for visual feedback
      const actualHeading = Math.atan2(next.velocityY, next.velocityX);
      const angleDiff = Math.abs(next.angle - actualHeading);
      next.drift = Math.min(angleDiff * Math.abs(next.speed) * 0.5, 1);

      // Apply movement
      next.x += next.velocityX * dt;
      next.y += next.velocityY * dt;

      // Collision
      if (checkCollision(next)) {
        soundService.play('crash');
        next.damage += 10;
        // Realistic bounce
        next.velocityX *= -0.5;
        next.velocityY *= -0.5;
        next.speed *= -0.5;
        
        if (next.damage >= 100) {
          setStatus('GAMEOVER');
          soundService.play('gameover');
        }
      }

      // Win condition (Parking)
      const target = gameState.current.target;
      const distToTarget = Math.sqrt(Math.pow(next.x - (target.x + target.w/2), 2) + Math.pow(next.y - (target.y + target.h/2), 2));
      
      if (next.x > target.x && next.x < target.x + target.w && 
          next.y > target.y && next.y < target.y + target.h && 
          Math.abs(next.speed) < 0.2) {
        setStatus('SUCCESS');
        soundService.play('success');
        setScore(prev => prev + 100 + Math.floor(next.fuel));
      }

      return next;
    });
  }, [status]);

  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      keys[e.key] = true;
      updateControls();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key] = false;
      updateControls();
    };

    const updateControls = () => {
      if (status !== 'PLAYING') return;
      controls.current.gas = !!keys['ArrowUp'];
      controls.current.brake = !!keys['ArrowDown'];
      
      let steer = 0;
      if (keys['ArrowLeft']) steer -= 1;
      if (keys['ArrowRight']) steer += 1;
      
      // Only override steering if keyboard is being used for steering
      if (keys['ArrowLeft'] || keys['ArrowRight']) {
        controls.current.steering = steer;
      } else if (!keys['ArrowLeft'] && !keys['ArrowRight'] && steer === 0) {
        // Optional: Reset if no keys pressed, but might conflict with touch
        // For now, let's just let keyboard take priority when keys are active
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [status]);

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      update();
      draw();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [update, car, status]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Road/Background
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Obstacles
    gameState.current.obstacles.forEach(obs => {
      if (obs.type === 'CURB') {
        ctx.fillStyle = '#34495e';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // Curb edge
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 4;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      } else if (obs.type === 'CAR') {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // Windows
        ctx.fillStyle = '#3498db';
        ctx.fillRect(obs.x + 5, obs.y + 10, obs.w - 10, 15);
        ctx.fillRect(obs.x + 5, obs.y + obs.h - 25, obs.w - 10, 15);
      } else if (obs.type === 'PARKING') {
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(241, 196, 15, 0.1)';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 12px font-sans';
        ctx.textAlign = 'center';
        ctx.fillText('PARK HERE', obs.x + obs.w / 2, obs.y + obs.h / 2);
      }
    });

    // Draw Player Car
    ctx.save();
    ctx.translate(car.x, car.y);
    
    // Draw Drift Smoke/Tire Marks
    if (car.drift > 0.3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-CAR_WIDTH/2 + Math.random()*CAR_WIDTH, CAR_HEIGHT/2 + Math.random()*10, 5, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.rotate(car.angle);

    // Car Body
    ctx.fillStyle = '#3498db';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);

    // Roof
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(-CAR_WIDTH / 2 + 5, -CAR_HEIGHT / 2 + 15, CAR_WIDTH - 10, CAR_HEIGHT - 30);

    // Windows
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(-CAR_WIDTH / 2 + 8, -CAR_HEIGHT / 2 + 20, CAR_WIDTH - 16, 10); // Front
    ctx.fillRect(-CAR_WIDTH / 2 + 8, CAR_HEIGHT / 2 - 30, CAR_WIDTH - 16, 10); // Back

    // Headlights
    ctx.fillStyle = car.speed > 0 ? '#f1c40f' : '#fff';
    ctx.fillRect(-CAR_WIDTH / 2 + 5, -CAR_HEIGHT / 2 - 2, 10, 4);
    ctx.fillRect(CAR_WIDTH / 2 - 15, -CAR_HEIGHT / 2 - 2, 10, 4);

    // Taillights
    ctx.fillStyle = controls.current.brake ? '#e74c3c' : '#c0392b';
    ctx.fillRect(-CAR_WIDTH / 2 + 5, CAR_HEIGHT / 2 - 2, 10, 4);
    ctx.fillRect(CAR_WIDTH / 2 - 15, CAR_HEIGHT / 2 - 2, 10, 4);

    ctx.restore();
  };

  const handleBack = () => {
    onBack();
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a] overflow-hidden p-0 sm:p-4">
      {/* Game Canvas Container */}
      <div className="relative w-full max-w-[800px] aspect-[4/3] bg-zinc-900 sm:rounded-3xl border-0 sm:border-4 border-zinc-800 overflow-hidden shadow-2xl touch-none">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full"
        />

        {/* HUD Top - Moved inside container for better alignment */}
        <div className="absolute top-0 left-0 right-0 p-3 sm:p-6 flex justify-between items-center z-10 pointer-events-none">
          <button
            onClick={handleBack}
            className="p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all pointer-events-auto backdrop-blur-md border border-white/10"
          >
            <X className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
          </button>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 sm:gap-2 bg-black/40 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <Fuel className={`w-3 h-3 sm:w-4 sm:h-4 ${car.fuel < 20 ? 'text-red-500 animate-pulse' : 'text-green-400'}`} />
                <div className="w-16 sm:w-24 h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${car.fuel < 20 ? 'bg-red-500' : 'bg-green-400'}`} style={{ width: `${car.fuel}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 mt-1 sm:mt-2 bg-black/40 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <AlertTriangle className={`w-3 h-3 sm:w-4 sm:h-4 ${car.damage > 70 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`} />
                <div className="w-16 sm:w-24 h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${car.damage}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

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
                <div className="w-16 h-16 sm:w-24 sm:h-24 bg-blue-600 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg shadow-blue-600/20">
                  <Car className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                </div>
                <h1 className="text-3xl sm:text-5xl font-black text-white mb-1 sm:mb-2 tracking-tighter uppercase italic">Dr. Driving</h1>
                <p className="text-blue-400 font-mono text-[10px] sm:text-sm mb-6 sm:mb-8 uppercase tracking-widest italic">Mars Traffic Simulator</p>
                
                <div className="flex flex-col gap-3 sm:gap-4">
                  <button
                    onClick={() => startGame(false)}
                    className="group relative px-8 sm:px-12 py-3 sm:py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-lg sm:text-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-3"
                  >
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                    {level > 1 ? `CONTINUE LEVEL ${level}` : 'START ENGINE'}
                  </button>
                  {level > 1 && (
                    <button
                      onClick={() => startGame(true)}
                      className="px-8 sm:px-12 py-2 sm:py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-full font-bold text-xs sm:text-sm transition-all border border-white/5"
                    >
                      RESET PROGRESS
                    </button>
                  )}
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="px-8 sm:px-12 py-3 sm:py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-base sm:text-lg transition-all border border-white/10"
                  >
                    DRIVING SCHOOL
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Game Over / Success Screens */}
          {(status === 'GAMEOVER' || status === 'SUCCESS') && (
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
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg ${status === 'SUCCESS' ? 'bg-green-500 shadow-green-500/20' : 'bg-red-500 shadow-red-500/20'}`}>
                  {status === 'SUCCESS' ? <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-white" /> : <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-white mb-1 sm:mb-2 uppercase italic">
                  {status === 'SUCCESS' ? `Level ${level} Clear` : 'Total Wreck'}
                </h2>
                <p className={`${status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'} font-mono text-[10px] sm:text-sm mb-6 sm:mb-8 uppercase tracking-widest`}>
                  {status === 'SUCCESS' ? 'Perfect Parking' : 'License Revoked'}
                </p>

                <div className="bg-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8 border border-white/10">
                  <div className="text-white/40 text-[10px] uppercase tracking-widest mb-1">Score</div>
                  <div className="text-3xl sm:text-5xl font-black text-white mb-2 sm:mb-4 font-mono">{score}</div>
                  <div className="h-px bg-white/10 mb-2 sm:mb-4" />
                  <div className="flex justify-between items-center">
                    <span className="text-white/40 text-[10px] uppercase tracking-widest">High Score</span>
                    <span className="text-white font-mono font-bold text-sm sm:text-base">{highScore}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:gap-4">
                  {status === 'SUCCESS' ? (
                    <button
                      onClick={nextLevel}
                      className="px-8 sm:px-12 py-3 sm:py-4 bg-green-500 text-white hover:bg-green-400 rounded-full font-bold text-lg sm:text-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-500/20"
                    >
                      <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                      NEXT LEVEL
                    </button>
                  ) : (
                    <button
                      onClick={() => startGame(false)}
                      className="px-8 sm:px-12 py-3 sm:py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg sm:text-xl transition-all flex items-center justify-center gap-3"
                    >
                      <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                      RETRY MISSION
                    </button>
                  )}
                  <button
                    onClick={onBack}
                    className="px-8 sm:px-12 py-3 sm:py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-base sm:text-lg transition-all border border-white/10"
                  >
                    EXIT TO HUB
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls Overlay */}
        {status === 'PLAYING' && (
          <div className="absolute inset-0 pointer-events-none select-none">
            {/* Steering Wheel */}
            <div className="absolute bottom-4 sm:bottom-10 left-4 sm:left-10 w-32 h-32 sm:w-48 md:w-56 sm:h-48 md:h-56 pointer-events-auto">
              <div 
                className="relative w-full h-full rounded-full border-[6px] sm:border-[12px] border-zinc-800 bg-zinc-900/40 flex items-center justify-center transition-transform duration-75 shadow-2xl"
                style={{ 
                  transform: `rotate(${car.steering * 180}deg)`,
                  boxShadow: `0 0 40px rgba(37, 99, 235, ${Math.abs(car.steering) * 0.2})`
                }}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const handleMove = (moveEvent: MouseEvent) => {
                    const x = moveEvent.clientX - (rect.left + rect.width / 2);
                    controls.current.steering = Math.max(-1, Math.min(1, x / (rect.width / 2)));
                  };
                  window.addEventListener('mousemove', handleMove);
                  window.addEventListener('mouseup', () => {
                    window.removeEventListener('mousemove', handleMove);
                    controls.current.steering = 0;
                  }, { once: true });
                }}
                onTouchMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const touch = e.touches[0];
                  const x = touch.clientX - (rect.left + rect.width / 2);
                  controls.current.steering = Math.max(-1, Math.min(1, x / (rect.width / 2)));
                }}
                onTouchEnd={() => controls.current.steering = 0}
              >
                {/* Grip Textures */}
                <div className="absolute inset-0 rounded-full border-t-4 sm:border-t-8 border-blue-500/20 rotate-45" />
                <div className="absolute inset-0 rounded-full border-b-4 sm:border-b-8 border-blue-500/20 -rotate-45" />
                
                {/* Spokes */}
                <div className="w-full h-2 sm:h-4 bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 absolute top-1/2 -translate-y-1/2 rounded-full" />
                <div className="w-2 sm:w-4 h-1/2 bg-gradient-to-b from-zinc-700 to-zinc-800 absolute top-1/2 left-1/2 -translate-x-1/2 rounded-b-full" />
                
                {/* Center Hub */}
                <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-zinc-800 border-2 sm:border-4 border-zinc-700 flex items-center justify-center shadow-inner relative z-10">
                  <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-pulse" />
                  <Car className={`w-5 h-5 sm:w-8 sm:h-8 transition-colors duration-300 ${Math.abs(car.steering) > 0.5 ? 'text-blue-400' : 'text-white/40'}`} />
                </div>

                {/* Top Marker */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-0.5 sm:-translate-y-1 w-2 sm:w-4 h-2 sm:h-4 bg-blue-500 rounded-sm shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              </div>
              
              {/* Steering Angle Display */}
              <div className="absolute -bottom-6 sm:-bottom-8 left-1/2 -translate-x-1/2 font-mono text-[8px] sm:text-[10px] text-blue-400/60 uppercase tracking-widest whitespace-nowrap">
                {Math.round(car.steering * 180)}°
              </div>
            </div>

            {/* Pedals */}
            <div className="absolute bottom-4 sm:bottom-10 right-4 sm:right-10 flex gap-3 sm:gap-6 pointer-events-auto">
              {/* Brake */}
              <button
                onMouseDown={() => controls.current.brake = true}
                onMouseUp={() => controls.current.brake = false}
                onMouseLeave={() => controls.current.brake = false}
                onTouchStart={() => controls.current.brake = true}
                onTouchEnd={() => controls.current.brake = false}
                className={`w-12 sm:w-20 h-24 sm:h-32 rounded-lg sm:rounded-xl border-2 sm:border-4 transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 ${controls.current.brake ? 'bg-red-500 border-red-400 scale-95' : 'bg-zinc-800/80 border-zinc-700'}`}
              >
                <ArrowDown className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                <span className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest">Brake</span>
              </button>
              {/* Gas */}
              <button
                onMouseDown={() => controls.current.gas = true}
                onMouseUp={() => controls.current.gas = false}
                onMouseLeave={() => controls.current.gas = false}
                onTouchStart={() => controls.current.gas = true}
                onTouchEnd={() => controls.current.gas = false}
                className={`w-12 sm:w-20 h-32 sm:h-40 rounded-lg sm:rounded-xl border-2 sm:border-4 transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 ${controls.current.gas ? 'bg-green-500 border-green-400 scale-95' : 'bg-zinc-800/80 border-zinc-700'}`}
              >
                <ArrowUp className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                <span className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest">Gas</span>
              </button>
            </div>

            {/* Gear Shift */}
            <div className="absolute bottom-4 sm:bottom-10 left-1/2 -translate-x-1/2 flex gap-1 sm:gap-2 bg-black/60 p-1 sm:p-2 rounded-xl sm:rounded-2xl border border-white/10 backdrop-blur-md pointer-events-auto">
              {['P', 'R', 'D'].map(g => (
                <button
                  key={g}
                  onClick={() => setCar(prev => ({ ...prev, gear: g as any, speed: 0 }))}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl font-black text-sm sm:text-base transition-all ${car.gear === g ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-white/40 hover:bg-white/5'}`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Speedometer */}
            <div className="absolute top-12 sm:top-10 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-6 bg-black/60 px-4 sm:px-8 py-2 sm:py-4 rounded-2xl sm:rounded-3xl border border-white/10 backdrop-blur-md">
              <div className="flex flex-col items-center">
                <span className="text-[8px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest">Speed</span>
                <span className="text-xl sm:text-3xl font-black text-white font-mono">{Math.abs(Math.floor(car.speed * 20))}</span>
              </div>
              <div className="w-px h-6 sm:h-10 bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest">Level</span>
                <span className="text-xl sm:text-3xl font-black text-green-500 font-mono">{level}</span>
              </div>
              <div className="w-px h-6 sm:h-10 bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest">Gear</span>
                <span className="text-xl sm:text-3xl font-black text-blue-500 font-mono">{car.gear}</span>
              </div>
            </div>
          </div>
        )}
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
                  <h3 className="text-2xl font-black text-white uppercase italic">Driving School</h3>
                  <p className="text-blue-500 font-mono text-xs uppercase tracking-widest">Mars License Training</p>
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
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                    <RotateCw className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Steering Wheel</h4>
                    <p className="text-white/60 text-sm">Drag the steering wheel or use <span className="text-blue-400 font-bold">LEFT/RIGHT ARROWS</span> to turn.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                    <ArrowUp className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Gas & Brake</h4>
                    <p className="text-white/60 text-sm">Use <span className="text-green-500 font-bold">UP ARROW</span> for Gas and <span className="text-red-500 font-bold">DOWN ARROW</span> for Brake.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
                    <Navigation className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Gear Shift</h4>
                    <p className="text-white/60 text-sm">Switch between <span className="text-white font-bold">D</span> (Drive), <span className="text-white font-bold">R</span> (Reverse), and <span className="text-white font-bold">P</span> (Park).</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                    <Target className="w-6 h-6 text-yellow-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">Mission: Parking</h4>
                    <p className="text-white/60 text-sm">Navigate to the yellow parking zone and come to a complete stop to finish the mission.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowTutorial(false)}
                className="w-full mt-8 py-4 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-all uppercase tracking-widest"
              >
                START TRAINING
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

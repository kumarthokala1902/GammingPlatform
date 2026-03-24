/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, ChevronRight, Pause, X, ArrowLeft, Target, Zap, Info } from 'lucide-react';
import { db, collection, setDoc, doc, serverTimestamp, OperationType, handleFirestoreError } from '../firebase';

const ROWS = 12;
const COLS = 10;
const BUBBLE_RADIUS = 20;
const COLORS = ['#ff4444', '#4ade80', '#60a5fa', '#fbbf24', '#a855f7', '#ec4899'];

interface Bubble {
  x: number;
  y: number;
  color: string;
  active: boolean;
  row: number;
  col: number;
  displayX?: number;
  displayY?: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  active: boolean;
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

type GameStatus = 'START' | 'TUTORIAL' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'WIN';

interface BubbleShooterProps {
  onBack: () => void;
  user: any;
  onGameEnd?: (score: number, playtime: number) => void;
}

export default function BubbleShooter({ onBack, user, onGameEnd }: BubbleShooterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(25);
  const [tutorialStep, setTutorialStep] = useState(0);

  const tutorialSteps = [
    {
      title: "Aiming",
      description: "Move your mouse or touch the screen to aim your bubble launcher.",
      icon: <Target className="w-8 h-8 text-blue-400" />
    },
    {
      title: "Shooting",
      description: "Click or Tap to shoot. Match 3 or more bubbles of the same color to pop them.",
      icon: <Zap className="w-8 h-8 text-yellow-400" />
    },
    {
      title: "Objective",
      description: "Clear all bubbles before you run out of shots or they reach the bottom!",
      icon: <Trophy className="w-8 h-8 text-orange-400" />
    }
  ];
  
  const gameState = useRef({
    grid: [] as (Bubble | null)[][],
    projectile: null as Projectile | null,
    nextColor: COLORS[0],
    angle: -Math.PI / 2,
    score: 0,
    particles: [] as Particle[],
    comboPopups: [] as ComboPopup[],
    popupId: 0,
    shake: 0,
    lastFrameTime: 0,
    mouse: { x: 0, y: 0 },
    isShooting: false,
    startTime: 0,
    shotsLeft: 25,
  });

  useEffect(() => {
    const savedHighScore = localStorage.getItem('bubbleShooterHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));
  }, []);

  const initGrid = useCallback(() => {
    const grid: (Bubble | null)[][] = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        if (r < 5) {
          const offset = r % 2 === 0 ? 0 : BUBBLE_RADIUS;
          const x = c * BUBBLE_RADIUS * 2 + BUBBLE_RADIUS + offset;
          const y = r * BUBBLE_RADIUS * 1.732 + BUBBLE_RADIUS;
          grid[r][c] = {
            x,
            y,
            displayX: x,
            displayY: y,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            active: true,
            row: r,
            col: c
          };
        } else {
          grid[r][c] = null;
        }
      }
    }
    gameState.current.grid = grid;
    gameState.current.nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  }, []);

  const startGame = () => {
    initGrid();
    gameState.current.score = 0;
    gameState.current.particles = [];
    gameState.current.comboPopups = [];
    gameState.current.shake = 0;
    gameState.current.projectile = null;
    gameState.current.startTime = performance.now();
    gameState.current.lastFrameTime = performance.now();
    gameState.current.shotsLeft = 25;
    setShotsLeft(25);
    setScore(0);
    setStatus('PLAYING');
  };

  const startTutorial = () => {
    setTutorialStep(0);
    setStatus('TUTORIAL');
  };

  const saveScore = useCallback(async (currentScore: number) => {
    if (currentScore > highScore) {
      setHighScore(currentScore);
      localStorage.setItem('bubbleShooterHighScore', currentScore.toString());
    }

    const playtime = Math.floor((performance.now() - gameState.current.startTime) / 1000);
    if (onGameEnd) {
      onGameEnd(currentScore, playtime);
    }

    if (user && currentScore > 0) {
      try {
        const scoreRef = doc(collection(db, 'scores'));
        await setDoc(scoreRef, {
          userId: user.uid,
          username: user.username,
          gameId: 'BUBBLE_SHOOTER',
          score: currentScore,
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'scores');
      }
    }
  }, [highScore, user, onGameEnd]);

  const gameOver = useCallback(async () => {
    setStatus('GAMEOVER');
    await saveScore(gameState.current.score);
  }, [saveScore]);

  const getNeighbors = (row: number, col: number) => {
    const neighbors = [];
    const offsets = row % 2 === 0 
      ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
      : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];

    for (const [dr, dc] of offsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        neighbors.push({ row: nr, col: nc });
      }
    }
    return neighbors;
  };

  const findCluster = (row: number, col: number, color: string) => {
    const cluster: { row: number, col: number }[] = [];
    const queue = [{ row, col }];
    const visited = new Set<string>();
    visited.add(`${row},${col}`);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      cluster.push(curr);

      const neighbors = getNeighbors(curr.row, curr.col);
      for (const neighbor of neighbors) {
        const bubble = gameState.current.grid[neighbor.row][neighbor.col];
        const key = `${neighbor.row},${neighbor.col}`;
        if (bubble && bubble.color === color && !visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }
    return cluster;
  };

  const dropOrphans = () => {
    const connected = new Set<string>();
    const queue: { row: number, col: number }[] = [];

    // Start with top row
    for (let c = 0; c < COLS; c++) {
      if (gameState.current.grid[0][c]) {
        connected.add(`0,${c}`);
        queue.push({ row: 0, col: c });
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = getNeighbors(curr.row, curr.col);
      for (const neighbor of neighbors) {
        const bubble = gameState.current.grid[neighbor.row][neighbor.col];
        const key = `${neighbor.row},${neighbor.col}`;
        if (bubble && !connected.has(key)) {
          connected.add(key);
          queue.push(neighbor);
        }
      }
    }

    let droppedCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (gameState.current.grid[r][c] && !connected.has(`${r},${c}`)) {
          const b = gameState.current.grid[r][c]!;
          // Add particles for dropped bubbles
          for (let i = 0; i < 5; i++) {
            gameState.current.particles.push({
              x: b.displayX || b.x,
              y: b.displayY || b.y,
              vx: (Math.random() - 0.5) * 5,
              vy: Math.random() * 5,
              life: 1.0,
              color: b.color
            });
          }
          gameState.current.grid[r][c] = null;
          droppedCount++;
        }
      }
    }
    return droppedCount;
  };

  const checkAndPop = (row: number, col: number, color: string) => {
    const cluster = findCluster(row, col, color);
    if (cluster.length >= 3) {
      cluster.forEach(spot => {
        const b = gameState.current.grid[spot.row][spot.col]!;
        for (let i = 0; i < 10; i++) {
          gameState.current.particles.push({
            x: b.displayX || b.x,
            y: b.displayY || b.y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: b.color
          });
        }
        gameState.current.grid[spot.row][spot.col] = null;
      });

      const dropped = dropOrphans();
      const totalPopped = cluster.length + dropped;
      const points = totalPopped * 10 * (cluster.length >= 5 ? 2 : 1);
      gameState.current.score += points;
      setScore(gameState.current.score);
      
      gameState.current.shake = 10;
      gameState.current.comboPopups.push({
        id: gameState.current.popupId++,
        x: COLS * BUBBLE_RADIUS, // Center-ish
        y: row * BUBBLE_RADIUS * 1.732,
        text: `+${points}`,
        life: 1.0,
        color: color
      });

      return true;
    }
    return false;
  };

  const applyMagneticLogic = () => {
    let changed = false;
    const grid = gameState.current.grid;
    
    // Iterate through all bubbles to see if they should "slide" to join same-colored neighbors
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const bubble = grid[r][c];
        if (!bubble) continue;
        
        const neighbors = getNeighbors(r, c);
        const currentSameColor = neighbors.filter(n => grid[n.row][n.col]?.color === bubble.color).length;
        
        let bestR = r;
        let bestC = c;
        let maxSameColor = currentSameColor;
        
        const emptyNeighbors = neighbors.filter(n => !grid[n.row][n.col]);
        for (const empty of emptyNeighbors) {
          const potentialNeighbors = getNeighbors(empty.row, empty.col);
          const potentialSameColor = potentialNeighbors.filter(n => 
            (n.row !== r || n.col !== c) && 
            grid[n.row][n.col]?.color === bubble.color
          ).length;
          
          // Priority: More same color neighbors, then higher row (closer to top)
          if (potentialSameColor > maxSameColor || (potentialSameColor === maxSameColor && empty.row < bestR)) {
            maxSameColor = potentialSameColor;
            bestR = empty.row;
            bestC = empty.col;
          }
        }
        
        if (bestR !== r || bestC !== c) {
          const targetOffset = bestR % 2 === 0 ? 0 : BUBBLE_RADIUS;
          const targetX = bestC * BUBBLE_RADIUS * 2 + BUBBLE_RADIUS + targetOffset;
          const targetY = bestR * BUBBLE_RADIUS * 1.732 + BUBBLE_RADIUS;
          
          grid[bestR][bestC] = {
            ...bubble,
            row: bestR,
            col: bestC,
            displayX: bubble.displayX || bubble.x,
            displayY: bubble.displayY || bubble.y,
            x: targetX,
            y: targetY
          };
          grid[r][c] = null;
          changed = true;
          
          // If it moved, check if it now forms a cluster
          if (checkAndPop(bestR, bestC, bubble.color)) {
            // If it popped, we might need another pass
            changed = true;
          }
        }
      }
    }
    return changed;
  };

  const handleCollision = (proj: Projectile) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Backtrack slightly to find the point of impact more accurately
    const backstep = 0.5;
    let testX = proj.x;
    let testY = proj.y;
    
    if (testY > BUBBLE_RADIUS) {
      testX -= proj.vx * backstep;
      testY -= proj.vy * backstep;
    }

    // Find the best empty cell to snap to
    // Enhanced logic: check neighbors and prefer those that create a match or have same-colored neighbors
    let bestR = -1;
    let bestC = -1;
    let bestScore = -1;
    let minDistance = Infinity;

    // Search area around the impact point
    const startR = Math.max(0, Math.floor((testY - BUBBLE_RADIUS * 2) / (BUBBLE_RADIUS * 1.732)));
    const endR = Math.min(ROWS - 1, Math.ceil((testY + BUBBLE_RADIUS * 2) / (BUBBLE_RADIUS * 1.732)));

    for (let r = startR; r <= endR; r++) {
      const offset = r % 2 === 0 ? 0 : BUBBLE_RADIUS;
      for (let c = 0; c < COLS; c++) {
        if (gameState.current.grid[r][c]) continue;

        const nx = c * BUBBLE_RADIUS * 2 + BUBBLE_RADIUS + offset;
        const ny = r * BUBBLE_RADIUS * 1.732 + BUBBLE_RADIUS;
        const dist = Math.hypot(testX - nx, testY - ny);

        if (dist < BUBBLE_RADIUS * 2.5) {
          const neighbors = getNeighbors(r, c);
          const sameColorCount = neighbors.filter(n => gameState.current.grid[n.row][n.col]?.color === proj.color).length;
          
          // Score based on same-colored neighbors and distance
          // Matches (3+) get a huge boost
          const clusterSize = findCluster(r, c, proj.color).length;
          const score = (clusterSize >= 3 ? 1000 : 0) + (sameColorCount * 100) + (100 - dist);

          if (score > bestScore) {
            bestScore = score;
            bestR = r;
            bestC = c;
            minDistance = dist;
          } else if (score === bestScore && dist < minDistance) {
            bestR = r;
            bestC = c;
            minDistance = dist;
          }
        }
      }
    }

    // Fallback to simple distance if no "smart" spot found
    if (bestR === -1) {
      let row = Math.round((testY - BUBBLE_RADIUS) / (BUBBLE_RADIUS * 1.732));
      row = Math.max(0, Math.min(ROWS - 1, row));
      const offset = row % 2 === 0 ? 0 : BUBBLE_RADIUS;
      let col = Math.round((testX - BUBBLE_RADIUS - offset) / (BUBBLE_RADIUS * 2));
      col = Math.max(0, Math.min(COLS - 1, col));
      bestR = row;
      bestC = col;
    }

    if (!gameState.current.grid[bestR][bestC]) {
      const finalOffset = bestR % 2 === 0 ? 0 : BUBBLE_RADIUS;
      gameState.current.grid[bestR][bestC] = {
        x: bestC * BUBBLE_RADIUS * 2 + BUBBLE_RADIUS + finalOffset,
        y: bestR * BUBBLE_RADIUS * 1.732 + BUBBLE_RADIUS,
        displayX: proj.x,
        displayY: proj.y,
        color: proj.color,
        active: true,
        row: bestR,
        col: bestC
      };

      // Check for pops and chain reactions
      const popped = checkAndPop(bestR, bestC, proj.color);
      
      // Apply magnetic sliding logic to fill gaps and maintain cohesion
      let sliding = true;
      let passes = 0;
      while (sliding && passes < 3) {
        sliding = applyMagneticLogic();
        passes++;
      }

      // Check for Win (all bubbles cleared)
      let bubblesRemaining = false;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (gameState.current.grid[r][c]) {
            bubblesRemaining = true;
            break;
          }
        }
        if (bubblesRemaining) break;
      }

      if (!bubblesRemaining) {
        const efficiencyBonus = gameState.current.shotsLeft * 100;
        gameState.current.score += efficiencyBonus;
        setScore(gameState.current.score);
        setStatus('WIN');
        saveScore(gameState.current.score);
        return;
      }

      // Check for Game Over (reached bottom)
      for (let c = 0; c < COLS; c++) {
        if (gameState.current.grid[ROWS - 1][c]) {
          gameOver();
          return;
        }
      }

      // Check for Game Over (out of shots)
      if (gameState.current.shotsLeft <= 0) {
        gameOver();
        return;
      }
    }

    gameState.current.projectile = null;
    gameState.current.isShooting = false;
  };

  const shoot = () => {
    if (gameState.current.isShooting || status !== 'PLAYING' || gameState.current.shotsLeft <= 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameState.current.shotsLeft -= 1;
    setShotsLeft(gameState.current.shotsLeft);
    const speed = 12;
    gameState.current.projectile = {
      x: canvas.width / 2,
      y: canvas.height - 40,
      vx: Math.cos(gameState.current.angle) * speed,
      vy: Math.sin(gameState.current.angle) * speed,
      color: gameState.current.nextColor,
      active: true
    };
    
    gameState.current.nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    gameState.current.isShooting = true;
  };

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

      const dt = (time - gameState.current.lastFrameTime) / 16.67 || 1;
      gameState.current.lastFrameTime = time;

      // Update Projectile
      if (gameState.current.projectile) {
        const p = gameState.current.projectile;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wall Bounce
        if (p.x < BUBBLE_RADIUS || p.x > canvas.width - BUBBLE_RADIUS) {
          p.vx *= -1;
          p.x = p.x < BUBBLE_RADIUS ? BUBBLE_RADIUS : canvas.width - BUBBLE_RADIUS;
        }

        // Top Collision
        if (p.y < BUBBLE_RADIUS) {
          handleCollision(p);
        } else {
          // Bubble Collision
          let collided = false;
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const b = gameState.current.grid[r][c];
              if (b) {
                const dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (dist < BUBBLE_RADIUS * 1.8) {
                  collided = true;
                  break;
                }
              }
            }
            if (collided) break;
          }
          if (collided) handleCollision(p);
        }
      }

      // Update Effects
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
      ctx.clearRect(-50, -50, canvas.width + 100, canvas.height + 100);

      // Draw Grid Bubbles
      gameState.current.grid.forEach(row => {
        row.forEach(b => {
          if (b) {
            // Smooth sliding animation
            if (b.displayX === undefined) b.displayX = b.x;
            if (b.displayY === undefined) b.displayY = b.y;
            
            b.displayX += (b.x - b.displayX) * 0.15;
            b.displayY += (b.y - b.displayY) * 0.15;

            ctx.save();
            ctx.translate(b.displayX, b.displayY);
            
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.color;
            ctx.beginPath();
            ctx.arc(0, 0, BUBBLE_RADIUS - 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(-5, -5, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        });
      });

      // Draw Launcher
      const lx = canvas.width / 2;
      const ly = canvas.height - 40;

      // Draw Trajectory Line
      if (!gameState.current.isShooting && status === 'PLAYING') {
        ctx.save();
        ctx.setLineDash([5, 10]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        
        const dx = Math.cos(gameState.current.angle);
        const dy = Math.sin(gameState.current.angle);
        let tx = lx;
        let ty = ly;
        
        // Simple trajectory simulation (just a straight line for now)
        for (let i = 0; i < 20; i++) {
          tx += dx * 30;
          ty += dy * 30;
          if (tx < BUBBLE_RADIUS || tx > canvas.width - BUBBLE_RADIUS) break;
          if (ty < BUBBLE_RADIUS) break;
          
          // Check if hitting a bubble
          let hit = false;
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const b = gameState.current.grid[r][c];
              if (b) {
                if (Math.hypot(tx - b.x, ty - b.y) < BUBBLE_RADIUS * 2) {
                  hit = true;
                  break;
                }
              }
            }
            if (hit) break;
          }
          if (hit) break;
        }
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(gameState.current.angle);
      
      // Launcher Body
      ctx.fillStyle = '#333';
      ctx.fillRect(0, -10, 40, 20);
      ctx.restore();

      // Current Bubble in Launcher
      ctx.fillStyle = gameState.current.nextColor;
      ctx.shadowBlur = 15;
      ctx.shadowColor = gameState.current.nextColor;
      ctx.beginPath();
      ctx.arc(lx, ly, BUBBLE_RADIUS - 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw Projectile
      if (gameState.current.projectile) {
        const p = gameState.current.projectile;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, BUBBLE_RADIUS - 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Particles
      gameState.current.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Popups
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      gameState.current.angle = Math.atan2(y - (canvas.height - 40), x - canvas.width / 2);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      gameState.current.angle = Math.atan2(y - (canvas.height - 40), x - canvas.width / 2);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('mousedown', shoot);
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      shoot();
    });

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('mousedown', shoot);
    };
  }, [status]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = Math.min(window.innerWidth - 40, 400);
      canvas.width = size;
      canvas.height = size * 1.5;
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-[400px] flex justify-between items-end mb-6 z-10">
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
        <div className="flex flex-col items-center">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-1">Shots Left</p>
          <div className={`text-4xl font-black tracking-tighter ${shotsLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {shotsLeft}
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-1">Best</p>
          <div className="flex items-center justify-end gap-2 text-xl font-semibold text-white/80 mb-2">
            <Trophy size={18} className="text-yellow-500" />
            {highScore}
          </div>
        </div>
      </div>

      <div className="relative z-10 group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-20 transition duration-1000"></div>
        <canvas ref={canvasRef} className="relative bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl touch-none cursor-crosshair" />

        <AnimatePresence>
          {status === 'START' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl p-8 text-center backdrop-blur-md">
              <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-blue-600/20">
                <Play size={40} fill="white" />
              </div>
              <h2 className="text-3xl font-bold mb-2 tracking-tight">Bubble Blast</h2>
              <p className="text-white/60 mb-8 max-w-[280px] text-sm">Match 3 or more bubbles of the same color to pop them! You have 25 shots to clear the board.</p>
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

        {status === 'WIN' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-2xl p-4 sm:p-8 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-yellow-500 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-lg shadow-yellow-500/50">
                <Trophy size={32} className="text-white sm:hidden" />
                <Trophy size={40} className="text-white hidden sm:block" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">You Win!</h2>
              <p className="text-white/60 mb-6 sm:mb-8 font-medium text-xs sm:text-base">Amazing! You cleared all bubbles within the shot limit.</p>
              
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8 w-full">
                <div className="bg-white/5 p-3 sm:p-4 rounded-2xl border border-white/10">
                  <div className="text-white/40 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest mb-1">Final Score</div>
                  <div className="text-white text-lg sm:text-xl font-black tracking-tighter">{score}</div>
                </div>
                <div className="bg-white/5 p-3 sm:p-4 rounded-2xl border border-white/10">
                  <div className="text-white/40 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest mb-1">Shots Saved</div>
                  <div className="text-white text-lg sm:text-xl font-black tracking-tighter">{shotsLeft}</div>
                </div>
              </div>

              <button onClick={startGame} className="w-full max-w-[240px] py-3 sm:py-4 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl uppercase italic tracking-tighter text-sm sm:text-base">
                <RotateCcw size={18} /> Play Again
              </button>
            </motion.div>
          )}

          {status === 'GAMEOVER' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-2xl p-4 sm:p-8 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-500 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-lg shadow-red-500/50">
                <X size={32} className="text-white sm:hidden" />
                <X size={40} className="text-white hidden sm:block" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">Game Over</h2>
              <p className="text-white/60 mb-6 sm:mb-8 font-medium text-xs sm:text-base">Out of shots or bubbles reached the bottom!</p>
              
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8 w-full">
                <div className="bg-white/5 p-3 sm:p-4 rounded-2xl border border-white/10">
                  <div className="text-white/40 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest mb-1">Final Score</div>
                  <div className="text-white text-2xl sm:text-3xl font-black tracking-tighter">{score}</div>
                </div>
                <div className="bg-white/5 p-3 sm:p-4 rounded-2xl border border-white/10">
                  <div className="text-white/40 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest mb-1">High Score</div>
                  <div className="text-white text-2xl sm:text-3xl font-black tracking-tighter">{Math.max(score, highScore)}</div>
                </div>
              </div>

              <button onClick={startGame} className="w-full max-w-[240px] py-3 sm:py-4 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl uppercase italic tracking-tighter text-sm sm:text-base">
                <RotateCcw size={18} /> Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 flex gap-8 text-white/30 text-xs font-medium uppercase tracking-widest z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
            <Target size={14} />
          </div>
          <span>Aim & Shoot</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center">
            <RotateCcw size={14} />
          </div>
          <span>Clear the Board</span>
        </div>
      </div>
    </div>
  );
}

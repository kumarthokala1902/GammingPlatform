import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Gamepad2, Zap, LayoutGrid, ChevronRight } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

export default function LandingPage({ onStart }: LandingPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.color = `rgba(99, 102, 241, ${Math.random() * 0.3 + 0.1})`;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvas!.width) this.x = 0;
        if (this.x < 0) this.x = canvas!.width;
        if (this.y > canvas!.height) this.y = 0;
        if (this.y < 0) this.y = canvas!.height;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles = [];
      for (let i = 0; i < 100; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      animationId = requestAnimationFrame(animate);
    };

    init();
    animate();

    window.addEventListener('resize', init);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', init);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center overflow-hidden font-sans">
      {/* Background Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 pointer-events-none opacity-50"
      />

      {/* Decorative Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 blur-[120px] rounded-full animate-pulse delay-700" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* Logo Animation */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
          className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[2rem] flex items-center justify-center shadow-[0_0_50px_rgba(79,70,229,0.4)] mb-12 relative group"
        >
          <div className="absolute inset-0 bg-white/20 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <LayoutGrid size={48} className="text-white relative z-10" />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
        >
          <h1 className="text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 drop-shadow-2xl px-4">
            FORTUMARS<span className="text-indigo-500">HUB</span>
          </h1>
        </motion.div>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
          className="flex items-center gap-2 sm:gap-4 mb-12"
        >
          <div className="h-[1px] w-4 sm:w-8 bg-white/20" />
          <p className="text-sm sm:text-lg md:text-xl font-bold uppercase tracking-[0.15em] sm:tracking-[0.3em] text-white/60 whitespace-nowrap">
            Play. Compete. Win.
          </p>
          <div className="h-[1px] w-4 sm:w-8 bg-white/20" />
        </motion.div>

        {/* Start Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(79,70,229,0.5)" }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.8 }}
          onClick={onStart}
          className="group relative px-8 sm:px-12 py-4 sm:py-5 bg-indigo-600 rounded-full font-black text-lg sm:text-xl uppercase tracking-widest overflow-hidden transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%] animate-[shimmer_2s_infinite_linear] opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative z-10 flex items-center gap-3">
            Start Playing
            <ChevronRight className="group-hover:translate-x-1 transition-transform" />
          </span>
        </motion.button>

        {/* Feature Icons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mt-16 sm:mt-24 flex gap-8 sm:gap-12 text-white/20"
        >
          <div className="flex flex-col items-center gap-2">
            <Zap size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Fast</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Gamepad2 size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Fun</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <LayoutGrid size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Social</span>
          </div>
        </motion.div>
      </div>

      {/* Footer Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.5em] text-white/50 px-4 text-center"
      >
        Powered by AI Studio
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}} />
    </div>
  );
}

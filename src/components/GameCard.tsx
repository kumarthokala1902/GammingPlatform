/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Star } from 'lucide-react';

interface GameCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onSelect: () => void;
  isNew?: boolean;
  theme?: 'DARK' | 'LIGHT';
}

const GameCard: React.FC<GameCardProps> = ({ title, description, icon, color, onSelect, isNew, theme = 'DARK' }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="relative w-full group text-left"
    >
      <div className={`absolute -inset-0.5 bg-gradient-to-br ${color} rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500`}></div>
      <div className={`relative flex items-center gap-6 p-6 ${theme === 'DARK' ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-white border-slate-200 hover:border-indigo-500/30 shadow-sm'} backdrop-blur-md rounded-2xl border transition-all`}>
        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg shadow-black/20`}>
          {icon}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`text-xl font-bold tracking-tight ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
            {isNew && (
              <span className="px-2 py-0.5 bg-indigo-500 text-[10px] font-black uppercase tracking-widest rounded-full text-white">New</span>
            )}
          </div>
          <p className={`text-sm ${theme === 'DARK' ? 'text-white/50' : 'text-slate-500'} line-clamp-1`}>{description}</p>
        </div>

        <div className={`w-10 h-10 rounded-full ${theme === 'DARK' ? 'bg-white/5 group-hover:bg-white/10' : 'bg-slate-100 group-hover:bg-indigo-50'} flex items-center justify-center transition-colors`}>
          <ChevronRight size={20} className={`${theme === 'DARK' ? 'text-white/40 group-hover:text-white' : 'text-slate-400 group-hover:text-indigo-600'} transition-colors`} />
        </div>
      </div>
    </motion.button>
  );
};

export default GameCard;

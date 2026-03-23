/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutGrid, Gamepad2, Trophy, Settings, Search, Bell, User, Zap, Star, Mail, MapPin, Calendar, LogOut, LogIn, Loader2, Sun, Moon, CheckCircle2, AlertCircle } from 'lucide-react';
import ColorDashGrid from './games/ColorDashGrid';
import Snake from './games/Snake';
import BubbleShooter from './games/BubbleShooter';
import GameCard from './components/GameCard';
import LandingPage from './components/LandingPage';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, updateProfile,
  doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, onSnapshot, 
  serverTimestamp, OperationType, handleFirestoreError, FirebaseUser 
} from './firebase';

type GameID = 'COLOR_DASH' | 'SNAKE' | 'BUBBLE_SHOOTER' | null;
type View = 'GAMES' | 'LEADERBOARD' | 'NOTIFICATIONS' | 'USERS' | 'SETTINGS';

interface UserData {
  uid: string;
  username: string;
  email: string;
  avatar: string;
  place: string;
  totalPlaytime: number; // in seconds
  achievements: string[];
  streak: number;
  lastPlayedAt: any;
  createdAt: any;
}

interface ScoreData {
  id: string;
  userId: string;
  username: string;
  gameId: string;
  score: number;
  timestamp: any;
}

export default function App() {
  const [activeGame, setActiveGame] = useState<GameID>(null);
  const [activeView, setActiveView] = useState<View>('GAMES');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalScore, setTotalScore] = useState(0);
  
  // Auth & Profile State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'SIGN_IN' | 'SIGN_UP'>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [setupData, setSetupData] = useState({ username: '', place: '' });

  // Firestore Data State
  const [users, setUsers] = useState<UserData[]>([]);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [theme, setTheme] = useState<'DARK' | 'LIGHT'>('DARK');

  // Settings States
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'SUCCESS' | 'ERROR', text: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [leaderboardGameFilter, setLeaderboardGameFilter] = useState<GameID | 'ALL'>('ALL');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserData);
            setShowProfileSetup(false);
          } else {
            setShowProfileSetup(true);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
        setShowProfileSetup(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Real-time Listeners
  useEffect(() => {
    if (!user) return;

    // Listen for all users
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => doc.data() as UserData);
      setUsers(usersData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    // Listen for top scores
    const scoresQuery = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(50));
    const scoresUnsubscribe = onSnapshot(scoresQuery, (snapshot) => {
      const scoresData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScoreData));
      setScores(scoresData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'scores'));

    return () => {
      usersUnsubscribe();
      scoresUnsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !scores.length) return;
    const userScores = scores.filter(s => s.userId === user.uid);
    const total = userScores.reduce((acc, curr) => acc + curr.score, 0);
    setTotalScore(total);
  }, [user, scores]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error('Login failed:', error);
        setAuthError(error.message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError(null);

    try {
      if (authMode === 'SIGN_UP') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Auth failed:', error);
      setAuthError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveGame(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const newProfile: UserData = {
      uid: user.uid,
      username: setupData.username,
      email: user.email || '',
      place: setupData.place,
      avatar: user.photoURL || `https://picsum.photos/seed/${user.uid}/100`,
      totalPlaytime: 0,
      achievements: [],
      streak: 1,
      lastPlayedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setShowProfileSetup(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
    }
  };

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newUsername.trim() || isUpdating) return;
    setIsUpdating(true);
    setSettingsMessage(null);
    try {
      await updateDoc(doc(db, 'users', user.uid), { username: newUsername });
      setProfile(prev => prev ? { ...prev, username: newUsername } : null);
      setSettingsMessage({ type: 'SUCCESS', text: 'Username updated successfully!' });
      setNewUsername('');
    } catch (error) {
      console.error('Update username failed:', error);
      setSettingsMessage({ type: 'ERROR', text: 'Failed to update username.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPassword.trim() || isUpdating) return;
    setIsUpdating(true);
    setSettingsMessage(null);
    try {
      await updatePassword(user, newPassword);
      setSettingsMessage({ type: 'SUCCESS', text: 'Password updated successfully!' });
      setNewPassword('');
    } catch (error: any) {
      console.error('Update password failed:', error);
      if (error.code === 'auth/requires-recent-login') {
        setSettingsMessage({ type: 'ERROR', text: 'Please logout and login again to change password.' });
      } else {
        setSettingsMessage({ type: 'ERROR', text: error.message || 'Failed to update password.' });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'DARK' ? 'LIGHT' : 'DARK');
  };

  useEffect(() => {
    const colorDashScore = parseInt(localStorage.getItem('colorDashHighScore') || '0');
    const snakeScore = parseInt(localStorage.getItem('snakeHighScore') || '0');
    const bubbleShooterScore = parseInt(localStorage.getItem('bubbleShooterHighScore') || '0');
    setTotalScore(colorDashScore + snakeScore + bubbleShooterScore);
  }, [activeGame]);

  const games = [
    {
      id: 'COLOR_DASH' as GameID,
      title: 'Color Dash Grid',
      description: 'Match colors in a high-speed falling grid.',
      icon: <Zap size={32} className="text-white" fill="white" />,
      color: 'from-indigo-600 to-purple-600',
      isNew: false,
    },
    {
      id: 'SNAKE' as GameID,
      title: 'Neon Snake',
      description: 'Classic snake with a neon twist and smooth controls.',
      icon: <Gamepad2 size={32} className="text-white" />,
      color: 'from-green-600 to-emerald-600',
      isNew: false,
    },
    {
      id: 'BUBBLE_SHOOTER' as const,
      title: 'Bubble Shooter',
      description: 'Match colors and clear the board in this addictive puzzle.',
      icon: <LayoutGrid size={32} className="text-white" />,
      color: 'from-orange-500 to-red-600',
      isNew: true,
    },
  ];

  const filteredGames = games.filter(game => 
    game.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <Loader2 className="text-indigo-500 animate-spin" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <AnimatePresence mode="wait">
        {showLanding ? (
          <motion.div
            key="landing"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[100]"
          >
            <LandingPage onStart={() => setShowLanding(false)} />
          </motion.div>
        ) : (
          <motion.div 
            key="login"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className={`min-h-screen ${theme === 'DARK' ? 'bg-[#0a0a0c] text-white' : 'bg-[#f5f5f7] text-slate-900'} flex items-center justify-center p-8 transition-colors duration-500`}
          >
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
              <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] ${theme === 'DARK' ? 'bg-indigo-600/10' : 'bg-indigo-600/20'} blur-[120px] rounded-full`} />
              <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] ${theme === 'DARK' ? 'bg-purple-600/10' : 'bg-purple-600/20'} blur-[120px] rounded-full`} />
            </div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-2xl'} p-10 rounded-[40px] text-center max-w-md w-full backdrop-blur-xl relative z-10`}
            >
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/40 mx-auto mb-6">
                <LayoutGrid size={32} className="text-white" />
              </div>
              <h1 className={`text-3xl font-black tracking-tighter mb-2 ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>FortuMars Hub</h1>
              <p className={`mb-8 text-sm font-medium ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'}`}>Connect your account to save scores and join the community.</p>
              
              <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
                <div className="space-y-1 text-left">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-4 ${theme === 'DARK' ? 'text-white/60' : 'text-slate-400'}`}>Email</label>
                  <input 
                    required
                    type="email" 
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full border rounded-2xl py-3 px-6 focus:outline-none focus:border-indigo-500/50 transition-all text-sm ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-4 ${theme === 'DARK' ? 'text-white/60' : 'text-slate-400'}`}>Password</label>
                  <input 
                    required
                    type="password" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full border rounded-2xl py-3 px-6 focus:outline-none focus:border-indigo-500/50 transition-all text-sm ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                  />
                </div>

                {authError && (
                  <p className="text-red-500 text-xs font-bold bg-red-500/10 py-2 px-4 rounded-xl border border-red-500/20">
                    {authError}
                  </p>
                )}

                <button 
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingIn ? <Loader2 className="animate-spin mx-auto" size={20} /> : (authMode === 'SIGN_IN' ? 'Sign In' : 'Sign Up')}
                </button>
              </form>

              <div className="relative mb-6">
                <div className={`absolute inset-0 flex items-center`}><div className={`w-full border-t ${theme === 'DARK' ? 'border-white/5' : 'border-slate-200'}`}></div></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black"><span className={`${theme === 'DARK' ? 'bg-[#0a0a0c] text-white/20' : 'bg-white text-slate-400'} px-4`}>Or continue with</span></div>
              </div>

              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={`w-full py-3 font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm ${theme === 'DARK' ? 'bg-white text-black hover:bg-indigo-50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
              >
                <LogIn size={18} /> Google
              </button>

              <p className={`mt-8 text-xs font-bold ${theme === 'DARK' ? 'text-white/60' : 'text-slate-500'}`}>
                {authMode === 'SIGN_IN' ? "Don't have an account?" : "Already have an account?"}
                <button 
                  onClick={() => {
                    setAuthMode(authMode === 'SIGN_IN' ? 'SIGN_UP' : 'SIGN_IN');
                    setAuthError(null);
                  }}
                  className="ml-2 text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  {authMode === 'SIGN_IN' ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (showProfileSetup) {
    return (
      <div className={`min-h-screen ${theme === 'DARK' ? 'bg-[#0a0a0c] text-white' : 'bg-[#f5f5f7] text-slate-900'} flex items-center justify-center p-8 transition-colors duration-500`}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-2xl'} p-10 rounded-[40px] max-w-md w-full backdrop-blur-xl`}
        >
          <h2 className={`text-3xl font-black tracking-tighter mb-2 ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>Setup Profile</h2>
          <p className={`mb-8 font-medium ${theme === 'DARK' ? 'text-white/60' : 'text-slate-500'}`}>Tell us a bit about yourself to get started.</p>
          <form onSubmit={handleProfileSetup} className="space-y-6">
            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest ml-4 ${theme === 'DARK' ? 'text-white/60' : 'text-slate-400'}`}>Username</label>
              <input 
                required
                type="text" 
                placeholder="e.g. GamerPro123"
                value={setupData.username}
                onChange={(e) => setSetupData(prev => ({ ...prev, username: e.target.value }))}
                className={`w-full border rounded-2xl py-4 px-6 focus:outline-none focus:border-indigo-500/50 transition-all ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
            </div>
            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest ml-4 ${theme === 'DARK' ? 'text-white/60' : 'text-slate-400'}`}>Location</label>
              <input 
                required
                type="text" 
                placeholder="e.g. New York, USA"
                value={setupData.place}
                onChange={(e) => setSetupData(prev => ({ ...prev, place: e.target.value }))}
                className={`w-full border rounded-2xl py-4 px-6 focus:outline-none focus:border-indigo-500/50 transition-all ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all active:scale-95"
            >
              Complete Setup
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const handleGameEnd = async (gameId: GameID, score: number, playtime: number) => {
    if (!user || !profile) return;

    const now = new Date();
    const lastPlayed = profile.lastPlayedAt?.toDate ? profile.lastPlayedAt.toDate() : null;
    let newStreak = profile.streak || 1;

    if (lastPlayed) {
      const diffDays = Math.floor((now.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      }
    }

    // Check for achievements
    const newAchievements = [...(profile.achievements || [])];
    const checkAchievement = (id: string, condition: boolean) => {
      if (condition && !newAchievements.includes(id)) {
        newAchievements.push(id);
      }
    };

    checkAchievement('FIRST_GAME', true);
    checkAchievement('HIGH_SCORE_100', score >= 100);
    checkAchievement('HIGH_SCORE_500', score >= 500);
    checkAchievement('HIGH_SCORE_1000', score >= 1000);
    checkAchievement('PLAYTIME_1H', (profile.totalPlaytime + playtime) >= 3600);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        totalPlaytime: (profile.totalPlaytime || 0) + playtime,
        streak: newStreak,
        lastPlayedAt: serverTimestamp(),
        achievements: newAchievements
      });
      setProfile(prev => prev ? { 
        ...prev, 
        totalPlaytime: (prev.totalPlaytime || 0) + playtime,
        streak: newStreak,
        achievements: newAchievements
      } : null);
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  };

  if (activeGame === 'COLOR_DASH') {
    return <ColorDashGrid onBack={() => setActiveGame(null)} user={profile} onGameEnd={(score, playtime) => handleGameEnd('COLOR_DASH', score, playtime)} />;
  }

  if (activeGame === 'SNAKE') {
    return <Snake onBack={() => setActiveGame(null)} user={profile} onGameEnd={(score, playtime) => handleGameEnd('SNAKE', score, playtime)} />;
  }

  if (activeGame === 'BUBBLE_SHOOTER') {
    return <BubbleShooter onBack={() => setActiveGame(null)} user={profile} onGameEnd={(score, playtime) => handleGameEnd('BUBBLE_SHOOTER', score, playtime)} />;
  }

  return (
    <div className={`min-h-screen ${theme === 'DARK' ? 'bg-[#0a0a0c] text-white' : 'bg-[#f5f5f7] text-slate-900'} font-sans selection:bg-indigo-500/30 overflow-x-hidden transition-colors duration-500`}>
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] ${theme === 'DARK' ? 'bg-indigo-600/5' : 'bg-indigo-600/10'} blur-[120px] rounded-full`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] ${theme === 'DARK' ? 'bg-purple-600/5' : 'bg-purple-600/10'} blur-[120px] rounded-full`} />
      </div>

      {/* Sidebar (Desktop) */}
      <nav className={`fixed left-0 top-0 bottom-0 w-20 ${theme === 'DARK' ? 'bg-black/40 border-white/5' : 'bg-white/80 border-slate-200'} backdrop-blur-xl border-r flex flex-col items-center py-8 gap-8 z-50 hidden md:flex`}>
        <button 
          onClick={() => setActiveView('GAMES')}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${activeView === 'GAMES' ? 'bg-indigo-600 shadow-indigo-600/20 text-white' : (theme === 'DARK' ? 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-900')}`}
        >
          <LayoutGrid size={24} />
        </button>
        <div className={`flex flex-col gap-6 ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'}`}>
          <button 
            onClick={() => setActiveView('GAMES')}
            className={`transition-colors p-3 rounded-xl ${activeView === 'GAMES' ? (theme === 'DARK' ? 'text-white bg-white/10' : 'text-indigo-600 bg-indigo-50') : (theme === 'DARK' ? 'hover:text-white hover:bg-white/5' : 'hover:text-slate-900 hover:bg-slate-200/50')}`}
            title="Games"
          >
            <Gamepad2 size={24} />
          </button>
          <button 
            onClick={() => setActiveView('LEADERBOARD')}
            className={`transition-colors p-3 rounded-xl ${activeView === 'LEADERBOARD' ? (theme === 'DARK' ? 'text-white bg-white/10' : 'text-indigo-600 bg-indigo-50') : (theme === 'DARK' ? 'hover:text-white hover:bg-white/5' : 'hover:text-slate-900 hover:bg-slate-200/50')}`}
            title="Leaderboard"
          >
            <Trophy size={24} />
          </button>
          <button 
            onClick={() => setActiveView('NOTIFICATIONS')}
            className={`transition-colors p-3 rounded-xl ${activeView === 'NOTIFICATIONS' ? (theme === 'DARK' ? 'text-white bg-white/10' : 'text-indigo-600 bg-indigo-50') : (theme === 'DARK' ? 'hover:text-white hover:bg-white/5' : 'hover:text-slate-900 hover:bg-slate-200/50')}`}
            title="Notifications"
          >
            <Bell size={24} />
          </button>
          <button 
            onClick={() => setActiveView('USERS')}
            className={`transition-colors p-3 rounded-xl ${activeView === 'USERS' ? (theme === 'DARK' ? 'text-white bg-white/10' : 'text-indigo-600 bg-indigo-50') : (theme === 'DARK' ? 'hover:text-white hover:bg-white/5' : 'hover:text-slate-900 hover:bg-slate-200/50')}`}
            title="Community"
          >
            <User size={24} />
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-6">
          <button 
            onClick={() => setActiveView('SETTINGS')}
            className={`transition-colors p-3 rounded-xl ${activeView === 'SETTINGS' ? (theme === 'DARK' ? 'text-white bg-white/10' : 'text-indigo-600 bg-indigo-50') : (theme === 'DARK' ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100')}`} 
            title="Settings"
          >
            <Settings size={24} />
          </button>
        </div>
      </nav>

      {/* Bottom Navigation (Mobile) */}
      <nav className={`fixed bottom-0 left-0 right-0 h-20 ${theme === 'DARK' ? 'bg-black/60 border-white/5' : 'bg-white/60 border-slate-200'} backdrop-blur-2xl border-t flex items-center justify-around md:justify-around overflow-x-auto scrollbar-hide px-6 z-50 md:hidden`}>
        <div className="flex items-center justify-around w-full min-w-max gap-6 px-4">
          <button 
            onClick={() => setActiveView('GAMES')}
            className={`flex flex-col items-center gap-1 transition-all shrink-0 ${activeView === 'GAMES' ? 'text-indigo-500 scale-110' : (theme === 'DARK' ? 'text-white/40' : 'text-slate-400')}`}
          >
            <Gamepad2 size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Play</span>
          </button>
          <button 
            onClick={() => setActiveView('LEADERBOARD')}
            className={`flex flex-col items-center gap-1 transition-all shrink-0 ${activeView === 'LEADERBOARD' ? 'text-indigo-500 scale-110' : (theme === 'DARK' ? 'text-white/40' : 'text-slate-400')}`}
          >
            <Trophy size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Ranks</span>
          </button>
          <button 
            onClick={() => setActiveView('NOTIFICATIONS')}
            className={`flex flex-col items-center gap-1 transition-all shrink-0 ${activeView === 'NOTIFICATIONS' ? 'text-indigo-500 scale-110' : (theme === 'DARK' ? 'text-white/40' : 'text-slate-400')}`}
          >
            <Bell size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Alerts</span>
          </button>
          <button 
            onClick={() => setActiveView('USERS')}
            className={`flex flex-col items-center gap-1 transition-all shrink-0 ${activeView === 'USERS' ? 'text-indigo-500 scale-110' : (theme === 'DARK' ? 'text-white/40' : 'text-slate-400')}`}
          >
            <User size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Users</span>
          </button>
          <button 
            onClick={() => setActiveView('SETTINGS')}
            className={`flex flex-col items-center gap-1 transition-all shrink-0 ${activeView === 'SETTINGS' ? 'text-indigo-500 scale-110' : (theme === 'DARK' ? 'text-white/40' : 'text-slate-400')}`}
          >
            <Settings size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:pl-20 min-h-screen flex flex-col pb-24 md:pb-0">
        {/* Header */}
        <header className={`p-4 md:p-8 flex items-center justify-between sticky top-0 ${theme === 'DARK' ? 'bg-[#0a0a0c]/80 border-white/5' : 'bg-[#f5f5f7]/80 border-slate-200'} backdrop-blur-md z-40 border-b md:border-none`}>
          <div className="flex flex-col">
            <h1 className="text-xl md:text-3xl font-black tracking-tighter uppercase">FortuMars Hub</h1>
            <p className={`${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'} text-[8px] md:text-xs font-bold uppercase tracking-widest mt-1`}>Level 1 • {totalScore} XP Collected</p>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative hidden lg:block">
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${theme === 'DARK' ? 'text-white/20' : 'text-slate-300'}`} size={18} />
              <input 
                type="text" 
                placeholder="Search games..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${theme === 'DARK' ? 'bg-white/5 border-white/10 focus:border-indigo-500/50 focus:bg-white/10 text-white' : 'bg-slate-200/50 border-slate-200 focus:border-indigo-500/50 focus:bg-white text-slate-900'} border rounded-full py-2.5 pl-12 pr-6 text-sm focus:outline-none transition-all w-64`}
              />
            </div>
            <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} flex items-center gap-2 md:gap-3 border rounded-full pl-1.5 md:pl-2 pr-1.5 md:pr-2 py-1 md:py-1.5`}>
              <div className="flex items-center gap-2 md:gap-3 pl-1 pr-1 md:pr-2">
                <img src={profile?.avatar} alt={profile?.username} className="w-6 h-6 md:w-8 md:h-8 rounded-full border border-white/10" />
                <div className="flex flex-col hidden sm:flex">
                  <span className="text-[10px] md:text-xs font-black tracking-tight truncate max-w-[80px] md:max-w-[120px]">{profile?.username}</span>
                  <span className={`text-[6px] md:text-[8px] font-bold ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'} uppercase tracking-widest truncate max-w-[80px] md:max-w-[120px]`}>{profile?.place}</span>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className={`w-6 h-6 md:w-8 md:h-8 rounded-full ${theme === 'DARK' ? 'bg-white/5 hover:bg-red-500/20' : 'bg-slate-100 hover:bg-red-50'} hover:text-red-500 flex items-center justify-center transition-all`}
                title="Logout"
              >
                <LogOut size={12} md:size={14} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-4 md:p-8 flex-1 max-w-5xl mx-auto w-full">
          <AnimatePresence mode="wait">
            {activeView === 'GAMES' && (
              <motion.div
                key="games"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {/* Featured Section */}
                <section className="mb-12">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                      <Star size={20} className="text-yellow-500" fill="currentColor" /> Featured Games
                    </h2>
                    <button className="text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">View All</button>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {filteredGames.map(game => (
                      <GameCard 
                        key={String(game.id)}
                        title={game.title}
                        description={game.description}
                        icon={game.icon}
                        color={game.color}
                        isNew={game.isNew}
                        theme={theme}
                        onSelect={() => setActiveGame(game.id)}
                      />
                    ))}
                    {filteredGames.length === 0 && (
                      <div className="col-span-full py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <p className={`${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'} font-medium`}>No games found matching "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Stats Section */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'} p-6 rounded-3xl border`}>
                    <p className={`text-xs font-bold uppercase tracking-widest ${theme === 'DARK' ? 'text-white/40' : 'text-slate-400'} mb-4`}>Total Playtime</p>
                    <h3 className="text-3xl font-black tracking-tighter">
                      {profile?.totalPlaytime ? (profile.totalPlaytime / 3600).toFixed(1) : '0.0'}h
                    </h3>
                    <div className={`mt-4 h-1 w-full ${theme === 'DARK' ? 'bg-white/5' : 'bg-slate-100'} rounded-full overflow-hidden`}>
                      <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (profile?.totalPlaytime || 0) / 360)}%` }}></div>
                    </div>
                  </div>
                  <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'} p-6 rounded-3xl border`}>
                    <p className={`text-xs font-bold uppercase tracking-widest ${theme === 'DARK' ? 'text-white/40' : 'text-slate-400'} mb-4`}>Achievements</p>
                    <h3 className="text-3xl font-black tracking-tighter">{profile?.achievements?.length || 0}/42</h3>
                    <div className="mt-4 flex gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full ${i <= (profile?.achievements?.length || 0) ? 'bg-purple-500' : (theme === 'DARK' ? 'bg-white/10' : 'bg-slate-100')}`}></div>
                      ))}
                    </div>
                  </div>
                  <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'} p-6 rounded-3xl border`}>
                    <p className={`text-xs font-bold uppercase tracking-widest ${theme === 'DARK' ? 'text-white/40' : 'text-slate-400'} mb-4`}>Daily Streak</p>
                    <h3 className="text-3xl font-black tracking-tighter">{profile?.streak || 0} Days</h3>
                    <div className="mt-4 flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-widest">
                      <Zap size={14} fill="currentColor" /> {(profile?.streak || 0) > 0 ? 'On Fire!' : 'Start Playing'}
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeView === 'LEADERBOARD' && (
              <motion.div
                key="leaderboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>
                  <h2 className="text-3xl font-black tracking-tighter uppercase">Global Leaderboard</h2>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setLeaderboardGameFilter('ALL')}
                      className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${leaderboardGameFilter === 'ALL' ? 'bg-indigo-600 text-white' : (theme === 'DARK' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600')}`}
                    >
                      All Games
                    </button>
                    <button 
                      onClick={() => setLeaderboardGameFilter('COLOR_DASH')}
                      className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${leaderboardGameFilter === 'COLOR_DASH' ? 'bg-indigo-600 text-white' : (theme === 'DARK' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600')}`}
                    >
                      Color Dash
                    </button>
                    <button 
                      onClick={() => setLeaderboardGameFilter('SNAKE')}
                      className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${leaderboardGameFilter === 'SNAKE' ? 'bg-indigo-600 text-white' : (theme === 'DARK' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600')}`}
                    >
                      Snake
                    </button>
                    <button 
                      onClick={() => setLeaderboardGameFilter('BUBBLE_SHOOTER')}
                      className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${leaderboardGameFilter === 'BUBBLE_SHOOTER' ? 'bg-indigo-600 text-white' : (theme === 'DARK' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600')}`}
                    >
                      Bubble Shooter
                    </button>
                  </div>
                </div>

                <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'} rounded-3xl border overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className={`grid grid-cols-4 p-6 border-b ${theme === 'DARK' ? 'border-white/5 text-white/20' : 'border-slate-100 text-slate-400'} text-[10px] font-black uppercase tracking-widest`}>
                        <div>Rank</div>
                        <div>Player</div>
                        <div>Game</div>
                        <div className="text-right">Score</div>
                      </div>
                      <div className={`divide-y ${theme === 'DARK' ? 'divide-white/5' : 'divide-slate-100'}`}>
                        {(() => {
                          const uniqueScores: ScoreData[] = [];
                          const seenUsers = new Set<string>();
                          
                          // scores is already ordered by score desc from the query
                          scores
                            .filter(score => leaderboardGameFilter === 'ALL' || score.gameId === leaderboardGameFilter)
                            .forEach(score => {
                              if (!seenUsers.has(score.userId + score.gameId)) {
                                uniqueScores.push(score);
                                seenUsers.add(score.userId + score.gameId);
                              }
                            });

                          return uniqueScores.map((score, index) => {
                            const userProfile = users.find(u => u.uid === score.userId);
                            return (
                              <div key={score.id} className={`grid grid-cols-4 p-6 items-center ${theme === 'DARK' ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'} transition-colors`}>
                                <div className="flex items-center gap-3">
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${index === 0 ? 'bg-yellow-500 text-black' : index === 1 ? 'bg-slate-300 text-black' : index === 2 ? 'bg-amber-700 text-white' : (theme === 'DARK' ? 'text-white/20' : 'text-slate-300')}`}>
                                    {index + 1}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <img src={userProfile?.avatar || `https://picsum.photos/seed/${score.userId}/100`} alt={score.username} className="w-8 h-8 rounded-full border border-white/10" />
                                  <span className={`font-bold truncate ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>{score.username}</span>
                                </div>
                                <div className={`text-sm font-medium truncate ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'}`}>
                                  {score.gameId === 'COLOR_DASH' ? 'Color Dash Grid' : score.gameId === 'SNAKE' ? 'Neon Snake' : 'Bubble Shooter'}
                                </div>
                                <div className="text-right font-black text-indigo-400">
                                  {score.score.toLocaleString()}
                                </div>
                              </div>
                            );
                          });
                        })()}
                        {scores.length === 0 && (
                          <div className={`p-12 text-center ${theme === 'DARK' ? 'text-white/20' : 'text-slate-300'} font-bold uppercase tracking-widest`}>
                            No scores yet. Be the first!
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeView === 'NOTIFICATIONS' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <h2 className={`text-3xl font-black tracking-tighter uppercase ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>Notifications</h2>
                
                {(() => {
                  const topScore = scores[0];
                  const gameName = topScore?.gameId === 'COLOR_DASH' ? 'Color Dash Grid' : topScore?.gameId === 'SNAKE' ? 'Neon Snake' : 'Bubble Shooter';
                  
                  return (
                    <div className="space-y-4">
                      {topScore ? (
                        <div className={`${theme === 'DARK' ? 'bg-indigo-600/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'} border p-6 rounded-3xl flex gap-6 items-start`}>
                          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20 text-white">
                            <Trophy size={24} />
                          </div>
                          <div>
                            <h3 className={`font-bold text-lg mb-1 ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>New Peak Reached!</h3>
                            <p className={`${theme === 'DARK' ? 'text-white/60' : 'text-slate-600'} leading-relaxed`}>
                              <span className={`${theme === 'DARK' ? 'text-white' : 'text-slate-900'} font-bold`}>{topScore.username}</span> is currently at the <span className="text-indigo-600 font-bold">top 1 place</span> with a score of <span className="text-indigo-600 font-bold">{topScore.score.toLocaleString()}</span> in {gameName}.
                            </p>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${theme === 'DARK' ? 'text-white/20' : 'text-slate-300'} mt-4`}>
                              {topScore.timestamp?.toDate ? new Date(topScore.timestamp.toDate()).toLocaleString() : 'Just Now'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white/20' : 'bg-white border-slate-200 text-slate-300'} border p-12 rounded-3xl text-center font-bold uppercase tracking-widest`}>
                          No notifications yet
                        </div>
                      )}

                      <div className={`${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} border p-6 rounded-3xl flex gap-6 items-start opacity-50`}>
                        <div className={`w-12 h-12 ${theme === 'DARK' ? 'bg-white/10' : 'bg-slate-100'} rounded-2xl flex items-center justify-center shrink-0`}>
                          <Zap size={24} className={theme === 'DARK' ? 'text-white' : 'text-slate-400'} />
                        </div>
                        <div>
                          <h3 className={`font-bold text-lg mb-1 ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>Welcome to FortuMars Hub</h3>
                          <p className={`${theme === 'DARK' ? 'text-white/60' : 'text-slate-600'} leading-relaxed`}>
                            Start playing games to earn XP and climb the global leaderboard.
                          </p>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${theme === 'DARK' ? 'text-white/20' : 'text-slate-300'} mt-4`}>System Message</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {activeView === 'USERS' && (
              <motion.div
                key="users"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <h2 className={`text-3xl font-black tracking-tighter uppercase ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>Community</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {users.map(u => (
                    <div key={u.uid} className={`${theme === 'DARK' ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-white border-slate-200 hover:border-indigo-500/30 shadow-sm'} p-6 rounded-3xl border transition-all group`}>
                      <div className="flex gap-6 items-center">
                        <div className="relative">
                          <img src={u.avatar} alt={u.username} className="w-20 h-20 rounded-2xl border-2 border-white/10 group-hover:border-indigo-500/50 transition-colors" />
                          <div className={`absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 ${theme === 'DARK' ? 'border-[#0a0a0c]' : 'border-white'} flex items-center justify-center`}>
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className={`text-xl font-bold tracking-tight mb-1 ${theme === 'DARK' ? 'text-white' : 'text-slate-900'}`}>{u.username}</h3>
                          <div className="space-y-1">
                            <div className={`flex items-center gap-2 ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'} text-xs`}>
                              <Mail size={12} /> {u.email}
                            </div>
                            <div className={`flex items-center gap-2 ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'} text-xs`}>
                              <MapPin size={12} /> {u.place}
                            </div>
                            <div className={`flex items-center gap-2 ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'} text-xs`}>
                              <Calendar size={12} /> Joined {u.createdAt?.toDate ? new Date(u.createdAt.toDate()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className={`col-span-full p-12 text-center ${theme === 'DARK' ? 'text-white/20' : 'text-slate-300'} font-bold uppercase tracking-widest`}>
                      No users found
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeView === 'SETTINGS' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase">Settings</h2>
                  <button 
                    onClick={toggleTheme}
                    className={`w-full sm:w-auto p-3 rounded-2xl border transition-all flex items-center justify-center sm:justify-start gap-3 font-bold text-sm ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50'}`}
                  >
                    {theme === 'DARK' ? (
                      <><Sun size={20} className="text-yellow-500" /> Light Mode</>
                    ) : (
                      <><Moon size={20} className="text-indigo-600" /> Dark Mode</>
                    )}
                  </button>
                </div>

                {settingsMessage && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`p-4 rounded-2xl border flex items-center gap-3 ${settingsMessage.type === 'SUCCESS' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}
                  >
                    {settingsMessage.type === 'SUCCESS' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <span className="text-sm font-bold">{settingsMessage.text}</span>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 gap-6">
                  {/* Profile Settings */}
                  <div className={`p-8 rounded-[32px] border ${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <User size={24} className="text-indigo-500" /> Account Details
                    </h3>
                    <form onSubmit={handleUpdateUsername} className="space-y-4">
                      <div className="space-y-2">
                        <label className={`text-[10px] font-black uppercase tracking-widest ml-4 ${theme === 'DARK' ? 'text-white/40' : 'text-slate-400'}`}>New Username</label>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input 
                            type="text" 
                            placeholder={profile?.username || "Enter new username"}
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className={`flex-1 border rounded-2xl py-3 px-6 text-sm focus:outline-none focus:border-indigo-500/50 transition-all ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                          />
                          <button 
                            type="submit"
                            disabled={isUpdating || !newUsername.trim()}
                            className="w-full sm:w-auto px-6 py-3 sm:py-0 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Security Settings */}
                  <div className={`p-8 rounded-[32px] border ${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <Zap size={24} className="text-purple-500" /> Security
                    </h3>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                      <div className="space-y-2">
                        <label className={`text-[10px] font-black uppercase tracking-widest ml-4 ${theme === 'DARK' ? 'text-white/40' : 'text-slate-400'}`}>New Password</label>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input 
                            type="password" 
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={`flex-1 border rounded-2xl py-3 px-6 text-sm focus:outline-none focus:border-indigo-500/50 transition-all ${theme === 'DARK' ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                          />
                          <button 
                            type="submit"
                            disabled={isUpdating || !newPassword.trim()}
                            className="w-full sm:w-auto px-6 py-3 sm:py-0 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                      <p className={`text-[10px] font-medium ml-4 ${theme === 'DARK' ? 'text-white/20' : 'text-slate-400'}`}>
                        Minimum 6 characters required for password.
                      </p>
                    </form>
                  </div>

                  {/* Preferences */}
                  <div className={`p-8 rounded-[32px] border ${theme === 'DARK' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <Star size={24} className="text-yellow-500" /> Preferences
                    </h3>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'DARK' ? 'bg-indigo-600/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                          <Bell size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Push Notifications</p>
                          <p className={`text-[10px] font-medium ${theme === 'DARK' ? 'text-white/40' : 'text-slate-500'}`}>Get alerts for new high scores</p>
                        </div>
                      </div>
                      <div className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${theme === 'DARK' ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                        <div className="w-4 h-4 bg-white rounded-full shadow-sm translate-x-6" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className={`p-8 border-t ${theme === 'DARK' ? 'border-white/5 text-white/20' : 'border-slate-200 text-slate-400'} text-center text-[10px] font-bold uppercase tracking-[0.4em]`}>
          FortuMars Hub Platform v2.0 • Built for Speed
        </footer>
      </main>
    </div>
  );
}

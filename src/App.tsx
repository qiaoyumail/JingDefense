/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket as RocketIcon, Shield, Trophy, RotateCcw, Info, Globe } from 'lucide-react';
import { 
  GameStatus, Point, Rocket, Interceptor, Explosion, City, Battery, Language, FloatingText 
} from './types';

const LANGUAGES: Record<'zh' | 'en', Language> = {
  zh: {
    title: 'Jing 新星防御',
    start: '开始游戏',
    restart: '再玩一次',
    win: '最终胜利！',
    loss: '防御失败...',
    score: '得分',
    ammo: '弹药',
    instructions: '点击屏幕发射拦截导弹。预判火箭落点，利用爆炸范围摧毁它们。',
    level: '关卡',
    nextRound: '进入下一轮',
    performance: '本轮表现',
  },
  en: {
    title: 'Jing Nova Defense',
    start: 'Start Game',
    restart: 'Play Again',
    win: 'Ultimate Victory!',
    loss: 'Defense Failed...',
    score: 'Score',
    ammo: 'Ammo',
    instructions: 'Click screen to fire interceptors. Predict rocket paths and use explosion radius to destroy them.',
    level: 'Level',
    nextRound: 'Next Round',
    performance: 'Performance',
  }
};

const FINAL_WIN_SCORE = 1000;
const POINTS_PER_LEVEL = 200;
const BASE_ROCKET_SPAWN_RATE = 0.01; // Reduced from 0.015
const EXPLOSION_SPEED = 1.5;
const EXPLOSION_MAX_RADIUS = 50; // Increased from 40
const INTERCEPTOR_SPEED = 8; // Increased from 7
const BASE_ROCKET_SPEED_MIN = 0.8; // Reduced from 1
const BASE_ROCKET_SPEED_MAX = 2.0; // Reduced from 2.5

const CONGRATS_MESSAGES = ["GREAT!", "EXCELLENT!", "NICE!", "BOOM!", "CONGRATS!"];

export default function App() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const t = LANGUAGES[lang];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus | 'ROUND_END'>('START');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [difficulty, setDifficulty] = useState(1.0);
  
  // Game state refs for the loop
  const gameState = useRef({
    rockets: [] as Rocket[],
    interceptors: [] as Interceptor[],
    explosions: [] as Explosion[],
    cities: [] as City[],
    batteries: [] as Battery[],
    stars: [] as { x: number, y: number, size: number, opacity: number }[],
    floatingTexts: [] as FloatingText[],
    score: 0,
    levelScore: 0,
    difficulty: 1.0,
    lastTime: 0,
  });

  const initGame = useCallback((isNewGame: boolean = true) => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (isNewGame) {
      // Full reset
      const stars = [];
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2,
          opacity: Math.random()
        });
      }

      const cities: City[] = [];
      const cityWidth = 40;
      const cityHeight = 20;
      const spacing = width / 10;
      [2, 3, 4, 6, 7, 8].forEach((pos, i) => {
        cities.push({ id: `city-${i}`, x: pos * spacing - cityWidth / 2, y: height - 40, width: cityWidth, height: cityHeight, destroyed: false });
      });

      const batteries: Battery[] = [
        { id: 'bat-0', x: spacing - 30, y: height - 50, width: 60, height: 40, ammo: 20, maxAmmo: 20, destroyed: false },
        { id: 'bat-1', x: width / 2 - 30, y: height - 50, width: 60, height: 40, ammo: 40, maxAmmo: 40, destroyed: false },
        { id: 'bat-2', x: width - spacing - 30, y: height - 50, width: 60, height: 40, ammo: 20, maxAmmo: 20, destroyed: false },
      ];

      gameState.current = {
        ...gameState.current,
        rockets: [],
        interceptors: [],
        explosions: [],
        cities,
        batteries,
        stars,
        floatingTexts: [],
        score: 0,
        levelScore: 0,
        difficulty: 1.0,
        lastTime: performance.now(),
      };
      setScore(0);
      setLevel(1);
      setDifficulty(1.0);
    } else {
      // Next round setup
      gameState.current.rockets = [];
      gameState.current.interceptors = [];
      gameState.current.explosions = [];
      gameState.current.floatingTexts = [];
      gameState.current.levelScore = 0;
      // Refill ammo
      gameState.current.batteries.forEach(b => {
        if (!b.destroyed) b.ammo = b.maxAmmo;
      });
    }
    
    setStatus('PLAYING');
  }, []);

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    if (y > canvas.height - 80) return;

    let nearestBatIndex = -1;
    let minDist = Infinity;

    gameState.current.batteries.forEach((bat, i) => {
      if (!bat.destroyed && bat.ammo > 0) {
        const dist = Math.abs(bat.x + bat.width / 2 - x);
        if (dist < minDist) {
          minDist = dist;
          nearestBatIndex = i;
        }
      }
    });

    if (nearestBatIndex !== -1) {
      const bat = gameState.current.batteries[nearestBatIndex];
      bat.ammo -= 1;
      
      // Fire 3 interceptors in a small cluster
      const offsets = [-20, 0, 20];
      offsets.forEach(offset => {
        gameState.current.interceptors.push({
          id: Math.random().toString(36).substr(2, 9),
          start: { x: bat.x + bat.width / 2, y: bat.y },
          current: { x: bat.x + bat.width / 2, y: bat.y },
          target: { x: x + offset, y: y },
          speed: INTERCEPTOR_SPEED,
          reached: false,
        });
      });
    }
  };

  const update = useCallback((time: number) => {
    if (status !== 'PLAYING') return;

    const { rockets, interceptors, explosions, cities, batteries, floatingTexts, difficulty: diff } = gameState.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Spawn rockets with difficulty scaling
    const spawnRate = (BASE_ROCKET_SPAWN_RATE * diff) + (gameState.current.score / 10000);
    if (Math.random() < spawnRate) {
      const startX = Math.random() * canvas.width;
      const targets = [...cities.filter(c => !c.destroyed), ...batteries.filter(b => !b.destroyed)];
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;

        rockets.push({
          id: Math.random().toString(36).substr(2, 9),
          start: { x: startX, y: 0 },
          current: { x: startX, y: 0 },
          target: { x: targetX, y: targetY },
          speed: (BASE_ROCKET_SPEED_MIN + Math.random() * (BASE_ROCKET_SPEED_MAX - BASE_ROCKET_SPEED_MIN)) * Math.sqrt(diff),
          destroyed: false,
        });
      }
    }

    // Update rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      const dx = r.target.x - r.start.x;
      const dy = r.target.y - r.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / dist) * r.speed;
      const vy = (dy / dist) * r.speed;
      r.current.x += vx;
      r.current.y += vy;

      if (r.current.y >= r.target.y) {
        explosions.push({ id: Math.random().toString(36).substr(2, 9), x: r.current.x, y: r.current.y, radius: 0, maxRadius: 30, growing: true, done: false });
        cities.forEach(c => {
          if (!c.destroyed && Math.abs(r.current.x - (c.x + c.width / 2)) < c.width / 2 && Math.abs(r.current.y - (c.y + c.height / 2)) < c.height / 2) c.destroyed = true;
        });
        batteries.forEach(b => {
          if (!b.destroyed && Math.abs(r.current.x - (b.x + b.width / 2)) < b.width / 2 && Math.abs(r.current.y - (b.y + b.height / 2)) < b.height / 2) b.destroyed = true;
        });
        rockets.splice(i, 1);
      }
    }

    // Update interceptors
    for (let i = interceptors.length - 1; i >= 0; i--) {
      const m = interceptors[i];
      const dx = m.target.x - m.start.x;
      const dy = m.target.y - m.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / dist) * m.speed;
      const vy = (dy / dist) * m.speed;
      m.current.x += vx;
      m.current.y += vy;
      const distToTarget = Math.sqrt(Math.pow(m.target.x - m.current.x, 2) + Math.pow(m.target.y - m.current.y, 2));
      if (distToTarget < m.speed) {
        explosions.push({ id: Math.random().toString(36).substr(2, 9), x: m.target.x, y: m.target.y, radius: 0, maxRadius: EXPLOSION_MAX_RADIUS, growing: true, done: false });
        interceptors.splice(i, 1);
      }
    }

    // Update explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      if (e.growing) {
        e.radius += EXPLOSION_SPEED;
        if (e.radius >= e.maxRadius) e.growing = false;
      } else {
        e.radius -= EXPLOSION_SPEED;
        if (e.radius <= 0) e.done = true;
      }
      if (e.done) {
        explosions.splice(i, 1);
      } else {
        for (let j = rockets.length - 1; j >= 0; j--) {
          const r = rockets[j];
          const dist = Math.sqrt(Math.pow(r.current.x - e.x, 2) + Math.pow(r.current.y - e.y, 2));
          if (dist < e.radius) {
            floatingTexts.push({ id: Math.random().toString(36).substr(2, 9), x: r.current.x, y: r.current.y, text: CONGRATS_MESSAGES[Math.floor(Math.random() * CONGRATS_MESSAGES.length)], opacity: 1, life: 60 });
            rockets.splice(j, 1);
            gameState.current.score += 20;
            gameState.current.levelScore += 20;
            setScore(gameState.current.score);
          }
        }
      }
    }

    // Update floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y -= 0.5;
      ft.life -= 1;
      ft.opacity = ft.life / 60;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    // Check Round End / Win / Loss
    if (gameState.current.score >= FINAL_WIN_SCORE) {
      setStatus('WON');
    } else if (gameState.current.levelScore >= POINTS_PER_LEVEL) {
      // Round Complete - Calculate difficulty adjustment
      const survivingCities = cities.filter(c => !c.destroyed).length;
      const remainingAmmo = batteries.reduce((acc, b) => acc + (b.destroyed ? 0 : b.ammo), 0);
      
      // Performance metric: cities are worth more than ammo
      const performance = (survivingCities * 100) + (remainingAmmo * 5);
      
      // Adjust difficulty based on performance (Even slower scaling)
      let diffAdj = 0;
      if (performance > 450) diffAdj = 0.05; // Reduced from 0.1
      else if (performance > 250) diffAdj = 0.02; // Reduced from 0.05
      else if (performance < 150) diffAdj = -0.08; // More aggressive reduction if struggling

      const newDiff = Math.max(1.0, gameState.current.difficulty + diffAdj);
      gameState.current.difficulty = newDiff;
      setDifficulty(newDiff);
      setStatus('ROUND_END');
    } else if (batteries.every(b => b.destroyed)) {
      setStatus('LOST');
    }

    draw();
    requestAnimationFrame(update);
  }, [status]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rockets, interceptors, explosions, cities, batteries, stars, floatingTexts } = gameState.current;

    // Draw Space Background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#050510'); // Deep space
    bgGradient.addColorStop(1, '#100515'); // Slight purple tint at bottom
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Nebula Effect (Subtle)
    ctx.globalCompositeOperation = 'screen';
    const nebula = ctx.createRadialGradient(canvas.width * 0.7, canvas.height * 0.3, 0, canvas.width * 0.7, canvas.height * 0.3, canvas.width * 0.5);
    nebula.addColorStop(0, 'rgba(60, 20, 100, 0.15)');
    nebula.addColorStop(1, 'transparent');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // Draw Stars
    stars.forEach(s => {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity * (0.5 + Math.sin(Date.now() * 0.001 + s.x) * 0.5)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Ground
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

    // Draw Cities (Realistic Building Style)
    cities.forEach(c => {
      if (!c.destroyed) {
        const centerX = c.x + c.width / 2;
        
        // Main Building Body
        ctx.fillStyle = '#cbd5e1'; // Light stone color
        ctx.fillRect(c.x, c.y, c.width, c.height);
        
        // Roof (Gabled)
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(c.x - 4, c.y);
        ctx.lineTo(centerX, c.y - 12);
        ctx.lineTo(c.x + c.width + 4, c.y);
        ctx.closePath();
        ctx.fill();

        // Windows (Grid)
        ctx.fillStyle = '#fef08a'; // Warm window light
        const winSize = 4;
        const spacingX = 10;
        const spacingY = 8;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            ctx.fillRect(c.x + 7 + col * spacingX, c.y + 4 + row * spacingY, winSize, winSize);
          }
        }

        // Door
        ctx.fillStyle = '#78350f'; // Wooden door
        ctx.fillRect(centerX - 4, c.y + c.height - 10, 8, 10);

        // Foundation/Base
        ctx.fillStyle = '#64748b';
        ctx.fillRect(c.x, c.y + c.height - 2, c.width, 2);
      }
    });

    // Draw Batteries (Turret Style)
    batteries.forEach(b => {
      if (!b.destroyed) {
        const centerX = b.x + b.width / 2;
        const centerY = b.y + b.height / 2;

        // Turret Base
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(b.x, b.y + 20, b.width, 20, 4);
        ctx.fill();

        // Turret Body
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(centerX, centerY + 10, 18, Math.PI, 0);
        ctx.fill();

        // Barrel
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY + 5);
        ctx.lineTo(centerX, centerY - 15);
        ctx.stroke();
        
        // Ammo text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(b.ammo.toString(), centerX, b.y + b.height + 15);
      }
    });

    // Draw Rockets (Realistic Style)
    rockets.forEach(r => {
      // Draw Realistic Missile Icon
      const angle = Math.atan2(r.target.y - r.start.y, r.target.x - r.start.x);
      ctx.save();
      ctx.translate(r.current.x, r.current.y);
      ctx.rotate(angle);
      
      // Engine Flame
      const flameSize = 5 + Math.random() * 5;
      const flameGrad = ctx.createLinearGradient(-5, 0, -15, 0);
      flameGrad.addColorStop(0, '#fbbf24');
      flameGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-4 - flameSize, -2);
      ctx.lineTo(-4 - flameSize, 2);
      ctx.closePath();
      ctx.fill();

      // Missile Body (Cylindrical look)
      const bodyGrad = ctx.createLinearGradient(0, -3, 0, 3);
      bodyGrad.addColorStop(0, '#94a3b8'); // Light gray
      bodyGrad.addColorStop(0.5, '#475569'); // Dark gray
      bodyGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(-6, -3, 12, 6);

      // Nose Cone
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(6, -3);
      ctx.lineTo(12, 0);
      ctx.lineTo(6, 3);
      ctx.closePath();
      ctx.fill();

      // Fins (Back)
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(-6, -3);
      ctx.lineTo(-9, -6);
      ctx.lineTo(-4, -3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, 3);
      ctx.lineTo(-9, 6);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    });

    // Draw Interceptors
    interceptors.forEach(m => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.start.x, m.start.y);
      ctx.lineTo(m.current.x, m.current.y);
      ctx.stroke();

      // Target X
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(m.target.x - 5, m.target.y - 5);
      ctx.lineTo(m.target.x + 5, m.target.y + 5);
      ctx.moveTo(m.target.x + 5, m.target.y - 5);
      ctx.lineTo(m.target.x - 5, m.target.y + 5);
      ctx.stroke();
    });

    // Draw Explosions
    explosions.forEach(e => {
      const gradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.3, '#fbbf24');
      gradient.addColorStop(0.6, '#ef4444');
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Floating Texts
    floatingTexts.forEach(ft => {
      ctx.fillStyle = `rgba(255, 255, 255, ${ft.opacity})`;
      ctx.font = 'bold 14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    
    const animId = requestAnimationFrame(update);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [update]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white select-none touch-none">
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        className="w-full h-full cursor-crosshair"
      />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <RocketIcon className="w-5 h-5 text-blue-500" />
            {t.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm font-mono opacity-80">
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span>{t.score}: {score} / {FINAL_WIN_SCORE}</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-4 h-4 text-blue-400" />
              <span>{t.level}: {level} (x{difficulty.toFixed(1)})</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          <Globe className="w-5 h-5" />
        </button>
      </div>

      {/* Screens */}
      <AnimatePresence>
        {status === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 p-6"
          >
            <div className="max-w-md w-full text-center space-y-8">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase">
                  {t.title}
                </h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {t.instructions}
                </p>
              </motion.div>

              <button
                onClick={() => initGame(true)}
                className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/20"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  {t.start}
                </span>
              </button>
            </div>
          </motion.div>
        )}

        {status === 'ROUND_END' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/90 z-50 p-6"
          >
            <div className="text-center space-y-8 max-w-sm w-full">
              <div className="space-y-2">
                <h2 className="text-4xl font-black italic tracking-tighter uppercase text-blue-400">
                  {t.level} {level} {t.performance}
                </h2>
                <div className="h-1 w-full bg-blue-900/30 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1 }}
                    className="h-full bg-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left font-mono">
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-[10px] text-gray-500 uppercase">{t.score}</div>
                  <div className="text-xl">{score}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-[10px] text-gray-500 uppercase">Difficulty</div>
                  <div className="text-xl">x{difficulty.toFixed(1)}</div>
                </div>
              </div>

              <button
                onClick={() => {
                  setLevel(l => l + 1);
                  initGame(false);
                }}
                className="w-full px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-2"
              >
                {t.nextRound}
                <RotateCcw className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </motion.div>
        )}

        {(status === 'WON' || status === 'LOST') && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/90 z-50 p-6"
          >
            <div className="text-center space-y-6">
              <h2 className={`text-6xl font-black italic tracking-tighter uppercase ${status === 'WON' ? 'text-green-500' : 'text-red-500'}`}>
                {status === 'WON' ? t.win : t.loss}
              </h2>
              <div className="text-2xl font-mono">
                {t.score}: {score} | {t.level}: {level}
              </div>
              <button
                onClick={() => initGame(true)}
                className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all flex items-center gap-2 mx-auto"
              >
                <RotateCcw className="w-5 h-5" />
                {t.restart}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/30 uppercase tracking-widest pointer-events-none md:hidden">
        Tap to intercept
      </div>
    </div>
  );
}

import React, { useEffect, useState, useRef } from 'react';
import { ArrowRight, Activity, Sparkles, Cpu, ShieldCheck, Database, Layers, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface HomeProps {
  onStart: () => void;
}

const FLOW_STAGES = [
  { id: 'PLAN', label: 'PLAN', desc: 'Disambiguate & expand intent', tag: 'Semantic Router' },
  { id: 'RETRIEVE', label: 'RETRIEVE', desc: '§ OKF · ▲ RAG · ● LIVE', tag: 'Tri-Tier Engine' },
  { id: 'WRITE', label: 'WRITE', desc: 'Strict evidence synthesis', tag: 'Causal Grounding' },
  { id: 'CHECK', label: 'ENTROPY AUDIT', desc: 'Sentence-by-sentence verification', tag: 'NLI Entailment' },
];

export default function Home({ onStart }: HomeProps) {
  const { requireAuth, user, openAuthModal } = useAuth();
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [simStage, setSimStage] = useState(0);
  const [telemetryMs, setTelemetryMs] = useState(142);

  // 1. Stage cycler & simulated millisecond telemetry
  useEffect(() => {
    const stageTimer = setInterval(() => {
      setSimStage((prev) => (prev + 1) % FLOW_STAGES.length);
    }, 2400);

    const msTimer = setInterval(() => {
      setTelemetryMs(120 + Math.floor(Math.random() * 45));
    }, 800);

    return () => {
      clearInterval(stageTimer);
      clearInterval(msTimer);
    };
  }, []);

  // 2. 60fps Hardware-Accelerated Interactive Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    const isMobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nodeCount = isMobile ? 24 : 52;
    const maxDist = isMobile ? 85 : 125;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      phase: number;
      speed: number;
    }

    const particles: Particle[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Seed particles
    for (let i = 0; i < nodeCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.8 + 1.0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.02,
      });
    }

    // Pointer interaction
    let pointerX = -9999;
    let pointerY = -9999;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e && e.touches.length > 0) {
        pointerX = e.touches[0].clientX - rect.left;
        pointerY = e.touches[0].clientY - rect.top;
      } else if ('clientX' in e) {
        pointerX = (e as MouseEvent).clientX - rect.left;
        pointerY = (e as MouseEvent).clientY - rect.top;
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // Determine accent color RGB from theme
      let accentR = 6, accentG = 182, accentB = 212; // cyber-cyan default
      if (theme === 'emerald-biolab') {
        accentR = 16; accentG = 185; accentB = 129;
      } else if (theme === 'obsidian-gold') {
        accentR = 245; accentG = 158; accentB = 11;
      } else if (theme === 'solaris-paper') {
        accentR = 2; accentG = 132; accentB = 199;
      }

      // Update & draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.phase += p.speed;

        // Bounce
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        else if (p.x > width) { p.x = width; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        else if (p.y > height) { p.y = height; p.vy *= -1; }

        // Gravitate slightly to pointer if within 120px
        const dx = pointerX - p.x;
        const dy = pointerY - p.y;
        const pDist = Math.sqrt(dx * dx + dy * dy);
        if (pDist < 120 && pDist > 5) {
          p.x += (dx / pDist) * 0.4;
          p.y += (dy / pDist) * 0.4;
        }

        const alpha = 0.35 + Math.sin(p.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${alpha})`;
        ctx.fill();

        // Connect nearby nodes
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const cdx = p.x - p2.x;
          const cdy = p.y - p2.y;
          const dist = Math.sqrt(cdx * cdx + cdy * cdy);
          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, [theme]);

  const handleCtaClick = () => {
    requireAuth(() => {
      onStart();
    });
  };

  const currentStage = FLOW_STAGES[simStage];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between overflow-y-auto overflow-x-hidden p-4 md:p-12 hud-grid select-none">
      {/* 60fps Interactive Neural Canvas Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Ambient floating spotlights */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden="true">
        <div className="absolute -top-32 -left-20 w-[380px] md:w-[500px] h-[380px] md:h-[500px] bg-cyan-500/10 rounded-full blur-3xl animate-spotlight" />
        <div
          className="absolute top-1/2 -right-32 w-[360px] md:w-[540px] h-[360px] md:h-[540px] bg-indigo-500/10 rounded-full blur-3xl animate-spotlight"
          style={{ animationDelay: '3s' }}
        />
      </div>

      {/* Orbital Rings - centered and fully responsive */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden" aria-hidden="true">
        <div className="w-[300px] sm:w-[480px] md:w-[700px] h-[300px] sm:h-[480px] md:h-[700px] rounded-full border border-dashed border-cyan-500/20 animate-orbit-spin" />
        <div
          className="absolute w-[220px] sm:w-[340px] md:w-[460px] h-[220px] sm:h-[340px] md:h-[460px] rounded-full border border-cyan-400/25 animate-orbit-spin"
          style={{ animationDirection: 'reverse', animationDuration: '22s' }}
        />
      </div>

      {/* Main Content Grid */}
      <div className="max-w-6xl w-full my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-center relative z-10 py-4">
        {/* Left Hero Column */}
        <div className="lg:col-span-6 space-y-5 text-left">
          {/* Badge */}
          <div className="animate-rise-in inline-flex items-center gap-2 px-3 py-1 bg-ink-surface/90 border border-cyan-500/30 text-[10px] font-mono uppercase tracking-widest text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-telemetry" />
            <span>Autonomous Verification Engine v2.0</span>
          </div>

          {/* Heading with responsive fluid clamp */}
          <h1
            className="animate-rise-in font-bold text-white tracking-tight leading-[1.12]"
            style={{ fontSize: 'clamp(1.9rem, 5.2vw, 3.6rem)', animationDelay: '80ms' }}
          >
            Every claim, checked against its source.
          </h1>

          {/* Description */}
          <p
            className="animate-rise-in text-ink-muted text-sm sm:text-base md:text-lg leading-relaxed max-w-lg"
            style={{ animationDelay: '160ms' }}
          >
            Ask complex research questions. ARIA orchestrates multi-tier retrieval, synthesizes grounded academic answers, and verifies every claim with sentence-level NLI entailment audits.
          </p>

          {/* Action CTAs */}
          <div
            className="animate-rise-in pt-2 flex flex-wrap items-center gap-3"
            style={{ animationDelay: '240ms' }}
          >
            <button
              onClick={handleCtaClick}
              className="group relative px-7 py-3.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/60 hover:border-cyan-300 text-white font-mono text-xs uppercase tracking-widest transition-all duration-300 ease-out hover:scale-[1.02] shadow-[0_0_25px_rgba(6,182,212,0.25)] flex items-center gap-3 touch-spring"
            >
              <Sparkles size={14} className="text-cyan-300 animate-pulse" />
              <span>Ask a question</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform text-cyan-300" />
            </button>

            {!user && (
              <button
                onClick={() => openAuthModal()}
                className="px-4 py-3 bg-ink-surface/80 hover:bg-ink-surface border border-ink-surface hover:border-cyan-500/40 text-ink-muted hover:text-white font-mono text-xs uppercase tracking-wider transition-colors touch-spring"
              >
                Sign In / OAuth
              </button>
            )}
          </div>

          {/* Engine Latency Telemetry */}
          <div
            className="animate-rise-in flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink-muted pt-1"
            style={{ animationDelay: '320ms' }}
          >
            <span className="flex items-center gap-1.5 border border-ink-surface px-2.5 py-1 bg-ink-base/80">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> OKF (Structured)
            </span>
            <span className="flex items-center gap-1.5 border border-ink-surface px-2.5 py-1 bg-ink-base/80">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> RAG (Vector)
            </span>
            <span className="flex items-center gap-1.5 border border-ink-surface px-2.5 py-1 bg-ink-base/80">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> LIVE (Academic)
            </span>
            <span className="text-cyan-400 font-semibold">T+{telemetryMs}ms live</span>
          </div>
        </div>

        {/* Right Column: Holographic Pipeline Architecture Flow Simulator */}
        <div className="lg:col-span-6 w-full flex justify-center">
          <div className="w-full max-w-md bg-ink-surface/40 border border-cyan-500/30 p-5 md:p-6 relative overflow-hidden shadow-2xl neon-sheen">
            <div className="hud-scanline" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-ink-surface relative z-10">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-cyan-400 animate-pulse" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                  Pipeline Architecture Flow
                </span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5">
                Deterministic
              </span>
            </div>

            {/* 3D Wave SVG Flow */}
            <div className="relative w-full h-24 mb-4 flex items-center justify-center">
              <svg viewBox="0 0 400 100" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="pipelineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#6366f1" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
                  </linearGradient>
                </defs>
                {/* Background track */}
                <path
                  d="M 20 50 Q 110 10, 200 50 T 380 50"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Flowing animated wave */}
                <path
                  d="M 20 50 Q 110 10, 200 50 T 380 50"
                  fill="none"
                  stroke="url(#pipelineGrad)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray="14 16"
                  className="animate-packet-flow"
                />
                {/* Stage node circles */}
                {[20, 140, 260, 380].map((cx, i) => (
                  <circle
                    key={i}
                    cx={cx}
                    cy={i % 2 === 0 ? 50 : 38}
                    r={i === simStage ? 6 : 4}
                    className={`transition-all duration-300 ${
                      i <= simStage ? 'fill-cyan-400 stroke-white' : 'fill-gray-700 stroke-gray-900'
                    }`}
                    strokeWidth="2"
                  />
                ))}
              </svg>
            </div>

            {/* Stages Stack */}
            <div className="space-y-2 relative z-10">
              {FLOW_STAGES.map((stage, idx) => {
                const isActive = idx === simStage;
                const isPassed = idx < simStage;
                return (
                  <div
                    key={stage.id}
                    className={`flex items-center justify-between p-2 text-left border transition-all duration-300 ${
                      isActive
                        ? 'bg-cyan-500/10 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.18)]'
                        : isPassed
                        ? 'bg-ink-base/60 border-ink-surface text-gray-300'
                        : 'bg-ink-base/30 border-ink-surface/40 opacity-40 text-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isActive
                            ? 'bg-cyan-300 pulse-telemetry'
                            : isPassed
                            ? 'bg-emerald-400'
                            : 'bg-gray-600'
                        }`}
                      />
                      <span className={`font-mono text-xs font-bold ${isActive ? 'text-cyan-300' : 'text-gray-200'}`}>
                        {stage.label}
                      </span>
                      <span className="font-sans text-[11px] text-ink-muted hidden sm:inline">
                        — {stage.desc}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-ink-base/90 border border-ink-surface text-ink-muted">
                      {stage.tag}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer Telemetry */}
            <div className="mt-4 pt-3 border-t border-ink-surface flex items-center justify-between text-[10px] font-mono text-ink-muted relative z-10">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Active: {currentStage.label}
              </span>
              <span>T+{(telemetryMs / 1000).toFixed(3)}s · Entailment Armed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trust & Methodology footer strip */}
      <div className="w-full max-w-6xl pt-4 pb-2 border-t border-ink-surface/70 flex flex-wrap items-center justify-between text-ink-muted text-xs font-mono relative z-10">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck size={13} /> Strict Zero-Hallucination Gate
          </span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">Citations anchored via DOI &amp; arXiv</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span>v2.0-PROD</span>
          <span>·</span>
          <span>Open Knowledge Fabric</span>
        </div>
      </div>
    </div>
  );
}

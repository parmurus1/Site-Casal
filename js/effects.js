// =========================================================
// EFFECTS — som "boof", partículas de poeira e tremor de câmera
// =========================================================
const Effects = {
  particlesLayer: null,
  cameraEl: null,
  audioCtx: null,

  init() {
    this.particlesLayer = document.getElementById('particlesLayer');
    this.cameraEl = document.getElementById('cameraShake');
  },

  // ---------------------------------------------------------
  // som "boof" sintetizado (sem precisar de arquivo de áudio)
  // ---------------------------------------------------------
  playBoof() {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      // corpo grave do "boof"
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.28);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);

      // "puff" de ar em ruído filtrado
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.3);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.3);
    } catch (err) {
      // ambiente sem suporte a WebAudio — ignora silenciosamente
      console.warn('Não foi possível tocar o som do diário:', err);
    }
  },

  // ---------------------------------------------------------
  // partículas de poeira/pétalas voando pros lados
  // ---------------------------------------------------------
  burstParticles(originXPercent = 50, originYPercent = 50, count = 26) {
    if (!this.particlesLayer) return;
    const rect = this.particlesLayer.getBoundingClientRect();
    const originX = (originXPercent / 100) * rect.width;
    const originY = (originYPercent / 100) * rect.height;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'dust-particle';

      const size = 4 + Math.random() * 8;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${originX}px`;
      p.style.top = `${originY}px`;

      const angle = (Math.random() * Math.PI) - Math.PI / 2; // leque pra frente/lados
      const spread = Math.random() < 0.5 ? -1 : 1;
      const distance = 90 + Math.random() * 220;
      const dx = Math.cos(angle) * distance * spread;
      const dy = (Math.random() * -1) * (60 + Math.random() * 140);
      const rotate = (Math.random() * 360 - 180).toFixed(0);
      const duration = 700 + Math.random() * 700;
      const delay = Math.random() * 80;

      this.particlesLayer.appendChild(p);

      const anim = p.animate([
        { transform: 'translate(-50%, -50%) translate(0px, 0px) rotate(0deg) scale(1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1, offset: 0.06 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.6}px, ${dy}px) rotate(${rotate}deg) scale(0.9)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy + 120}px) rotate(${rotate * 2}deg) scale(0.4)`, opacity: 0 },
      ], {
        duration,
        delay,
        easing: 'cubic-bezier(.25,.7,.4,1)',
        fill: 'forwards',
      });

      anim.onfinish = () => p.remove();
    }
  },

  // ---------------------------------------------------------
  // pulso extra de tremor de câmera (além do drift contínuo em CSS)
  // ---------------------------------------------------------
  shakeCamera(intensity = 6, duration = 420) {
    if (!this.cameraEl) return;
    const el = this.cameraEl;
    const start = performance.now();

    function frame(now) {
      const t = (now - start) / duration;
      if (t >= 1) {
        el.style.setProperty('--shake-x', '0px');
        el.style.setProperty('--shake-y', '0px');
        el.style.transform = '';
        return;
      }
      const damp = 1 - t;
      const x = (Math.random() * 2 - 1) * intensity * damp;
      const y = (Math.random() * 2 - 1) * intensity * damp;
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  },
};

window.Effects = Effects;

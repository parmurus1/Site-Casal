// =========================================================
// EFFECTS — som "boof" sintetizado (WebAudio, sem depender de DOM)
// Partículas e tremor de câmera agora vivem em scene3d.js,
// como partes reais da cena 3D (partículas de verdade, câmera de verdade).
// =========================================================
const Effects = {
  audioCtx: null,

  init() {
    // nada de DOM pra preparar aqui — mantido por compatibilidade com app.js
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
};

window.Effects = Effects;


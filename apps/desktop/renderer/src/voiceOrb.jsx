import React, { useEffect, useRef } from "react";
import { createOrb, createOrbTheme } from "orbloom";
import "orbloom/styles.css";
import { t as tr, useLanguage } from "./i18n.jsx";

// 0.7.29: the voice orb (orbloom 0.1.0, «core-teal-01» structure with these colours) while the microphone records:
// it listens to the voice, then «thinks» while the words are written out. Resolved at module scope, so a bad token
// fails at load; the state is also said in text (live region); one orb at a time.
const THEME = createOrbTheme({
  preset: "core-teal-01",
  id: "orb-studio-core-teal-01",
  seed: 1,
  colors: { base: "#07262b", interior: "#050809", accents: ["#00c2a8", "#38e1ff", "#ffc65c"] },
  appearance: { intensity: 0.95, detail: 0.8, glow: 0.9, glass: 0.35 },
  motion: { speed: 0.8, drift: 0.6 },
  audioResponse: { brightness: 1.2, motion: 0.55, pulse: 0.85 },
});

export default function VoiceOrb({ phase = "listening", stream = null }) {
  useLanguage();
  const motionRef = useRef(null), canvasRef = useRef(null), orbRef = useRef(null);
  useEffect(() => {
    const motionEl = motionRef.current, canvas = canvasRef.current;
    const m = THEME.ambientMotion;
    motionEl.dataset.ambientMotion = String(m.enabled);
    motionEl.style.setProperty("--orb-motion-distance", `${-m.verticalTravel}px`);
    motionEl.style.setProperty("--orb-motion-scale", String(m.scale));
    motionEl.style.setProperty("--orb-motion-duration", `${m.durationSeconds}s`);
    motionEl.style.setProperty("--orb-motion-delay", `${m.delaySeconds}s`);
    try { orbRef.current = createOrb(canvas, { theme: THEME, quality: "balanced", state: "idle", reducedMotion: "user" }); }
    catch { motionEl.classList.add("orb-no-webgl"); }
    return () => { try { orbRef.current?.destroy(); } catch {} orbRef.current = null; };
  }, []);
  useEffect(() => { try { orbRef.current?.setState(phase === "thinking" ? "thinking" : "listening"); } catch {} }, [phase]);
  // The level of the voice comes from the recording's own stream (no second request for the microphone).
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || !stream || phase !== "listening") return;
    let ctx = null, detach = null;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      detach = orb.attachAudioSource(analyser);
    } catch {}
    return () => { try { detach?.(); } catch {} try { ctx?.close(); } catch {} };
  }, [stream, phase]);
  return <div className="voiceOrbStage">
    <div className="orb-motion" ref={motionRef} style={{ "--orb-diameter": "150px" }}><div className="orb-shell"><div className="orb-clip">
      <canvas className="orb-canvas" ref={canvasRef} aria-label={tr("Voice activity")}></canvas>
      <div className="orb-fallback" aria-hidden="true"></div>
    </div><div className="orb-chrome" aria-hidden="true"></div></div></div>
    <p role="status" aria-live="polite">{phase === "thinking" ? tr("Writing out what you said…") : tr("Listening… press the microphone again to stop.")}</p>
  </div>;
}

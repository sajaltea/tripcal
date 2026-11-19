import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const MIN = 1;
const MAX = 6;
const clampScale = (s) => Math.min(MAX, Math.max(MIN, s));

// Full-screen photo with pinch / wheel / double-tap zoom and drag to move.
export default function PhotoViewer({ src, alt = 'Photo', onClose }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const stageRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ time: 0, x: 0, y: 0 });

  // Keep the photo from being dragged off screen
  const limit = useCallback((s, x, y) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || s <= 1) return { s: Math.max(s, 1), x: 0, y: 0 };
    const mx = ((s - 1) * r.width) / 2;
    const my = ((s - 1) * r.height) / 2;
    return { s, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }, []);

  // Point relative to the centre of the stage
  const rel = (cx, cy) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  };

  const zoomTo = useCallback((newScale, px = 0, py = 0) => {
    const p = tRef.current;
    const s = clampScale(newScale);
    const k = s / p.s;
    setT(limit(s, px - (px - p.x) * k, py - (py - p.y) * k));
  }, [limit]);

  // Esc closes, page behind does not scroll, mouse wheel zooms
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
      if (e.key === '+' || e.key === '=') zoomTo(tRef.current.s * 1.4);
      if (e.key === '-') zoomTo(tRef.current.s / 1.4);
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const stage = stageRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const p = rel(e.clientX, e.clientY);
      zoomTo(tRef.current.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), p.x, p.y);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
      stage.removeEventListener('wheel', onWheel);
    };
  }, [onClose, zoomTo]);

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const cur = tRef.current;

    if (pts.length === 2) {
      const [a, b] = pts;
      const mid = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), s: cur.s, x: cur.x, y: cur.y, mid };
      return;
    }

    // Double tap / double click: zoom in at that spot, or back out
    const now = Date.now();
    const lt = lastTap.current;
    if (now - lt.time < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
      const p = rel(e.clientX, e.clientY);
      zoomTo(cur.s > 1.2 ? 1 : 2.5, p.x, p.y);
      lastTap.current = { time: 0, x: 0, y: 0 };
      gesture.current = null;
      return;
    }
    lastTap.current = { time: now, x: e.clientX, y: e.clientY };
    gesture.current = { type: 'pan', px: e.clientX, py: e.clientY, x: cur.x, y: cur.y };
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const s = clampScale((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist);
      const mid = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      const k = s / g.s;
      setT(limit(s, mid.x - (g.mid.x - g.x) * k, mid.y - (g.mid.y - g.y) * k));
    } else if (g.type === 'pan' && tRef.current.s > 1) {
      setT(limit(tRef.current.s, g.x + (e.clientX - g.px), g.y + (e.clientY - g.py)));
    }
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // One finger left after a pinch: continue as a drag
      const [p] = [...pointers.current.values()];
      const cur = tRef.current;
      gesture.current = { type: 'pan', px: p.x, py: p.y, x: cur.x, y: cur.y };
    } else if (pointers.current.size === 0) {
      gesture.current = null;
      if (tRef.current.s < 1.05) setT({ s: 1, x: 0, y: 0 });
    }
  }

  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="pv-bar">
        <button className="pv-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        <div className="pv-zoom">
          <button className="pv-btn" onClick={() => zoomTo(t.s / 1.4)} disabled={t.s <= MIN} aria-label="Zoom out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button className="pv-pct" onClick={() => setT({ s: 1, x: 0, y: 0 })} aria-label="Reset zoom" title="Reset">
            {Math.round(t.s * 100)}%
          </button>
          <button className="pv-btn" onClick={() => zoomTo(t.s * 1.4)} disabled={t.s >= MAX} aria-label="Zoom in">
            <Icon name="plus" size={20} stroke={2} />
          </button>
        </div>
        <span className="pv-spacer" />
      </div>

      <div
        ref={stageRef}
        className={`pv-stage${t.s > 1 ? ' zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
        />
      </div>

      <div className="pv-hint">{t.s > 1 ? 'Drag to move · double-tap to zoom out' : 'Pinch or double-tap to zoom'}</div>
    </div>,
    document.body
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

type Props = {
  file: File;
  aspect: number;        // width / height, e.g. 1 for avatar, 3 for cover
  round?: boolean;       // show a circular preview (avatar)
  outWidth: number;      // exported width in px
  title: string;
  onCancel: () => void;
  onDone: (file: File) => void;
};

const MAX_ZOOM = 4;

export default function ImageCropper({ file, aspect, round, outWidth, title, onCancel, onDone }: Props) {
  const [src, setSrc] = useState("");
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(300);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);

  const frameH = frameW / aspect;
  const base = nat ? Math.max(frameW / nat.w, frameH / nat.h) : 1;
  const scale = base * zoom;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const size = () => setFrameW(Math.max(220, Math.min(round ? 340 : 520, window.innerWidth - 40)));
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, [round]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  function clamp(p: { x: number; y: number }, s = scale) {
    if (!nat) return p;
    const maxX = Math.max(0, (nat.w * s - frameW) / 2);
    const maxY = Math.max(0, (nat.h * s - frameH) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }

  useEffect(() => { setPos(current => clamp(current)); }, [zoom, frameW, nat]); // eslint-disable-line react-hooks/exhaustive-deps

  function setZoomSafe(value: number) { setZoom(Math.min(MAX_ZOOM, Math.max(1, value))); }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: event.clientX, y: event.clientY, px: pos.x, py: pos.y };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom };
      drag.current = null;
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomSafe(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
    } else if (drag.current) {
      setPos(clamp({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y }));
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    const rest = [...pointers.current.values()][0];
    drag.current = rest ? { x: rest.x, y: rest.y, px: pos.x, py: pos.y } : null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    setZoomSafe(zoom - event.deltaY * 0.0015);
  }

  function save() {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(outWidth);
      canvas.height = Math.round(outWidth / aspect);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = -(frameW / 2 + pos.x - (nat.w * scale) / 2) / scale;
      const sy = -(frameH / 2 + pos.y - (nat.h * scale) / 2) / scale;
      ctx.drawImage(img, sx, sy, frameW / scale, frameH / scale, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        setBusy(false);
        if (!blob) { setError("Could not crop this image. Try another one."); return; }
        onDone(new File([blob], `${round ? "avatar" : "cover"}.jpg`, { type: "image/jpeg" }));
      }, "image/jpeg", 0.9);
    } catch {
      setBusy(false);
      setError("Could not crop this image. Try another one.");
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="crop-box">
        <div className="crop-head">
          <button className="crop-x" aria-label="Cancel" onClick={onCancel}><X size={20}/></button>
          <b>{title}</b>
          <button className="crop-save" disabled={!nat || busy} onClick={save}>{busy ? "Saving..." : <>Apply <Check size={15}/></>}</button>
        </div>
        <div className="crop-stage">
          <div
            className={`crop-frame ${round ? "is-round" : ""}`}
            style={{ width: frameW, height: frameH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={event => setNat({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
                onError={() => setError("This image format is not supported. Choose a JPG, PNG or WEBP image.")}
                style={nat ? { width: nat.w * scale, height: nat.h * scale, transform: `translate(-50%,-50%) translate(${pos.x}px,${pos.y}px)` } : { visibility: "hidden" }}
              />
            )}
            {!round && <span className="crop-grid" aria-hidden="true"/>}
          </div>
        </div>
        {error ? <p className="crop-error">{error}</p> : <p className="crop-hint">Drag to move, pinch or use the slider to zoom.</p>}
        <label className="crop-zoom">
          <span>-</span>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={event => setZoomSafe(Number(event.target.value))} aria-label="Zoom"/>
          <span>+</span>
        </label>
      </div>
    </div>,
    document.body
  );
}

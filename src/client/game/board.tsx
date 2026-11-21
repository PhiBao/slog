/**
 * Canvas board renderer for Slog.
 *
 * Skeleton pass: flat palette colors, legible shapes, DPR-aware scaling.
 * The full cozy pixel-archaeology art direction lands in the art pass
 * (see DESIGN.md tokens — all hex values used here come from there).
 */

import { useEffect, useRef } from "react";

import type { FloorGen, Pos } from "../../shared/types";

// DESIGN.md palette
const PALETTE = {
  wallDeep: "#2A1E3F",
  wallMid: "#3B2A56",
  floor: "#8C7AA9",
  floorAlt: "#6E5B8F",
  amber: "#FFB84D",
  moss: "#7FB069",
  slimeTeal: "#52D6C8",
  salt: "#F4F1EA",
  saltShadow: "#C9C4B8",
  parchment: "#F2ECDF",
  rose: "#E4586B",
  ink: "#241B35",
} as const;

export type BoardProps = {
  gen: FloorGen;
  hero: Pos;
  size: number; // css pixels, square
};

export function Board({ gen, hero, size }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tile = (size * dpr) / gen.width;
    const rowHeight = (size * dpr) / gen.height;

    for (let y = 0; y < gen.height; y++) {
      for (let x = 0; x < gen.width; x++) {
        const kind = gen.tiles[y]?.[x] ?? "wall";
        const px = x * tile;
        const py = y * rowHeight;
        ctx.fillStyle = kind === "wall" ? (x + y) % 2 === 0 ? PALETTE.wallDeep : PALETTE.wallMid : PALETTE.floor;
        if (kind === "moss") ctx.fillStyle = PALETTE.moss;
        if (kind === "floor" && (x + y) % 2 === 1) ctx.fillStyle = PALETTE.floorAlt;
        ctx.fillRect(px, py, tile, rowHeight);

        if (kind === "salt") {
          ctx.fillStyle = PALETTE.saltShadow;
          ctx.fillRect(px + tile * 0.2, py + rowHeight * 0.55, tile * 0.6, rowHeight * 0.25);
          ctx.fillStyle = PALETTE.salt;
          for (let c = 0; c < 3; c++) {
            const cx = px + tile * (0.3 + c * 0.2);
            const cy = py + rowHeight * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy - rowHeight * 0.22);
            ctx.lineTo(cx + tile * 0.09, cy + rowHeight * 0.08);
            ctx.lineTo(cx - tile * 0.09, cy + rowHeight * 0.08);
            ctx.closePath();
            ctx.fill();
          }
        }
        if (kind === "dew") {
          ctx.fillStyle = PALETTE.slimeTeal;
          ctx.beginPath();
          ctx.arc(px + tile * 0.5, py + rowHeight * 0.5, tile * 0.14, 0, Math.PI * 2);
          ctx.fill();
        }
        if (kind === "burrow") {
          ctx.fillStyle = PALETTE.amber;
          ctx.fillRect(px + tile * 0.1, py + rowHeight * 0.1, tile * 0.8, rowHeight * 0.8);
          ctx.fillStyle = PALETTE.ink;
          ctx.beginPath();
          ctx.arc(px + tile * 0.5, py + rowHeight * 0.5, tile * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        if (kind === "entrance") {
          ctx.fillStyle = PALETTE.floor;
          ctx.fillRect(px, py, tile, rowHeight);
          ctx.fillStyle = PALETTE.parchment;
          ctx.fillRect(px + tile * 0.3, py + rowHeight * 0.3, tile * 0.4, rowHeight * 0.4);
        }
      }
    }

    // Sir Slog — a shell spiral (amber) with an eye stalk (teal)
    const hx = hero.x * tile;
    const hy = hero.y * rowHeight;
    const cx = hx + tile * 0.5;
    const cy = hy + rowHeight * 0.5;
    ctx.fillStyle = PALETTE.parchment;
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = Math.max(2, tile * 0.06);
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4.5; a += 0.25) {
      const r = (tile * 0.3) * (a / (Math.PI * 4.5));
      const px2 = cx + Math.cos(a) * r;
      const py2 = cy + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(px2, py2);
      else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
    // eye stalk
    ctx.fillStyle = PALETTE.slimeTeal;
    ctx.beginPath();
    ctx.arc(cx + tile * 0.3, cy - rowHeight * 0.28, tile * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }, [gen, hero, size]);

  return <canvas ref={canvasRef} className="rounded-md" aria-label="Slog board" />;
}

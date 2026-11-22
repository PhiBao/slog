/**
 * Canvas board renderer — the cozy pixel-archaeology pass.
 *
 * Art direction (DESIGN.md): warm plum cavern walls with lantern shading,
 * moss creeping over stone, salt crystals that sparkle menacingly, dew
 * glints, and an amber-glowing burrow. Sir Slog is drawn as a shell spiral
 * with an eye stalk; he slides with squash-and-stretch and breathes at rest.
 * With prefers-reduced-motion he teleports with a single-frame flash.
 */

import { useEffect, useRef } from "react";

import type { Action, FloorGen, Pos, TileKind } from "../../shared/types";
import { DIRECTIONS } from "../../shared/types";

const PALETTE = {
  wallDeep: "#2A1E3F",
  wallMid: "#3B2A56",
  wallLight: "#574078",
  floor: "#8C7AA9",
  floorAlt: "#7A6899",
  amber: "#FFB84D",
  amberDeep: "#C98A2E",
  moss: "#7FB069",
  mossDark: "#5A8A4A",
  slime: "#52D6C8",
  salt: "#F4F1EA",
  saltShadow: "#C9C4B8",
  parchment: "#F2ECDF",
  rose: "#E4586B",
  ink: "#241B35",
} as const;

export type BoardProps = {
  gen: FloorGen;
  hero: Pos;
  size: number; // css width; height derives from the grid ratio so tiles stay square
  /** recent positions of the hero (oldest → newest) used for the slime trail */
  trail?: Pos[] | undefined;
  /** flash overlay when the hero just took damage */
  saltFlash?: boolean | undefined;
  /** dew tiles already collected this floor */
  collected?: Pos[] | undefined;
  /** which way Slog last traveled (for facing) */
  facing?: Exclude<Action, "shell"> | null | undefined;
  /** client-side consequence preview — display only, server re-validates */
  preview?: { legal: Exclude<Action, "shell">[]; outcomes: Partial<Record<Exclude<Action, "shell">, TileKind>> } | undefined;
};

export function Board({ gen, hero, size, trail = [], saltFlash = false, collected = [], facing = null, preview }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<{ from: Pos | null; start: number }>({ from: null, start: 0 });
  const prevHero = useRef<Pos>({ ...hero });

  const cssW = size;
  const cssH = (size * gen.height) / gen.width;

  useEffect(() => {
    if (prevHero.current.x !== hero.x || prevHero.current.y !== hero.y) {
      animRef.current = { from: { ...prevHero.current }, start: performance.now() };
      prevHero.current = { ...hero };
    }
  }, [hero]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const tileW = (cssW * dpr) / gen.width;
    const tileH = (cssH * dpr) / gen.height;
    const rnd = (x: number, y: number) => {
      // deterministic per-tile pseudo-random for art variation
      const n = Math.sin(x * 127.1 + y * 311.7 + gen.seed * 0.017) * 43758.5453;
      return n - Math.floor(n);
    };

    const drawStatic = () => {
      // deep cavern background
      ctx.fillStyle = PALETTE.wallDeep;
      ctx.fillRect(0, 0, cssW * dpr, cssH * dpr);

      for (let y = 0; y < gen.height; y++) {
        for (let x = 0; x < gen.width; x++) {
          const kind = gen.tiles[y]?.[x] ?? "wall";
          const px = x * tileW;
          const py = y * tileH;
          const r = rnd(x, y);

          if (kind === "wall") {
            // rocky wall with lantern-lit top edge variation
            ctx.fillStyle = r > 0.5 ? PALETTE.wallMid : PALETTE.wallDeep;
            ctx.fillRect(px, py, tileW, tileH);
            // chunky brick seams
            ctx.fillStyle = PALETTE.wallLight;
            const seamY = py + tileH * 0.55;
            ctx.fillRect(px, seamY, tileW, Math.max(1, tileH * 0.04));
            ctx.fillRect(px + (r > 0.5 ? tileW * 0.3 : tileW * 0.7), py, Math.max(1, tileW * 0.04), tileH * 0.55);
            continue;
          }

          // walkable stone base with checkered warmth
          ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.floor : PALETTE.floorAlt;
          ctx.fillRect(px, py, tileW, tileH);
          // soft grain speckles
          ctx.fillStyle = "rgba(0,0,0,0.10)";
          ctx.fillRect(px + tileW * (0.15 + r * 0.5), py + tileH * (0.2 + r * 0.5), tileW * 0.08, tileH * 0.08);

          if (kind === "moss") {
            // creeping moss patches
            ctx.fillStyle = PALETTE.mossDark;
            ctx.fillRect(px + tileW * 0.1, py + tileH * 0.55, tileW * 0.8, tileH * 0.35);
            ctx.fillStyle = PALETTE.moss;
            ctx.fillRect(px + tileW * 0.25, py + tileH * 0.3, tileW * 0.4, tileH * 0.3);
            ctx.fillRect(px + tileW * 0.55, py + tileH * 0.6, tileW * 0.25, tileH * 0.25);
          }
          if (kind === "dew" && !collected.some((p) => p.x === x && p.y === y)) {
            // glinting dew drop
            ctx.fillStyle = PALETTE.slime;
            ctx.beginPath();
            ctx.arc(px + tileW * 0.5, py + tileH * 0.55, tileW * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.beginPath();
            ctx.arc(px + tileW * 0.44, py + tileH * 0.48, tileW * 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
          if (kind === "salt") {
            // menacing crystal cluster on a dark crust
            ctx.fillStyle = "rgba(0,0,0,0.18)";
            ctx.fillRect(px, py, tileW, tileH);
            ctx.fillStyle = PALETTE.saltShadow;
            ctx.fillRect(px + tileW * 0.2, py + tileH * 0.6, tileW * 0.6, tileH * 0.2);
            const crystals = 3;
            for (let c = 0; c < crystals; c++) {
              const cx = px + tileW * (0.28 + c * 0.22);
              const h = tileH * (0.34 + rnd(x + c, y) * 0.14);
              ctx.fillStyle = PALETTE.salt;
              ctx.beginPath();
              ctx.moveTo(cx, py + tileH * 0.72 - h);
              ctx.lineTo(cx + tileW * 0.08, py + tileH * 0.72);
              ctx.lineTo(cx - tileW * 0.08, py + tileH * 0.72);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,0.9)";
              ctx.fillRect(cx - tileW * 0.012, py + tileH * 0.72 - h, tileW * 0.024, h * 0.6);
            }
          }
          if (kind === "burrow") {
            // the amber burrow: warm glow ring + dark hole
            const glow = ctx.createRadialGradient(
              px + tileW * 0.5,
              py + tileH * 0.5,
              tileW * 0.1,
              px + tileW * 0.5,
              py + tileH * 0.5,
              tileW * 0.75
            );
            glow.addColorStop(0, PALETTE.amber);
            glow.addColorStop(1, "rgba(255,184,77,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(px, py, tileW, tileH);
            ctx.fillStyle = PALETTE.ink;
            ctx.beginPath();
            ctx.arc(px + tileW * 0.5, py + tileH * 0.55, tileW * 0.26, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = PALETTE.amberDeep;
            ctx.fillRect(px + tileW * 0.2, py + tileH * 0.82, tileW * 0.6, tileH * 0.08);
          }
          if (kind === "entrance") {
            // the little arch Slog came from
            ctx.fillStyle = PALETTE.wallLight;
            ctx.fillRect(px, py, tileW, tileH * 0.25);
            ctx.fillStyle = PALETTE.ink;
            ctx.fillRect(px + tileW * 0.2, py + tileH * 0.25, tileW * 0.6, tileH * 0.75);
            ctx.fillStyle = PALETTE.parchment;
            ctx.fillRect(px + tileW * 0.42, py + tileH * 0.55, tileW * 0.16, tileH * 0.16);
          }
        }
      }

      // slime trail from recent positions
      for (const p of trail) {
        const px = p.x * tileW;
        const py = p.y * tileH;
        ctx.fillStyle = "rgba(82,214,200,0.22)";
        ctx.beginPath();
        ctx.arc(px + tileW * 0.5, py + tileH * 0.5, tileW * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }

      // move preview: ring the reachable tiles and mark what they hold
      if (preview) {
        for (const action of preview.legal) {
          const d = DIRECTIONS[action];
          const nx = hero.x + d.x;
          const ny = hero.y + d.y;
          if (nx < 0 || ny < 0 || nx >= gen.width || ny >= gen.height) continue;
          const px = nx * tileW;
          const py = ny * tileH;
          ctx.strokeStyle = "rgba(82,214,200,0.75)";
          ctx.lineWidth = Math.max(2, tileW * 0.06);
          ctx.strokeRect(px + tileW * 0.12, py + tileH * 0.12, tileW * 0.76, tileH * 0.76);
          const outcome = preview.outcomes[action];
          ctx.fillStyle = PALETTE.parchment;
          ctx.font = `${Math.round(tileH * 0.34)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const glyph = outcome === "salt" ? "🧂" : outcome === "dew" ? "✦" : outcome === "burrow" ? "◎" : "";
          if (glyph) ctx.fillText(glyph, px + tileW * 0.5, py + tileH * 0.78);
        }
      }
    };

    const drawHero = (heroPos: Pos, t: number) => {
      const hx = heroPos.x * tileW;
      const hy = heroPos.y * tileH;
      const cx = hx + tileW * 0.5;
      const cy = hy + tileH * 0.5;

      // squash-stretch during a slide, gentle bob at rest
      let scaleX = 1;
      let scaleY = 1;
      let offY = 0;
      if (!reduced) {
        const slide = Math.max(0, 1 - t / 180);
        if (slide > 0) {
          scaleX = 1 + 0.12 * slide;
          scaleY = 1 - 0.12 * slide;
        } else {
          offY = Math.sin(t / 400) * tileH * 0.03;
        }
      }

      ctx.save();
      ctx.translate(cx, cy + offY);
      ctx.scale(facing === "left" ? -scaleX : scaleX, scaleY);

      // body
      ctx.fillStyle = PALETTE.parchment;
      ctx.beginPath();
      ctx.ellipse(0, tileH * 0.05, tileW * 0.42, tileH * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      // shell
      ctx.fillStyle = PALETTE.amber;
      ctx.beginPath();
      ctx.arc(-tileW * 0.05, -tileH * 0.06, tileW * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = Math.max(1.5, tileW * 0.05);
      ctx.beginPath();
      const turns = Math.PI * 4.5;
      for (let a = 0; a <= turns; a += 0.3) {
        const r = (tileW * 0.28) * (a / turns);
        const px = -tileW * 0.05 + Math.cos(a) * r;
        const py = -tileH * 0.06 + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // eye stalks
      const stalkWave = reduced ? 0 : Math.sin(t / 300) * 0.15;
      ctx.strokeStyle = PALETTE.parchment;
      ctx.lineWidth = Math.max(1.5, tileW * 0.05);
      ctx.beginPath();
      ctx.moveTo(tileW * 0.18, tileH * 0.02);
      ctx.quadraticCurveTo(
        tileW * 0.34,
        tileH * (-0.18 + stalkWave),
        tileW * 0.4,
        tileH * (-0.26 + stalkWave)
      );
      ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.arc(tileW * 0.4, tileH * (-0.26 + stalkWave), tileW * 0.075, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    let raf = 0;
    const render = (now: number) => {
      drawStatic();
      const { from, start } = animRef.current;
      let pos: Pos = { ...hero };
      if (from && !reduced) {
        const t = now - start;
        if (t < 180) {
          const k = t / 180;
          pos = {
            x: from.x + (hero.x - from.x) * (1 - Math.pow(1 - k, 2)),
            y: from.y + (hero.y - from.y) * (1 - Math.pow(1 - k, 2)),
          };
        }
      }
      drawHero(pos, now);

      if (saltFlash && !reduced) {
        ctx.fillStyle = `rgba(228,88,107,${Math.max(0, 0.35 - (now % 400) / 400 * 0.35)})`;
        ctx.fillRect(0, 0, size * dpr, size * dpr);
      }

      if (!reduced) raf = requestAnimationFrame(render);
    };

    if (reduced) {
      render(performance.now());
    } else {
      raf = requestAnimationFrame(render);
    }
    return () => cancelAnimationFrame(raf);
  }, [gen, hero, size, trail, saltFlash, collected, facing, preview, cssH, cssW]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg ring-2 ring-[#3B2A56]"
      role="img"
      aria-label={`The Undervault: floor ${gen.id}, ${gen.flavor}. Sir Slog the snail is at position ${hero.x + 1},${hero.y + 1}.`}
    />
  );
}

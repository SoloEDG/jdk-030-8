import type { Dir } from "@/shared/types";
import type { SeamBlueprint, SeamLevelState, SeamPiece } from "../model/types";
import { frameWalls, inFrame, key, liveSeams, pieceCells } from "./geometry";

export const SEAM_TILE = 44;

const ink = "#1c1610";
const plank = "#3a2a1c";
const pit = "#0b0907";
const brass = "#c9a36a";
const rust = "#b56a32";
const steel = "#8a93a0";
const glass = "#7ec8c8";
const order = "rgba(125,155,106,0.16)";

const STAMP_COLOR: Record<string, string> = {
  甲: rust, 乙: steel, 丙: glass,
  北: rust, 南: steel, 西: brass, 东: glass, 中: "#d8b24a",
  订: rust, 废: "#5a4a3a",
};

export function paintSeam(
  ctx: CanvasRenderingContext2D,
  blueprint: SeamBlueprint,
  state: SeamLevelState,
  selectedId: string,
  tile = SEAM_TILE,
): void {
  const { width, height } = blueprint;
  ctx.clearRect(0, 0, width * tile, height * tile);
  ctx.fillStyle = pit;
  ctx.fillRect(0, 0, width * tile, height * tile);

  const wallSet = new Set(blueprint.walls.map((wall) => key(wall.x, wall.y)));
  for (const wall of frameWalls(blueprint.frame)) wallSet.add(key(wall.x, wall.y));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x * tile;
      const py = y * tile;
      if (wallSet.has(key(x, y))) {
        ctx.fillStyle = plank;
        ctx.fillRect(px, py, tile, tile);
        ctx.strokeStyle = "#2a1d14";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 4, py + 4, tile - 8, tile - 8);
      } else {
        const inside = inFrame(blueprint.frame, x, y);
        ctx.fillStyle = inside ? "#241d16" : "#171210";
        ctx.fillRect(px + 1, py + 1, tile - 2, tile - 2);
        ctx.strokeStyle = inside ? "rgba(201,163,106,0.22)" : "rgba(0,0,0,0.4)";
        ctx.strokeRect(px + 1, py + 1, tile - 2, tile - 2);
      }
    }
  }

  // 订单压印格（框内目标）。
  ctx.font = "12px ui-serif, Palatino, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const target of blueprint.targets) {
    const px = target.x * tile;
    const py = target.y * tile;
    ctx.fillStyle = order;
    ctx.fillRect(px + 3, py + 3, tile - 6, tile - 6);
    ctx.strokeStyle = "rgba(125,155,106,0.55)";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(px + 5, py + 5, tile - 10, tile - 10);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(125,155,106,0.8)";
    ctx.fillText(target.stamp, px + tile / 2, py + tile / 2);
  }

  // 已固定接缝高亮。
  const fixedSet = new Set(state.fixed);
  for (const piece of state.pieces) paintPiece(ctx, piece, piece.id === selectedId, tile);

  // 咬合接缝连线。
  for (const pair of liveSeams(state.pieces, blueprint.allowedSeams)) {
    const [aId, bId] = pair.split("|");
    const a = state.pieces.find((p) => p.id === aId)!;
    const b = state.pieces.find((p) => p.id === bId)!;
    const ca = pieceCells(a);
    const cb = pieceCells(b);
    for (const cellA of ca) {
      for (const dir of ["n", "e", "s", "w"] as Dir[]) {
        const d = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[dir];
        if (cb.some((cell) => cell.x === cellA.x + d[0] && cell.y === cellA.y + d[1])) {
          drawSeamMark(ctx, cellA.x, cellA.y, dir, fixedSet.has(pair), tile);
        }
      }
    }
  }
}

function paintPiece(
  ctx: CanvasRenderingContext2D,
  piece: SeamPiece,
  selected: boolean,
  tile: number,
): void {
  const fill = piece.spare ? "#4a3d2e" : STAMP_COLOR[piece.stamp] ?? rust;
  for (const cell of piece.cells) {
    const x = piece.x + cell.x;
    const y = piece.y + cell.y;
    const px = x * tile;
    const py = y * tile;
    ctx.globalAlpha = piece.spare ? 0.66 : 1;
    ctx.fillStyle = fill;
    ctx.fillRect(px + 5, py + 5, tile - 10, tile - 10);
    ctx.strokeStyle = selected ? brass : ink;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeRect(px + 5, py + 5, tile - 10, tile - 10);
    ctx.globalAlpha = 1;
  }
  // 齿口标记：在占格外缘画凸/凹符号。
  for (const [dir, profile] of Object.entries(piece.edges) as [Dir, string][]) {
    if (profile === "plain") continue;
    const anchor = piece.cells[0];
    const gx = piece.x + anchor.x;
    const gy = piece.y + anchor.y;
    drawEdge(ctx, gx, gy, dir, profile, tile);
  }
  // 压印字符写在首格。
  const first = piece.cells[0];
  ctx.fillStyle = ink;
  ctx.font = "bold 13px ui-serif, Palatino, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(piece.stamp, (piece.x + first.x) * tile + tile / 2, (piece.y + first.y) * tile + tile / 2);
  if (selected) {
    ctx.strokeStyle = brass;
    ctx.lineWidth = 1;
    for (const cell of piece.cells) {
      ctx.strokeRect((piece.x + cell.x) * tile + 2, (piece.y + cell.y) * tile + 2, tile - 4, tile - 4);
    }
  }
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  dir: Dir,
  profile: string,
  tile: number,
): void {
  const cx = gx * tile + tile / 2;
  const cy = gy * tile + tile / 2;
  const off = tile / 2 - 4;
  const pos = {
    n: { x: cx, y: cy - off },
    s: { x: cx, y: cy + off },
    e: { x: cx + off, y: cy },
    w: { x: cx - off, y: cy },
  }[dir];
  ctx.fillStyle = profile === "tab" ? brass : pit;
  ctx.strokeStyle = brass;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawSeamMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: Dir,
  fixed: boolean,
  tile: number,
): void {
  const d = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[dir];
  const mx = (x + 0.5 + d[0] * 0.5) * tile;
  const my = (y + 0.5 + d[1] * 0.5) * tile;
  ctx.fillStyle = fixed ? "#7d9b6a" : brass;
  ctx.beginPath();
  ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

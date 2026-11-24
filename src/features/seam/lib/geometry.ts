import type { Dir, Vec } from "@/shared/types";
import type { AllowedSeam, FrameSpec, SeamPiece } from "../model/types";

export const DIR_DELTA: Record<Dir, Vec> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = { n: "s", e: "w", s: "n", w: "e" };

export function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function seamKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** 托盘当前占据的全部格。 */
export function pieceCells(piece: SeamPiece): Vec[] {
  return piece.cells.map((cell) => ({ x: piece.x + cell.x, y: piece.y + cell.y }));
}

/** 格 -> 占该格的托盘。 */
export function occupancy(pieces: SeamPiece[]): Map<string, SeamPiece> {
  const map = new Map<string, SeamPiece>();
  for (const piece of pieces) {
    for (const cell of pieceCells(piece)) map.set(key(cell.x, cell.y), piece);
  }
  return map;
}

function complementary(a: SeamPiece, b: SeamPiece, dir: Dir): boolean {
  const edgeA = a.edges[dir];
  const edgeB = b.edges[OPPOSITE[dir]];
  return (
    (edgeA === "tab" && edgeB === "slot") ||
    (edgeA === "slot" && edgeB === "tab")
  );
}

/**
 * 两件托盘当前是否真的咬合：
 * 必须在允许接缝清单里，方向与齿口都对得上，且相邻格确实各有占格。
 */
export function isInterlocked(
  a: SeamPiece,
  b: SeamPiece,
  allowed: AllowedSeam[],
): boolean {
  const rule = allowed.find(
    (item) =>
      (item.a === a.id && item.b === b.id) ||
      (item.a === b.id && item.b === a.id),
  );
  if (!rule) return false;
  // 规则里 dir 表示 a 在 b 的哪一侧；统一换算成从 a 指向 b 的方向。
  const dirFromA: Dir = rule.a === a.id ? OPPOSITE[rule.dir] : rule.dir;
  if (!complementary(a, b, dirFromA)) return false;
  const delta = DIR_DELTA[dirFromA];
  const cellsA = new Set(pieceCells(a).map((cell) => key(cell.x, cell.y)));
  return pieceCells(b).some((cell) => cellsA.has(key(cell.x - delta.x, cell.y - delta.y)));
}

/** 当前状态下所有实际咬合的接缝（无序 id 对）。 */
export function liveSeams(
  pieces: SeamPiece[],
  allowed: AllowedSeam[],
): string[] {
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      if (isInterlocked(pieces[i], pieces[j], allowed)) {
        out.push(seamKey(pieces[i].id, pieces[j].id));
      }
    }
  }
  return out;
}

/**
 * 咬合连通分量：咬住的托盘必须整块一起搬。
 * fixed 里用户已确认的接缝即使几何上暂时脱开，也视为不可拆（这里只在
 * 已咬合的接缝上生效，固定脱开件没有物理意义，UI 不允许这样固定）。
 */
export function interlockGroups(
  pieces: SeamPiece[],
  allowed: AllowedSeam[],
  fixed: string[] = [],
): Map<string, string[]> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  for (const piece of pieces) parent.set(piece.id, piece.id);
  const fixedSet = new Set(fixed);
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const pair = seamKey(pieces[i].id, pieces[j].id);
      if (fixedSet.has(pair) || isInterlocked(pieces[i], pieces[j], allowed)) {
        union(pieces[i].id, pieces[j].id);
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const piece of pieces) {
    const root = find(piece.id);
    const list = groups.get(root) ?? [];
    list.push(piece.id);
    groups.set(root, list);
  }
  return groups;
}

export function groupOf(
  pieces: SeamPiece[],
  allowed: AllowedSeam[],
  pieceId: string,
  fixed: string[] = [],
): string[] {
  const groups = interlockGroups(pieces, allowed, fixed);
  for (const list of groups.values()) {
    if (list.includes(pieceId)) return list;
  }
  return [pieceId];
}

export function inFrame(frame: FrameSpec, x: number, y: number): boolean {
  return (
    x >= frame.bounds.minX &&
    x <= frame.bounds.maxX &&
    y >= frame.bounds.minY &&
    y <= frame.bounds.maxY
  );
}

/** 框壁格：入口那一侧不生成墙。 */
export function frameWalls(frame: FrameSpec): Vec[] {
  const walls: Vec[] = [];
  const { minX, minY, maxX, maxY } = frame.bounds;
  const push = (x: number, y: number): void => {
    if (!walls.some((wall) => wall.x === x && wall.y === y)) walls.push({ x, y });
  };
  if (frame.entry !== "n") for (let x = minX; x <= maxX; x += 1) push(x, minY - 1);
  if (frame.entry !== "s") for (let x = minX; x <= maxX; x += 1) push(x, maxY + 1);
  if (frame.entry !== "w") for (let y = minY; y <= maxY; y += 1) push(minX - 1, y);
  if (frame.entry !== "e") for (let y = minY; y <= maxY; y += 1) push(maxX + 1, y);
  return walls;
}

export function clonePieces(pieces: SeamPiece[]): SeamPiece[] {
  return pieces.map((piece) => ({
    ...piece,
    cells: piece.cells.map((cell) => ({ ...cell })),
    edges: { ...piece.edges },
  }));
}

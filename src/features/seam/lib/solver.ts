import type { Dir } from "@/shared/types";
import type { SeamBlueprint, SeamLevelState, SeamPiece, SeamSolveResult } from "../model/types";
import { evaluateAcceptance } from "./acceptance";
import { frameWalls, inFrame, key, pieceCells } from "./geometry";
import { applyPush } from "./push";

const DIRS: Dir[] = ["n", "e", "s", "w"];
const DEFAULT_CAP = 60000;
const DELTA: Record<Dir, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
const OPP: Record<Dir, Dir> = { n: "s", e: "w", s: "n", w: "e" };

function stateSignature(state: SeamLevelState): string {
  return state.pieces
    .map((piece) => `${piece.id}:${key(piece.x, piece.y)}`)
    .sort()
    .join(";");
}

interface Node {
  state: SeamLevelState;
  rank: number;
}

class Heap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].rank <= this.items[i].rank) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): Node {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.items[left].rank < this.items[smallest].rank) {
          smallest = left;
        }
        if (right < this.items.length && this.items[right].rank < this.items[smallest].rank) {
          smallest = right;
        }
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

function pieceDistance(blueprint: SeamBlueprint, piece: SeamPiece): number {
  if (piece.spare) return 0;
  let best = Infinity;
  for (const anchor of piece.cells) {
    for (const target of blueprint.targets) {
      if (target.stamp !== piece.stamp) continue;
      const dx = target.x - anchor.x - piece.x;
      const dy = target.y - anchor.y - piece.y;
      best = Math.min(best, Math.abs(dx) + Math.abs(dy));
    }
  }
  return Number.isFinite(best) ? best : 999;
}

function countSeams(blueprint: SeamBlueprint, state: SeamLevelState): number {
  let count = 0;
  for (const rule of blueprint.allowedSeams) {
    const a = state.pieces.find((piece) => piece.id === rule.a);
    const b = state.pieces.find((piece) => piece.id === rule.b);
    if (!a || !b) continue;
    const cellsA = new Set(pieceCells(a).map((cell) => key(cell.x, cell.y)));
    const towardB: Dir = rule.a === a.id ? OPP[rule.dir] : rule.dir;
    const d = DELTA[towardB];
    const adjacent = pieceCells(b).some((cell) =>
      cellsA.has(key(cell.x - d.x, cell.y - d.y)),
    );
    if (!adjacent) continue;
    const ea = a.edges[towardB];
    const eb = b.edges[OPP[towardB]];
    if ((ea === "tab" && eb === "slot") || (ea === "slot" && eb === "tab")) count += 1;
  }
  return count;
}

/** 强启发式（越小越好）。 */
function heuristic(blueprint: SeamBlueprint, state: SeamLevelState): number {
  let h = 0;
  for (const piece of state.pieces) {
    if (piece.spare) {
      h += spareCloseness(blueprint, piece);
      continue;
    }
    h += pieceDistance(blueprint, piece) * 4;
    const insideCells = pieceCells(piece).filter((cell) =>
      inFrame(blueprint.frame, cell.x, cell.y),
    ).length;
    h -= insideCells * 2;
  }
  h -= countSeams(blueprint, state) * 6;
  return h;
}

function spareCloseness(blueprint: SeamBlueprint, piece: SeamPiece): number {
  const frame = blueprint.frame;
  const { bounds, entry } = frame;
  let penalty = 0;
  for (const cell of pieceCells(piece)) {
    if (inFrame(frame, cell.x, cell.y)) penalty += 20;
    if (entry === "s" && cell.y <= bounds.maxY + 1 && cell.x >= bounds.minX && cell.x <= bounds.maxX) {
      penalty += (bounds.maxY + 2 - cell.y) * 2;
    }
    if (entry === "n" && cell.y >= bounds.minY - 1 && cell.x >= bounds.minX && cell.x <= bounds.maxX) {
      penalty += (cell.y - bounds.minY + 2) * 2;
    }
    if (entry === "w" && cell.x >= bounds.minX - 1 && cell.y >= bounds.minY && cell.y <= bounds.maxY) {
      penalty += (bounds.minX + 2 - cell.x) * 2;
    }
    if (entry === "e" && cell.x <= bounds.maxX + 1 && cell.y >= bounds.minY && cell.y <= bounds.maxY) {
      penalty += (cell.x - bounds.maxX + 2) * 2;
    }
  }
  return penalty;
}

/**
 * 宏移动：把一件沿某方向连续推，直到再推一格就被挡住（墙/别的件）。
 * 返回连续推动后的状态与累计的逐步 PushStep（玩家照单逐格推即可复现）。
 */
function macroPush(
  blueprint: SeamBlueprint,
  walls: { x: number; y: number }[],
  state: SeamLevelState,
  pieceId: string,
  dir: Dir,
): SeamLevelState | null {
  let current = state;
  let movedAny = false;
  for (let guard = 0; guard < 64; guard += 1) {
    const outcome = applyPush(current, blueprint.allowedSeams, walls, pieceId, dir);
    if (!outcome.ok || !outcome.state) break;
    current = outcome.state;
    movedAny = true;
    // 若这一推新咬合上了接缝，停下来把“咬合时机”暴露给搜索。
    if (outcome.step && outcome.step.locked.length > 0) break;
  }
  return movedAny ? current : null;
}

/**
 * 带启发式的最佳优先搜索。动作语义完全是“真实推动”，
 * 但把走廊里的连续直推压缩成一个宏移动；每个宏移动展开后仍是一串
 * 可由玩家逐格执行的 PushStep。
 *
 * @param fixed 用户已确认要保留的接缝；搜索中这些件对永不被拆开。
 */
export function solveSeam(
  blueprint: SeamBlueprint,
  initial: SeamLevelState,
  fixed: string[] = [],
  cap = DEFAULT_CAP,
): SeamSolveResult {
  const walls = [...blueprint.walls, ...frameWalls(blueprint.frame)];
  const start: SeamLevelState = {
    ...initial,
    fixed: [...new Set([...initial.fixed, ...fixed])],
    steps: [],
  };

  const heap = new Heap();
  const seen = new Map<string, number>([[stateSignature(start), heuristic(blueprint, start)]]);
  heap.push({ state: start, rank: seen.get(stateSignature(start))! });
  let visited = 0;
  let closest = { state: start, score: -seen.get(stateSignature(start))! };

  while (heap.size > 0) {
    const node = heap.pop();
    const current = node.state;
    visited += 1;
    const acceptance = evaluateAcceptance(blueprint, current);
    if (acceptance.accepted) {
      return { kind: "plan", steps: current.steps, final: current };
    }
    const score = -heuristic(blueprint, current);
    if (score > closest.score) closest = { state: current, score };
    if (visited >= cap) break;

    const candidates: { state: SeamLevelState; rank: number }[] = [];
    for (const piece of current.pieces) {
      for (const dir of DIRS) {
        // 备用片不允许朝入口方向推：它们的职责是让路，不进框。
        if (piece.spare && dir === blueprint.frame.entry) continue;
        const next = macroPush(blueprint, walls, current, piece.id, dir);
        if (!next) continue;
        const sig = stateSignature(next);
        const rank = next.steps.length + heuristic(blueprint, next) * 3;
        const prior = seen.get(sig);
        if (prior != null && prior <= rank) continue;
        seen.set(sig, rank);
        candidates.push({ state: next, rank });
      }
    }
    candidates.sort((a, b) => a.rank - b.rank);
    for (const candidate of candidates) heap.push(candidate);
  }

  const reason = visited >= cap ? "cap" : diagnose(blueprint, closest.state);
  const message =
    reason === "cap"
      ? `搜索 ${cap} 个状态仍未找到可进框的推法，可能存在更长的解；先固定已确认接缝再求其余。`
      : reason === "sealed"
        ? "订单形状虽能平铺，但入口被先咬上的接缝封死：整件宽度进不去入口，另一件再也没有可被内壁推到的通道。换备用拼片或调整咬合次序。"
        : "固定朝向、不旋转的前提下，不存在满足压印与接缝订单的进框布局。";
  return { kind: "no-plan", reason, message, closest };
}

/** 区分“封死入口”与“订单本身无解”：框外咬合整件跨度超过入口开口即为封死。 */
function diagnose(
  blueprint: SeamBlueprint,
  state: SeamLevelState,
): "sealed" | "unsat" {
  const walls = new Set(
    [...blueprint.walls, ...frameWalls(blueprint.frame)].map((wall) =>
      key(wall.x, wall.y),
    ),
  );
  const entry = blueprint.frame.entry;
  const horizontalEntry = entry === "n" || entry === "s";
  const { minX, minY, maxX, maxY } = blueprint.frame.bounds;
  // 入口线上最大的“连续开口段”宽度：分散窄口之间隔着墙墩，整件只能逐段穿过。
  let opening = 0;
  if (horizontalEntry) {
    const wallY = entry === "s" ? maxY + 1 : minY - 1;
    let run = 0;
    for (let x = minX; x <= maxX; x += 1) {
      if (walls.has(key(x, wallY))) run = 0;
      else { run += 1; opening = Math.max(opening, run); }
    }
  } else {
    const wallX = entry === "e" ? maxX + 1 : minX - 1;
    let run = 0;
    for (let y = minY; y <= maxY; y += 1) {
      if (walls.has(key(wallX, y))) run = 0;
      else { run += 1; opening = Math.max(opening, run); }
    }
  }

  const parent = new Map<string, string>();
  for (const piece of state.pieces) parent.set(piece.id, piece.id);
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };
  for (const rule of blueprint.allowedSeams) {
    const a = state.pieces.find((piece) => piece.id === rule.a);
    const b = state.pieces.find((piece) => piece.id === rule.b);
    if (!a || !b) continue;
    const cellsA = new Set(pieceCells(a).map((cell) => key(cell.x, cell.y)));
    const towardB: Dir = rule.a === a.id ? OPP[rule.dir] : rule.dir;
    const d = DELTA[towardB];
    const adjacent = pieceCells(b).some((cell) =>
      cellsA.has(key(cell.x - d.x, cell.y - d.y)),
    );
    if (
      adjacent &&
      ((a.edges[towardB] === "tab" && b.edges[OPP[towardB]] === "slot") ||
        (a.edges[towardB] === "slot" && b.edges[OPP[towardB]] === "tab"))
    ) {
      union(a.id, b.id);
    }
  }
  const groups = new Map<string, SeamPiece[]>();
  for (const piece of state.pieces) {
    const root = find(piece.id);
    const list = groups.get(root) ?? [];
    list.push(piece);
    groups.set(root, list);
  }
  for (const list of groups.values()) {
    const outside = list.some(
      (piece) =>
        !piece.spare &&
        pieceCells(piece).some((cell) => !inFrame(blueprint.frame, cell.x, cell.y)),
    );
    if (!outside) continue;
    const xs = list.flatMap((piece) => pieceCells(piece).map((cell) => cell.x));
    const ys = list.flatMap((piece) => pieceCells(piece).map((cell) => cell.y));
    const span = horizontalEntry
      ? Math.max(...xs) - Math.min(...xs) + 1
      : Math.max(...ys) - Math.min(...ys) + 1;
    if (span > opening) return "sealed";
  }
  return "unsat";
}

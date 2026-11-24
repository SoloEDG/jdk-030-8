import type { Dir, Vec } from "@/shared/types";
import type {
  AllowedSeam,
  PushStep,
  SeamLevelState,
} from "../model/types";
import {
  DIR_DELTA,
  clonePieces,
  groupOf,
  key,
  liveSeams,
  pieceCells,
} from "./geometry";

export interface PushOutcome {
  ok: boolean;
  reason?: "wall" | "piece" | "self";
  state?: SeamLevelState;
  step?: PushStep;
}

/**
 * 模拟一次真实推动。
 *
 * 规则：
 * 1. 被点托盘与其咬合连通分量（含已固定接缝）作为整件平移一格；
 * 2. 平移路径上挡到的其他托盘，若恰好在整件“内壁”前方（平移后被整件占格
 *    顶到），则被内壁推着一起走；被一圈罩住但这一推没有内壁碰到的小件不动；
 * 3. 被推着走的小件若又与别的件咬合，把它们一并并入，迭代到稳定；
 * 4. 任何参与移动的托盘撞墙/场地边界/不动的托盘，则整推作废、一格不动；
 * 5. 不做任何旋转。
 */
export function applyPush(
  state: SeamLevelState,
  allowed: AllowedSeam[],
  walls: Vec[],
  pieceId: string,
  dir: Dir,
): PushOutcome {
  const delta = DIR_DELTA[dir];
  const wallSet = new Set(walls.map((wall) => key(wall.x, wall.y)));
  const byId = new Map(state.pieces.map((piece) => [piece.id, piece]));

  const moving = new Set(groupOf(state.pieces, allowed, pieceId, state.fixed));
  const before = liveSeams(state.pieces, allowed);

  // 迭代吞并：移动集合整体平移一格后，若某个不动件的当前占格落在移动集合
  // 的“新占格”上，它才是被移动集合的内壁真正顶到、必须随行；
  // 移动集合腾空的旧格不算阻挡（罩住但没被推到的小件不随行）。
  let grew = true;
  while (grew) {
    grew = false;
    const movingCells = new Set<string>();
    for (const id of moving) {
      for (const cell of pieceCells(byId.get(id)!)) {
        movingCells.add(key(cell.x, cell.y));
      }
    }
    // 移动集合平移后的新占格（旧格 + delta）。
    const destinationCells = new Set<string>();
    for (const cellKey of movingCells) {
      const [cx, cy] = cellKey.split(",").map(Number);
      destinationCells.add(key(cx + delta.x, cy + delta.y));
    }
    for (const piece of state.pieces) {
      if (moving.has(piece.id)) continue;
      // 不动件的某个当前占格正好是移动集合的目标格：被内壁顶到。
      const pushed = pieceCells(piece).some((cell) =>
        destinationCells.has(key(cell.x, cell.y)),
      );
      if (!pushed) continue;
      const attached = groupOf(state.pieces, allowed, piece.id, state.fixed);
      for (const id of attached) {
        if (!moving.has(id)) {
          moving.add(id);
          grew = true;
        }
      }
    }
  }

  // 校验：移动集合整体平移后，不能撞墙、出界（这里以墙集合表达），
  // 也不能与不移动的托盘抢格。
  const staticOcc = new Set<string>();
  for (const piece of state.pieces) {
    if (moving.has(piece.id)) continue;
    for (const cell of pieceCells(piece)) staticOcc.add(key(cell.x, cell.y));
  }
  for (const id of moving) {
    const piece = byId.get(id)!;
    for (const cell of pieceCells(piece)) {
      const nx = cell.x + delta.x;
      const ny = cell.y + delta.y;
      if (wallSet.has(key(nx, ny))) {
        return { ok: false, reason: "wall" };
      }
      if (staticOcc.has(key(nx, ny))) {
        return { ok: false, reason: "piece" };
      }
    }
  }

  const nextPieces = clonePieces(state.pieces);
  for (const piece of nextPieces) {
    if (moving.has(piece.id)) {
      piece.x += delta.x;
      piece.y += delta.y;
    }
  }
  const after = liveSeams(nextPieces, allowed);
  const locked = after.filter((pair) => !before.includes(pair));
  const step: PushStep = {
    pieceId,
    dir,
    moved: [...moving].sort(),
    locked,
  };
  const next: SeamLevelState = {
    blueprintId: state.blueprintId,
    pieces: nextPieces,
    fixed: [...state.fixed],
    steps: [...state.steps, step],
  };
  return { ok: true, state: next, step };
}

/** 当前咬合但用户还没固定的接缝，供“固定已确认接缝”使用。 */
export function fixableSeams(
  state: SeamLevelState,
  allowed: AllowedSeam[],
): string[] {
  const live = new Set(liveSeams(state.pieces, allowed));
  const fixed = new Set(state.fixed);
  return [...live].filter((pair) => !fixed.has(pair));
}

export function fixSeam(state: SeamLevelState, pair: string): SeamLevelState {
  if (state.fixed.includes(pair)) return state;
  return { ...state, fixed: [...state.fixed, pair] };
}

export function unfixSeam(state: SeamLevelState, pair: string): SeamLevelState {
  return { ...state, fixed: state.fixed.filter((item) => item !== pair) };
}

export function seamPairLabel(pair: string): string {
  return pair.split("|").join(" ⨝ ");
}

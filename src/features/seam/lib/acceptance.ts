import type { SeamBlueprint, SeamLevelState, SeamPiece, TilingResult } from "../model/types";
import {
  inFrame,
  interlockGroups,
  key,
  liveSeams,
  occupancy,
  pieceCells,
} from "./geometry";

export interface Acceptance {
  accepted: boolean;
  checks: { id: string; label: string; pass: boolean; detail: string }[];
}

/**
 * 装箱单签收：只签收最终仍连成一件、压印与接缝都相符的托盘。
 * - 备用拼片允许留在框外；非备用拼片必须全部进框；
 * - 进框的非备用片必须通过咬合关系连成唯一一个连通件；
 * - 订单每个压印格都被同压印的占格覆盖，且框内不允许多余的非订单占格；
 * - 实际咬合的接缝必须全部在允许清单内（清单之外咬上也拒收）。
 */
export function evaluateAcceptance(
  blueprint: SeamBlueprint,
  state: SeamLevelState,
): Acceptance {
  const checks: Acceptance["checks"] = [];
  const required = state.pieces.filter((piece) => !piece.spare);
  const spares = state.pieces.filter((piece) => piece.spare);

  const inside = required.filter((piece) =>
    pieceCells(piece).every((cell) => inFrame(blueprint.frame, cell.x, cell.y)),
  );
  const outside = required.filter((piece) => !inside.includes(piece));
  checks.push({
    id: "inside",
    label: "正片进框",
    pass: outside.length === 0,
    detail:
      outside.length === 0
        ? "全部非备用托盘都在装配框内"
        : `框外仍有：${outside.map((piece) => piece.label).join("、")}`,
  });

  const spareOk = spares.every(
    (piece) => !pieceCells(piece).some((cell) => inFrame(blueprint.frame, cell.x, cell.y)),
  );
  checks.push({
    id: "spare",
    label: "备用拼片留框外",
    pass: spareOk,
    detail: spareOk ? "备用拼片未混入框内" : "备用拼片被推进了框内",
  });

  const groups = interlockGroups(inside, blueprint.allowedSeams, state.fixed);
  const onePiece = inside.length > 0 && groups.size === 1;
  checks.push({
    id: "one",
    label: "最终连成一件",
    pass: onePiece,
    detail: onePiece
      ? `${inside.length} 片托盘咬合为一个整件`
      : `当前框内分成 ${groups.size} 个互不咬合的部分`,
  });

  const occ = occupancy(inside);
  const stampOk = blueprint.targets.every((target) => {
    const holder = occ.get(key(target.x, target.y));
    return holder != null && holder.stamp === target.stamp;
  });
  checks.push({
    id: "stamp",
    label: "上方压印相符",
    pass: stampOk,
    detail: stampOk
      ? `${blueprint.targets.length} 个订单压印全部对上`
      : "存在压印缺失或压印字符不符的目标格",
  });

  const targetSet = new Set(blueprint.targets.map((target) => key(target.x, target.y)));
  const footprint = new Set<string>();
  for (const piece of inside) {
    for (const cell of pieceCells(piece)) footprint.add(key(cell.x, cell.y));
  }
  const noExtra = [...footprint].every((cell) => targetSet.has(cell));
  const noGap = blueprint.targets.every((target) => footprint.has(key(target.x, target.y)));
  checks.push({
    id: "footprint",
    label: "占格与订单一致",
    pass: noExtra && noGap,
    detail: noExtra && noGap ? "框内占格恰好铺满订单形状" : "存在多占格或未覆盖的订单格",
  });

  const seams = liveSeams(inside, blueprint.allowedSeams);
  const allowedPairs = new Set(
    blueprint.allowedSeams.map((rule) => [rule.a, rule.b].sort().join("|")),
  );
  const seamOk = seams.every((pair) => allowedPairs.has(pair));
  checks.push({
    id: "seam",
    label: "接缝均在允许位置",
    pass: seamOk,
    detail: seamOk
      ? `${seams.length} 条咬合接缝全部合法`
      : "出现了订单不允许的接缝",
  });

  return {
    accepted: checks.every((check) => check.pass),
    checks,
  };
}

/**
 * 只问“能不能平铺出订单形状”：不考虑推动与框壁，
 * 用非备用托盘做精确覆盖回溯（形状固定、不旋转），并校验压印。
 * 备用拼片不参与。允许多片托盘使用同一压印。
 */
export function checkTiling(blueprint: SeamBlueprint): TilingResult {
  const required = blueprint.pieces
    .filter((entry) => !entry.model.spare)
    .map((entry) => entry.model);
  const targetCells = blueprint.targets.map((target) => ({ ...target }));
  const targetSet = new Set(targetCells.map((target) => key(target.x, target.y)));
  const stampAt = new Map(targetCells.map((target) => [key(target.x, target.y), target.stamp]));

  const used = new Array(required.length).fill(false);
  const occupied = new Set<string>();

  function search(remaining: { x: number; y: number }[]): boolean {
    const todo = remaining.filter((cell) => !occupied.has(key(cell.x, cell.y)));
    if (todo.length === 0) return true;
    const next = todo[0];
    for (let i = 0; i < required.length; i += 1) {
      if (used[i]) continue;
      const model = required[i];
      // 让模型的每个占格依次作为锚点落在 next 上，枚举全部平移。
      for (const anchor of model.cells) {
        const ox = next.x - anchor.x;
        const oy = next.y - anchor.y;
        const placed = model.cells.map((cell) => ({ x: ox + cell.x, y: oy + cell.y }));
        if (
          placed.some((cell) => {
            const k = key(cell.x, cell.y);
            return !targetSet.has(k) || occupied.has(k);
          })
        ) {
          continue;
        }
        if (placed.some((cell) => stampAt.get(key(cell.x, cell.y)) !== model.stamp)) {
          continue;
        }
        used[i] = true;
        for (const cell of placed) occupied.add(key(cell.x, cell.y));
        if (search(todo.slice(1))) return true;
        used[i] = false;
        for (const cell of placed) occupied.delete(key(cell.x, cell.y));
      }
    }
    return false;
  }

  const tileable = search([...targetCells]);
  return {
    tileable,
    message: tileable
      ? "静态平铺可行：存在与订单形状、压印完全一致的摆法，但能否进框仍要由推动验证。"
      : "静态平铺即不可行：固定朝向下，非备用托盘无法精确铺出订单形状。",
  };
}

/** 启发式评分：给求解器的“最深状态”排序用。 */
export function goalScore(blueprint: SeamBlueprint, state: SeamLevelState): number {
  let score = 0;
  const inside = state.pieces.filter(
    (piece) =>
      !piece.spare &&
      pieceCells(piece).every((cell) => inFrame(blueprint.frame, cell.x, cell.y)),
  );
  score += inside.length * 10;
  const occ = occupancy(state.pieces);
  for (const target of blueprint.targets) {
    const holder = occ.get(key(target.x, target.y));
    if (holder?.stamp === target.stamp) score += 3;
  }
  score += liveSeams(state.pieces, blueprint.allowedSeams).length * 4;
  return score;
}

export function describePieces(pieces: SeamPiece[]): string {
  return pieces.map((piece) => `${piece.id}@(${piece.x},${piece.y})`).join(" ");
}

import { computed, ref } from "vue";
import type { Dir } from "@/shared/types";
import type { PushStep, SeamLevelState, SeamSolveResult } from "./types";
import { SEAM_LEVELS, getSeamLevel, hydrateSeam } from "../lib/catalog";
import { frameWalls, liveSeams } from "../lib/geometry";
import { applyPush, fixSeam, fixableSeams, unfixSeam } from "../lib/push";
import { checkTiling, evaluateAcceptance } from "../lib/acceptance";
import { solveSeam } from "../lib/solver";

export interface SeamNotice {
  tone: "info" | "success" | "warn";
  message: string;
}

const DIR_TEXT: Record<Dir, string> = { n: "北 ↑", e: "东 →", s: "南 ↓", w: "西 ←" };

export function useSeam() {
  const blueprintId = ref(SEAM_LEVELS[0].id);
  const blueprint = computed(() => getSeamLevel(blueprintId.value));
  const state = ref<SeamLevelState>(hydrateSeam(blueprint.value));
  const selectedId = ref<string>(state.value.pieces[0]?.id ?? "");
  const notice = ref<SeamNotice>({
    tone: "info",
    message: "点选托盘后用方向键或按钮推动；咬住的齿会让托盘整块搬。",
  });
  const solving = ref(false);
  const plan = ref<PushStep[] | null>(null);
  const rejectReason = ref<string | null>(null);

  const walls = computed(() => [
    ...blueprint.value.walls,
    ...frameWalls(blueprint.value.frame),
  ]);
  const tiling = computed(() => checkTiling(blueprint.value));
  const acceptance = computed(() => evaluateAcceptance(blueprint.value, state.value));
  const live = computed(() => liveSeams(state.value.pieces, blueprint.value.allowedSeams));
  const fixable = computed(() => fixableSeams(state.value, blueprint.value.allowedSeams));
  const stepCount = computed(() => state.value.steps.length);

  function selectLevel(id: string): void {
    blueprintId.value = id;
    reset();
    notice.value = {
      tone: "info",
      message: `进入「${blueprint.value.title}」。${blueprint.value.blurb}`,
    };
  }

  function reset(): void {
    state.value = hydrateSeam(blueprint.value);
    selectedId.value = state.value.pieces[0]?.id ?? "";
    plan.value = null;
    rejectReason.value = null;
  }

  function selectPiece(id: string): void {
    selectedId.value = id;
  }

  function push(dir: Dir): void {
    if (!selectedId.value) return;
    const outcome = applyPush(
      state.value,
      blueprint.value.allowedSeams,
      walls.value,
      selectedId.value,
      dir,
    );
    if (!outcome.ok || !outcome.state) {
      notice.value = {
        tone: "warn",
        message:
          outcome.reason === "wall"
            ? "这一推被框壁或边界顶住，整件一格未动。"
            : "这一推被别的托盘挡住，整件一格未动。",
      };
      return;
    }
    state.value = outcome.state;
    plan.value = null;
    const step = outcome.step;
    const movedText = step && step.moved.length > 1
      ? `，随行：${step.moved.join("、")}`
      : "";
    const lockText = step && step.locked.length > 0
      ? `；新咬合：${step.locked.join("、")}`
      : "";
    notice.value = {
      tone: "info",
      message: `推动 ${step?.pieceId ?? selectedId.value} 向${DIR_TEXT[dir]}${movedText}${lockText}`,
    };
    if (acceptance.value.accepted) {
      notice.value = { tone: "success", message: "装箱单签收通过：连成一件，压印与接缝全部相符。" };
    }
  }

  function fix(pair: string): void {
    state.value = fixSeam(state.value, pair);
    notice.value = { tone: "info", message: `已固定接缝 ${pair}，后续求解不会拆开它。` };
  }

  function unfix(pair: string): void {
    state.value = unfixSeam(state.value, pair);
  }

  function runSolver(): void {
    solving.value = true;
    rejectReason.value = null;
    plan.value = null;
    // 让 loading 状态有机会渲染。
    setTimeout(() => {
      const result: SeamSolveResult = solveSeam(
        blueprint.value,
        state.value,
        state.value.fixed,
      );
      solving.value = false;
      if (result.kind === "plan") {
        plan.value = result.steps;
        notice.value = {
          tone: "success",
          message: `找到可由真实推动完成的装配顺序，共 ${result.steps.length} 步，可逐步播放或直接应用。`,
        };
      } else {
        rejectReason.value = result.message;
        notice.value = { tone: "warn", message: result.message };
      }
    }, 30);
  }

  function applyPlan(): void {
    if (!plan.value) return;
    let current = state.value;
    for (const step of plan.value) {
      const outcome = applyPush(
        current,
        blueprint.value.allowedSeams,
        walls.value,
        step.pieceId,
        step.dir,
      );
      if (!outcome.ok || !outcome.state) {
        notice.value = { tone: "warn", message: "方案重放中断：当前状态已被手动改动，请重新求解。" };
        return;
      }
      current = outcome.state;
    }
    state.value = current;
    notice.value = acceptance.value.accepted
      ? { tone: "success", message: "方案已应用，装箱单签收通过。" }
      : { tone: "info", message: "方案已应用。" };
  }

  return {
    blueprintId,
    blueprint,
    state,
    selectedId,
    notice,
    solving,
    plan,
    rejectReason,
    walls,
    tiling,
    acceptance,
    live,
    fixable,
    stepCount,
    selectLevel,
    reset,
    selectPiece,
    push,
    fix,
    unfix,
    runSolver,
    applyPlan,
  };
}

import type { Dir, Vec } from "@/shared/types";

/** 齿口：tab 为凸齿，slot 为凹口；只有 tab/slot 相向才咬得住。plain 为平边。 */
export type EdgeProfile = "tab" | "slot" | "plain";

/** 一片拼缝托盘的静态形状：占格 + 四条边的齿口 + 上方压印。 */
export interface PieceModel {
  id: string;
  label: string;
  /** 占格坐标，以零件自身原点为基准。 */
  cells: Vec[];
  edges: Record<Dir, EdgeProfile>;
  /** 上方压印字符，需要与订单目标格的压印一致。 */
  stamp: string;
  /** 备用拼片：可留在框外，不参与最终签收。 */
  spare: boolean;
}

/** 装配框：三面实墙、一条入口线的凹龛。 */
export interface FrameSpec {
  /** 框内可占格的矩形范围（含边界格）。 */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** 入口所在方向：框在该方向上不设墙，托盘只能从这一侧被推进框。 */
  entry: Dir;
}

/** 订单目标：框内某个格上要求的压印（最终必须由某片托盘的占格盖住）。 */
export interface StampTarget {
  x: number;
  y: number;
  stamp: string;
}

/** 蓝图：散落在地上的托盘 + 装配框 + 订单。 */
export interface SeamBlueprint {
  id: string;
  title: string;
  blurb: string;
  width: number;
  height: number;
  /** 实墙格（框壁与场地边界）。 */
  walls: Vec[];
  frame: FrameSpec;
  pieces: {
    model: PieceModel;
    x: number;
    y: number;
  }[];
  /** 允许的接缝：只有列出的两件托盘才允许在该方向咬合后被签收。 */
  allowedSeams: AllowedSeam[];
  /** 上方压印订单。 */
  targets: StampTarget[];
}

export interface AllowedSeam {
  a: string;
  b: string;
  /** a 相对 b 的方向：a 位于 b 的 dir 侧。 */
  dir: Dir;
}

/** 运行时的一片托盘（位置可变，朝向永不旋转）。 */
export interface SeamPiece extends PieceModel {
  x: number;
  y: number;
}

/** 一次推动的描述。 */
export interface PushStep {
  /** 被推的托盘 id（点击它即推它所在的整件）。 */
  pieceId: string;
  dir: Dir;
  /** 本次真正发生平移的托盘 id（含被内壁带着走的圈中小件）。 */
  moved: string[];
  /** 本次新咬合上的接缝（无序 id 对）。 */
  locked: string[];
}

export interface SeamLevelState {
  blueprintId: string;
  pieces: SeamPiece[];
  /** 已确认（固定）的接缝 id 对，形如 "a|b"。 */
  fixed: string[];
  steps: PushStep[];
}

export interface SeamPlan {
  kind: "plan";
  steps: PushStep[];
  final: SeamLevelState;
}

export interface SeamNoPlan {
  kind: "no-plan";
  /** 搜索终止原因。 */
  reason: "sealed" | "unsat" | "cap";
  message: string;
  /** 搜索中走到的最深状态，便于说明卡在哪。 */
  closest: { state: SeamLevelState; score: number };
}

export type SeamSolveResult = SeamPlan | SeamNoPlan;

export interface TilingResult {
  tileable: boolean;
  message: string;
}

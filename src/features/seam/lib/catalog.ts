import type { Dir, Vec } from "@/shared/types";
import type {
  AllowedSeam,
  EdgeProfile,
  FrameSpec,
  PieceModel,
  SeamBlueprint,
  SeamLevelState,
  SeamPiece,
} from "../model/types";

interface PieceSpec {
  id: string;
  label: string;
  stamp: string;
  rows: string[];
  edges: Record<Dir, EdgeProfile>;
  spare?: boolean;
}

interface BlueprintSpec {
  id: string;
  title: string;
  blurb: string;
  rows: string[];
  targetLayout: string[];
  frame: FrameSpec;
  pieces: (PieceSpec & { at: [number, number] })[];
  allowedSeams: AllowedSeam[];
}

/** 取墙（#）；空格与 '.' 均为可通行地面；外围再补一圈虚拟边界墙。 */
function parseWalls(rows: string[]): { width: number; height: number; walls: Vec[] } {
  const walls: Vec[] = [];
  const height = rows.length;
  const width = rows[0].length;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "#") walls.push({ x, y });
    });
  });
  for (let x = -1; x <= width; x += 1) {
    walls.push({ x, y: -1 });
    walls.push({ x, y: height });
  }
  for (let y = 0; y < height; y += 1) {
    walls.push({ x: -1, y });
    walls.push({ x: width, y });
  }
  return { width, height, walls };
}

function parsePiece(spec: PieceSpec): PieceModel {
  const cells: Vec[] = [];
  spec.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "X") cells.push({ x, y });
    });
  });
  return {
    id: spec.id,
    label: spec.label,
    cells,
    edges: { ...spec.edges },
    stamp: spec.stamp,
    spare: spec.spare ?? false,
  };
}

function buildTargets(spec: BlueprintSpec): { x: number; y: number; stamp: string }[] {
  const stampById = new Map(spec.pieces.map((entry) => [entry.id, entry.stamp]));
  const out: { x: number; y: number; stamp: string }[] = [];
  const { minX, minY } = spec.frame.bounds;
  spec.targetLayout.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      const piece = spec.pieces.find((entry) => entry.id.startsWith(ch));
      out.push({
        x: minX + dx,
        y: minY + dy,
        stamp: piece ? stampById.get(piece.id)! : ch,
      });
    });
  });
  return out;
}

function buildBlueprint(spec: BlueprintSpec): SeamBlueprint {
  const ground = parseWalls(spec.rows);
  return {
    id: spec.id,
    title: spec.title,
    blurb: spec.blurb,
    width: ground.width,
    height: ground.height,
    walls: ground.walls,
    frame: spec.frame,
    pieces: spec.pieces.map((entry) => ({
      model: parsePiece(entry),
      x: entry.at[0],
      y: entry.at[1],
    })),
    allowedSeams: spec.allowedSeams.map((rule) => ({ ...rule })),
    targets: buildTargets(spec),
  };
}

const PLAIN: Record<Dir, EdgeProfile> = { n: "plain", e: "plain", s: "plain", w: "plain" };

const BLUEPRINTS: BlueprintSpec[] = [
  {
    id: "seam-01",
    title: "两齿入门",
    blurb: "三块双格托盘从南口推入框龛，凸齿对凹口咬住后整块搬。先推哪一块决定接缝能否对齐。",
    // 框龛内宽 3（x=3..5），y=1..6；南口敞开，y7..8 为走道。
    rows: [
      "###########",
      "###   #####",
      "###   #####",
      "###   #####",
      "###   #####",
      "###   #####",
      "###   #####",
      "#.........#",
      "#.........#",
      "###########",
    ],
    frame: { bounds: { minX: 3, minY: 1, maxX: 5, maxY: 6 }, entry: "s" },
    targetLayout: ["ABC", "ABC"],
    pieces: [
      {
        id: "A", label: "甲条", stamp: "甲", at: [1, 7],
        rows: ["X", "X"],
        edges: { ...PLAIN, e: "tab" },
      },
      {
        id: "B", label: "乙条", stamp: "乙", at: [4, 7],
        rows: ["X", "X"],
        edges: { ...PLAIN, w: "slot", e: "tab" },
      },
      {
        id: "C", label: "丙条", stamp: "丙", at: [7, 7],
        rows: ["X", "X"],
        edges: { ...PLAIN, w: "slot" },
      },
    ],
    allowedSeams: [
      { a: "A", b: "B", dir: "w" },
      { a: "B", b: "C", dir: "w" },
    ],
  },
  {
    id: "seam-02",
    title: "圈中小件",
    blurb: "四根边梁在框内围出中心格。罩住不等于接上：中心小件只有在被内壁真正顶到的那一推才随行，顶到后凸齿才与梁上凹口咬上。",
    // 框龛内宽 5（x=3..7），y=1..4，订单铺 y1..3、y4 为框内操作行；
    // 南墙 y4 开 x3..7 整口，y5..6 为两行走道。
    rows: [
      "#############",
      "###     #####",
      "###     #####",
      "###     #####",
      "###     #####",
      "#...........#",
      "#...........#",
      "#############",
    ],
    frame: { bounds: { minX: 3, minY: 1, maxY: 4, maxX: 7 }, entry: "s" },
    // 环：北梁/南梁各三格横铺，西柱/东柱各两格竖立于两侧，中心小件一格，共 11 格。
    targetLayout: [
      ".NNN.",
      "W.Z.E",
      "WSSSE",
    ],
    pieces: [
      {
        id: "N", label: "北横梁", stamp: "北", at: [1, 5],
        rows: ["XXX"],
        edges: { ...PLAIN, s: "slot" },
      },
      {
        id: "S", label: "南横梁", stamp: "南", at: [1, 6],
        rows: ["XXX"],
        edges: { ...PLAIN, n: "slot", w: "slot", e: "slot" },
      },
      {
        id: "W", label: "西立柱", stamp: "西", at: [5, 5],
        rows: ["X", "X"],
        edges: { ...PLAIN, e: "tab" },
      },
      {
        id: "E", label: "东立柱", stamp: "东", at: [7, 5],
        rows: ["X", "X"],
        edges: { ...PLAIN, w: "tab" },
      },
      {
        id: "Z", label: "中心小件", stamp: "中", at: [9, 5],
        rows: ["X"],
        edges: { n: "tab", e: "tab", s: "tab", w: "tab" },
      },
    ],
    allowedSeams: [
      { a: "N", b: "Z", dir: "n" },
      { a: "S", b: "Z", dir: "s" },
      { a: "W", b: "Z", dir: "w" },
      { a: "E", b: "Z", dir: "e" },
      { a: "W", b: "S", dir: "w" },
      { a: "E", b: "S", dir: "e" },
    ],
  },
  {
    id: "seam-03",
    title: "备用拼片与封死口",
    blurb: "三片订片各从隔开的入口列推进框，再在框内横移咬合成排；两块备用堵片横在走道上，要先推到两端让路。若在口外把订片咬成宽整件，窄入口便封死。",
    // 内框 x=4..8（五列宽，订单只用中间三列 x5..7）；南墙 y7 只开 x4/x6/x8 三个
    // 互不相邻的窄口（x5、x7 为墙墩）；y8..10 为三行走道。订片各走一条窄口，
    // 北推时彼此间隔一列、绝不内壁连带；入框后再横移咬合成排。
    rows: [
      "#############",
      "####     ####",
      "####     ####",
      "####     ####",
      "####     ####",
      "####     ####",
      "####     ####",
      "#### # # ####",
      "#...........#",
      "#...........#",
      "#...........#",
      "#############",
    ],
    frame: { bounds: { minX: 4, minY: 1, maxX: 8, maxY: 6 }, entry: "s" },
    targetLayout: [".PQR.", ".PQR."],
    pieces: [
      {
        id: "P", label: "左订片", stamp: "订", at: [4, 8],
        rows: ["X", "X"],
        edges: { ...PLAIN, e: "tab" },
      },
      {
        id: "Q", label: "中订片", stamp: "订", at: [6, 8],
        rows: ["X", "X"],
        edges: { ...PLAIN, w: "slot", e: "tab" },
      },
      {
        id: "R", label: "右订片", stamp: "订", at: [8, 8],
        rows: ["X", "X"],
        edges: { ...PLAIN, w: "slot" },
      },
      {
        id: "T", label: "左堵片", stamp: "废", at: [2, 10],
        rows: ["XX"],
        edges: { ...PLAIN },
        spare: true,
      },
      {
        id: "U", label: "右堵片", stamp: "废", at: [9, 10],
        rows: ["XX"],
        edges: { ...PLAIN },
        spare: true,
      },
    ],
    allowedSeams: [
      { a: "P", b: "Q", dir: "w" },
      { a: "Q", b: "R", dir: "w" },
    ],
  },
];

export const SEAM_LEVELS: SeamBlueprint[] = BLUEPRINTS.map(buildBlueprint);

export function getSeamLevel(id: string): SeamBlueprint {
  const found = SEAM_LEVELS.find((level) => level.id === id);
  if (!found) throw new Error(`未知拼缝关卡 ${id}`);
  return found;
}

export function hydrateSeam(blueprint: SeamBlueprint): SeamLevelState {
  const pieces: SeamPiece[] = blueprint.pieces.map((entry) => ({
    ...entry.model,
    cells: entry.model.cells.map((cell) => ({ ...cell })),
    edges: { ...entry.model.edges },
    x: entry.x,
    y: entry.y,
  }));
  return { blueprintId: blueprint.id, pieces, fixed: [], steps: [] };
}

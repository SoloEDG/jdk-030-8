<script setup lang="ts">
import type { Dir } from "@/shared/types";
import type { SeamNotice } from "../model/useSeam";

defineProps<{
  notice: SeamNotice;
  stepCount: number;
  solving: boolean;
  hasPlan: boolean;
  rejectReason: string | null;
  tiling: { tileable: boolean; message: string };
  acceptance: {
    accepted: boolean;
    checks: { id: string; label: string; pass: boolean; detail: string }[];
  };
  live: string[];
  fixable: string[];
  fixed: string[];
}>();
const emit = defineEmits<{
  push: [dir: Dir];
  solve: [];
  apply: [];
  reset: [];
  fix: [pair: string];
  unfix: [pair: string];
}>();
const dirs: { dir: Dir; label: string; cls: string }[] = [
  { dir: "n", label: "↑ 北", cls: "up" },
  { dir: "w", label: "← 西", cls: "left" },
  { dir: "e", label: "东 →", cls: "right" },
  { dir: "s", label: "↓ 南", cls: "down" },
];
</script>

<template>
  <section class="panel seam-panel" aria-label="拼缝控制">
    <h2>推动与求解</h2>
    <p class="hint" :data-tone="notice.tone">{{ notice.message }}</p>

    <div class="dpad">
      <button v-for="item in dirs" :key="item.dir" type="button" :class="item.cls"
        @click="emit('push', item.dir)">
        {{ item.label }}
      </button>
    </div>

    <div class="actions">
      <button type="button" :disabled="solving" @click="emit('solve')">
        {{ solving ? "搜索中…" : "求可进框装配顺序" }}
      </button>
      <button type="button" :disabled="!hasPlan" @click="emit('apply')">应用方案</button>
      <button type="button" @click="emit('reset')">重置</button>
    </div>
    <p class="meta">已推动 {{ stepCount }} 格</p>
    <p v-if="rejectReason" class="reject">{{ rejectReason }}</p>

    <h3>平铺 vs 进框</h3>
    <p class="hint" :data-tone="tiling.tileable ? 'info' : 'warn'">{{ tiling.message }}</p>

    <h3>接缝</h3>
    <ul class="seams">
      <li v-for="pair in live" :key="pair">
        <span>{{ pair.replace("|", " ⨝ ") }}</span>
        <button v-if="fixable.includes(pair)" type="button" @click="emit('fix', pair)">固定</button>
        <button v-else-if="fixed.includes(pair)" type="button" @click="emit('unfix', pair)">取消固定</button>
        <em v-else>已咬合</em>
      </li>
      <li v-if="live.length === 0" class="empty">尚无咬合接缝</li>
    </ul>

    <h3>装箱单签收</h3>
    <ul class="checks">
      <li v-for="check in acceptance.checks" :key="check.id" :class="{ pass: check.pass, fail: !check.pass }">
        <strong>{{ check.pass ? "✓" : "✗" }}</strong>
        <span>{{ check.label }}：{{ check.detail }}</span>
      </li>
    </ul>
    <p class="verdict" :data-ok="acceptance.accepted">
      {{ acceptance.accepted ? "签收通过" : "暂不签收" }}
    </p>
  </section>
</template>

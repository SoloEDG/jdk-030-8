<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { paintSeam, SEAM_TILE } from "../lib/draw";
import type { SeamBlueprint, SeamLevelState } from "../model/types";

const props = defineProps<{
  blueprint: SeamBlueprint;
  state: SeamLevelState;
  selectedId: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();
const canvas = ref<HTMLCanvasElement | null>(null);

function render(): void {
  const el = canvas.value;
  if (!el) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = props.blueprint.width * SEAM_TILE;
  const h = props.blueprint.height * SEAM_TILE;
  el.width = Math.floor(w * dpr);
  el.height = Math.floor(h * dpr);
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const ctx = el.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintSeam(ctx, props.blueprint, props.state, props.selectedId, SEAM_TILE);
}

function onClick(event: MouseEvent): void {
  const el = canvas.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / SEAM_TILE);
  const y = Math.floor((event.clientY - rect.top) / SEAM_TILE);
  const hit = props.state.pieces.find((piece) =>
    piece.cells.some((cell) => piece.x + cell.x === x && piece.y + cell.y === y),
  );
  if (hit) emit("select", hit.id);
}

onMounted(render);
watch(() => [props.state, props.selectedId, props.blueprint], render, { deep: true });
onUnmounted(() => { canvas.value = null; });
</script>

<template>
  <div class="seam-frame">
    <canvas ref="canvas" role="img" :aria-label="`${blueprint.title} 装配框`" @click="onClick" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useSeam } from "../model/useSeam";
import SeamStage from "./SeamStage.vue";
import SeamPanel from "./SeamPanel.vue";
import SeamRail from "./SeamRail.vue";
import type { Dir } from "@/shared/types";

const seam = useSeam();
const KEY: Record<string, Dir> = {
  ArrowUp: "n", ArrowRight: "e", ArrowDown: "s", ArrowLeft: "w",
  w: "n", d: "e", s: "s", a: "w", W: "n", D: "e", S: "s", A: "w",
};

function onKey(event: KeyboardEvent): void {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, select, button")) return;
  const dir = KEY[event.key];
  if (!dir) return;
  event.preventDefault();
  seam.push(dir);
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="seam-shop">
    <header class="seam-head">
      <div class="brand">
        <span class="mark" aria-hidden="true">缝</span>
        <div>
          <h2>{{ seam.blueprint.value.title }}</h2>
          <p>{{ seam.blueprint.value.blurb }}</p>
        </div>
      </div>
    </header>
    <div class="seam-bench">
      <aside class="rail">
        <SeamRail :current-id="seam.blueprintId.value" @select="seam.selectLevel" />
      </aside>
      <main class="stage">
        <SeamStage
          :blueprint="seam.blueprint.value"
          :state="seam.state.value"
          :selected-id="seam.selectedId.value"
          @select="seam.selectPiece"
        />
        <p class="pick">当前托盘：<strong>{{ seam.selectedId.value }}</strong>（点画布选片，方向键/WASD 推动）</p>
      </main>
      <aside class="side">
        <SeamPanel
          :notice="seam.notice.value"
          :step-count="seam.stepCount.value"
          :solving="seam.solving.value"
          :has-plan="seam.plan.value != null"
          :reject-reason="seam.rejectReason.value"
          :tiling="seam.tiling.value"
          :acceptance="seam.acceptance.value"
          :live="seam.live.value"
          :fixable="seam.fixable.value"
          :fixed="seam.state.value.fixed"
          @push="seam.push"
          @solve="seam.runSolver"
          @apply="seam.applyPlan"
          @reset="seam.reset"
          @fix="seam.fix"
          @unfix="seam.unfix"
        />
      </aside>
    </div>
  </div>
</template>

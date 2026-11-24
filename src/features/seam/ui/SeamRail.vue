<script setup lang="ts">
import { SEAM_LEVELS } from "../lib/catalog";

defineProps<{ currentId: string }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <section class="panel voyage" aria-label="拼缝关卡">
    <h2>关卡</h2>
    <ul class="levels">
      <li v-for="level in SEAM_LEVELS" :key="level.id">
        <button type="button" :class="{ current: level.id === currentId }"
          :aria-current="level.id === currentId ? 'true' : undefined"
          @click="emit('select', level.id)">
          <span class="name">{{ level.title }}</span>
        </button>
        <p>{{ level.blurb }}</p>
      </li>
    </ul>
  </section>
</template>

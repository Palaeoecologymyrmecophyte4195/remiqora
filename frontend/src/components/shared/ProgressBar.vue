<script setup lang="ts">
defineProps<{ value: number }>()
</script>

<template>
  <div class="h-2 w-full overflow-hidden rounded-full bg-panel-2">
    <div class="h-full accent-gradient transition-[width] duration-300" :style="{ width: Math.min(100, Math.max(0, value)) + '%' }"></div>
  </div>
</template>

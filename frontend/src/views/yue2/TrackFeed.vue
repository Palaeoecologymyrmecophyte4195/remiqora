<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useYue2Store } from '../../stores/yue2'
import { useDateFilterSort } from '../../composables/useDateFilterSort'
import FilterSortBar from '../../components/shared/FilterSortBar.vue'
import TrackCard from './TrackCard.vue'

const store = useYue2Store()
const { t } = useI18n()

const { sortOrder, dateFrom, dateTo, activePreset, isFiltered, filteredSorted, applyPreset, reset } = useDateFilterSort(() => store.jobs)
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-lg font-semibold text-text">{{ t('feed.yourTracks') }}</h2>

    <FilterSortBar
      v-if="store.jobs.length > 0"
      v-model:sort-order="sortOrder"
      v-model:date-from="dateFrom"
      v-model:date-to="dateTo"
      :is-filtered="isFiltered"
      :visible-count="filteredSorted.length"
      :total-count="store.jobs.length"
      :active-preset="activePreset"
      @preset="applyPreset"
      @reset="reset"
    />

    <!-- Skeleton loaders while history is loading -->
    <template v-if="!store.historyLoaded">
      <div v-for="i in 3" :key="'skel-' + i" class="animate-pulse rounded-xl border border-border bg-panel p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="h-4 w-1/3 rounded bg-panel-2"></div>
          <div class="h-5 w-16 rounded-full bg-panel-2"></div>
        </div>
        <div class="h-3 w-2/3 rounded bg-panel-2"></div>
        <div class="h-10 w-full rounded-lg bg-panel-2"></div>
      </div>
    </template>

    <p v-else-if="store.jobs.length === 0" class="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-dim">{{ t('feed.emptyHint') }}</p>
    <p v-else-if="filteredSorted.length === 0" class="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-dim">{{ t('feed.noneInPeriod') }}</p>
    <TrackCard v-for="job in filteredSorted" :key="job.id" :job="job" />
  </div>
</template>

<script setup>
import { VisDonut, VisSingleContainer } from '@unovis/vue';
import { Donut } from '@unovis/ts';
import { computed, ref } from 'vue';
import { useMounted } from '@vueuse/core';
import { ChartSingleTooltip, defaultColors } from '@/components/ui/chart';
import { cn } from '@/utils/utils';

const props = defineProps({
  data: { type: Array, required: true },
  colors: { type: Array, required: false },
  index: { type: null, required: true },
  margin: { type: null, required: false, default: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
  showLegend: { type: Boolean, required: false, default: true },
  showTooltip: { type: Boolean, required: false, default: true },
  filterOpacity: { type: Number, required: false, default: 0.2 },
  category: { type: String, required: true },
  type: { type: String, required: false, default: 'donut' },
  sortFunction: { type: Function, required: false, default: () => undefined },
  valueFormatter: {
    type: Function,
    required: false,
    default: (tick) => `${tick}`
  },
  customTooltip: { type: null, required: false }
}
);


const category = computed(() => props.category);
const index = computed(() => props.index);

const isMounted = useMounted();
const activeSegmentKey = ref();
const colors = computed(() => props.colors?.length ? props.colors : defaultColors(props.data.filter((d) => d[props.category]).filter(Boolean).length));
const legendItems = computed(() => props.data.map((item, i) => ({
  name: item[props.index],
  color: colors.value[i],
  inactive: false
})));

const totalValue = computed(() => props.data.reduce((prev, curr) => {
  return prev + curr[props.category];
}, 0))
</script>

<template>
  <div :class="cn('w-full h-48 flex flex-col items-end', $attrs.class ?? '')">
    <VisSingleContainer :style="{ height: isMounted ? '100%' : 'auto' }" :margin="{ left: 20, right: 20 }" :data="data">
      <ChartSingleTooltip :selector="Donut.selectors.segment" :index="category" :items="legendItems"
        :value-formatter="valueFormatter" :custom-tooltip="customTooltip" />

      <VisDonut :value="(d) => d[category]" :sort-function="sortFunction" :color="colors"
        :arc-width="type === 'donut' ? 20 : 0" :show-background="false"
        :central-label="type === 'donut' ? valueFormatter(totalValue) : ''" :events="{
          [Donut.selectors.segment]: {
            click: (d, ev, i, elements) => {
              if (d?.data?.[index] === activeSegmentKey) {
                activeSegmentKey = undefined;
                elements.forEach((el) => (el.style.opacity = '1'));
              } else {
                activeSegmentKey = d?.data?.[index];
                elements.forEach(
                  (el) => (el.style.opacity = `${filterOpacity}`),
                );
                elements[i].style.opacity = '1';
              }
            },
          },
        }" />

      <slot />
    </VisSingleContainer>
  </div>
</template>

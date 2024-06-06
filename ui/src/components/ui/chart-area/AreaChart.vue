<script setup>
import { CurveType } from "@unovis/ts";
import { VisArea, VisAxis, VisLine, VisXYContainer } from "@unovis/vue";
import { Area, Axis, Line } from "@unovis/ts";
import { computed, ref } from "vue";
import { useMounted } from "@vueuse/core";
import {
  ChartCrosshair,
  ChartLegend,
  defaultColors,
} from "@/components/ui/chart";
import { cn } from "@/utils/utils";

const props = defineProps({
  data: { type: Array, required: true },
  categories: { type: Array, required: true },
  index: { type: null, required: true },
  colors: { type: Array, required: false },
  margin: {
    type: null,
    required: false,
    default: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  },
  filterOpacity: { type: Number, required: false, default: 0.2 },
  xFormatter: { type: Function, required: false },
  yFormatter: { type: Function, required: false },
  showXAxis: { type: Boolean, required: false, default: true },
  showYAxis: { type: Boolean, required: false, default: true },
  showTooltip: { type: Boolean, required: false, default: true },
  showLegend: { type: Boolean, required: false, default: true },
  showGridLine: { type: Boolean, required: false, default: true },
  customTooltip: { type: null, required: false },
  curveType: { type: String, required: false, default: CurveType.MonotoneX },
  showGradiant: { type: Boolean, required: false, default: true },
});

const emits = defineEmits(["legendItemClick"]);

const index = computed(() => props.index);
const colors = computed(() =>
  props.colors?.length ? props.colors : defaultColors(props.categories.length),
);

const legendItems = ref(
  props.categories.map((category, i) => ({
    name: category,
    color: colors.value[i],
    inactive: false,
  })),
);

const isMounted = useMounted();

function handleLegendItemClick(d, i) {
  emits("legendItemClick", d, i);
}
</script>

<template>
  <div
    :class="cn('w-full h-[400px] flex flex-col items-end', $attrs.class ?? '')"
  >
    <ChartLegend
      v-if="showLegend"
      v-model:items="legendItems"
      @legend-item-click="handleLegendItemClick"
    />

    <VisXYContainer
      :style="{ height: isMounted ? '100%' : 'auto' }"
      :margin="{ left: 20, right: 20 }"
      :data="data"
    >
      <svg width="0" height="0">
        <defs>
          <linearGradient
            v-for="(color, i) in colors"
            :id="`color-${i}`"
            :key="i"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <template v-if="showGradiant">
              <stop offset="5%" :stop-color="color" stop-opacity="0.4" />
              <stop offset="95%" :stop-color="color" stop-opacity="0" />
            </template>
            <template v-else>
              <stop offset="0%" :stop-color="color" />
            </template>
          </linearGradient>
        </defs>
      </svg>

      <ChartCrosshair
        v-if="showTooltip"
        :colors="colors"
        :items="legendItems"
        :index="index"
        :custom-tooltip="customTooltip"
      />

      <template v-for="(category, i) in categories" :key="category">
        <VisArea
          :x="(d, i) => i"
          :y="(d) => d[category]"
          color="auto"
          :curve-type="curveType"
          :attributes="{
            [Area.selectors.area]: {
              fill: `url(#color-${i})`,
            },
          }"
          :opacity="
            legendItems.find((item) => item.name === category)?.inactive
              ? filterOpacity
              : 1
          "
        />
      </template>

      <template v-for="(category, i) in categories" :key="category">
        <VisLine
          :x="(d, i) => i"
          :y="(d) => d[category]"
          :color="colors[i]"
          :curve-type="curveType"
          :attributes="{
            [Line.selectors.line]: {
              opacity: legendItems.find((item) => item.name === category)
                ?.inactive
                ? filterOpacity
                : 1,
            },
          }"
        />
      </template>

      <VisAxis
        v-if="showXAxis"
        type="x"
        :tick-format="xFormatter ?? ((v) => data[v]?.[index])"
        :grid-line="false"
        :tick-line="false"
        tick-text-color="hsl(var(--vis-text-color))"
      />
      <VisAxis
        v-if="showYAxis"
        type="y"
        :tick-line="false"
        :tick-format="yFormatter"
        :domain-line="false"
        :grid-line="showGridLine"
        :attributes="{
          [Axis.selectors.grid]: {
            class: 'text-muted',
          },
        }"
        tick-text-color="hsl(var(--vis-text-color))"
      />

      <slot />
    </VisXYContainer>
  </div>
</template>

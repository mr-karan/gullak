<script setup>
import { computed } from "vue";
import { RangeCalendarGridRow, useForwardProps } from "radix-vue";
import { cn } from "@/utils/utils";

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
});

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <RangeCalendarGridRow
    :class="cn('flex mt-2 w-full', props.class)"
    v-bind="forwardedProps"
  >
    <slot />
  </RangeCalendarGridRow>
</template>

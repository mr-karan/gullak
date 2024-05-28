<script setup>
import { cn } from "@/utils/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <h3
    :class="
      cn('text-2xl font-semibold leading-none tracking-tight', props.class)
    "
  >
    <slot />
  </h3>
</template>

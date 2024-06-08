<template>
    <Popover>
        <PopoverTrigger as-child>
            <Button variant="outline" :class="buttonClass">
                <CalendarIcon class="mr-2 h-4 w-4" />
                {{ displayDate }}
            </Button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-0">
            <Calendar v-model="localValue" initial-focus />
        </PopoverContent>
    </Popover>
</template>

<script setup lang="ts">
import { ref, computed, defineProps, defineEmits } from 'vue';
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { CalendarIcon } from 'lucide-vue-next';
import { cn } from '@/utils/utils';

const props = defineProps({
    modelValue: Date,
    placeholder: String
});

const emit = defineEmits(['update:modelValue']);
const localValue = ref(props.modelValue);

const displayDate = computed(() => localValue.value ? localValue.value.toISOString().split('T')[0] : props.placeholder);
const buttonClass = computed(() => cn('w-[280px] justify-start text-left font-normal', !localValue.value && 'text-muted-foreground'));

localValue.value && emit('update:modelValue', localValue.value);
</script>

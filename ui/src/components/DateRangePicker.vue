<template>
    <Popover>
        <PopoverTrigger as-child>
            <Button variant="outline"
                :class="cn('w-[280px] justify-start text-left font-normal', !range.start && 'text-muted-foreground')">
                <CalendarIcon class="mr-2 h-4 w-4" />
                <template v-if="range.start">
                    <!-- Directly using CalendarDate.toString() to format the display -->
                    {{ range.start.toString() }} - {{ range.end.toString() }}
                </template>
                <template v-else>
                    Pick a date
                </template>
            </Button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-0">
            <RangeCalendar v-model="range" :number-of-months="2" />
        </PopoverContent>
    </Popover>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits } from 'vue';
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import { CalendarIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RangeCalendar } from '@/components/ui/range-calendar';
import { cn } from '@/utils/utils';

const emits = defineEmits(['update:dateRange']);
const props = defineProps({
    modelValue: Object
});

function convertToCalendarDate(date) {
    if (date instanceof Date) {
        return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
    return today(getLocalTimeZone()); // Default to today if the date is invalid
}

const range = ref({
    start: props.modelValue.start ? convertToCalendarDate(new Date(props.modelValue.start)) : today(getLocalTimeZone()),
    end: props.modelValue.end ? convertToCalendarDate(new Date(props.modelValue.end)) : today(getLocalTimeZone()).add({ days: 7 })
});

watch(range, (newValue, oldValue) => {
    if (newValue && newValue.start && newValue.end) {
        console.log("Emitting new date range:", newValue.start.toString(), newValue.end.toString());
        emits('update:dateRange', {
            start: newValue.start.toString(),
            end: newValue.end.toString()
        });
    }
}, { deep: true });
</script>

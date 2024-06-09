<script setup lang="ts">
import { ref, watch, defineProps, defineEmits } from 'vue';
import { DateFormatter, parseDate } from '@internationalized/date';
import TransactionActions from '@/components/Actions.vue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableHead,
  TableCell,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Calendar as CalendarIcon } from 'lucide-vue-next';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/utils';
import { getCategoryColor } from '@/utils/common';

const props = defineProps({
  transactions: {
    type: Array,
    required: true
  },
  showConfirmButton: Boolean,
  onConfirm: Function,
  onSave: Function,
  onDelete: Function,
});

const emit = defineEmits(['edit']);
const localEditingTransaction = ref(null);
const dateFormatter = new DateFormatter('en-US', { dateStyle: 'long' });

// Correctly parse ISO string to CalendarDate
const parseIsoToDate = (isoString) => {
  console.log("Parsing ISO string:", isoString);
  const dateOnlyString = isoString.split('T')[0]; // Take only the date part before the 'T'
  return parseDate(dateOnlyString);
};


watch(() => props.transactions, (newTransactions) => {
  if (localEditingTransaction.value) {
    const updatedTransaction = newTransactions.find(t => t.id === localEditingTransaction.value.id);
    if (updatedTransaction) {
      localEditingTransaction.value = {
        ...updatedTransaction,
        transaction_date: parseIsoToDate(updatedTransaction.transaction_date)
      };
    } else {
      localEditingTransaction.value = null;
    }
  }
}, { deep: true });


const editTransaction = (transaction) => {
  localEditingTransaction.value = {
    ...transaction,
    transaction_date: parseIsoToDate(transaction.transaction_date)
  };
  emit('edit', transaction);
};

const cancelEdit = () => {
  localEditingTransaction.value = null;
};

const confirmTransaction = (transaction) => {
  const transactionToConfirm = localEditingTransaction.value || transaction;
  const isoDate = new Date(transactionToConfirm.transaction_date);
  const formattedDate = isoDate.toISOString().split('T')[0]; // Splits the ISO string by 'T' and takes the first part (date)
  transactionToConfirm.transaction_date = formattedDate;
  props.onConfirm(transactionToConfirm);
  localEditingTransaction.value = null;
};

const deleteTransaction = (transaction) => {
  console.log("deleteTransaction:", transaction);
  props.onDelete(transaction);
};

const saveTransaction = () => {
  if (!localEditingTransaction.value) return;
  localEditingTransaction.value.transaction_date = localEditingTransaction.value.transaction_date.toString();
  props.onSave(localEditingTransaction.value);
  localEditingTransaction.value = null;
};
</script>


<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Date</TableHead>
        <TableHead>Amount</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Description</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="transaction in transactions" :key="transaction.id">
        <TableCell>
          <Popover v-if="localEditingTransaction && localEditingTransaction.id === transaction.id">
            <PopoverTrigger as-child>
              <Button variant="outline"
                :class="cn('w-[280px] justify-start text-left font-normal', !localEditingTransaction.transaction_date && 'text-muted-foreground')">
                <CalendarIcon class="mr-2 h-4 w-4" />
                {{ localEditingTransaction.transaction_date ?
                  dateFormatter.format(new Date(localEditingTransaction.transaction_date.toString())) : 'Pick a date' }}
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0">
              <Calendar v-model="localEditingTransaction.transaction_date" initial-focus />
            </PopoverContent>
          </Popover>
          <span v-else>{{ dateFormatter.format(new Date(transaction.transaction_date.toString())) }}</span>
        </TableCell>
        <TableCell>
          <Input type="number" step="0.01" class="w-3/4"
            v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.amount" />
          <span v-else>{{ transaction.currency }}{{ transaction.amount.toFixed(2) }}</span>
        </TableCell>
        <TableCell>
          <Input class="w-3/4" v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.category" />
          <Badge :class="getCategoryColor(transaction.category)" v-else>{{ transaction.category }}</Badge>
        </TableCell>
        <TableCell>
          <Input class="w-3/4" v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.description" />
          <span v-else>{{ transaction.description }}</span>
        </TableCell>
        <TableCell v-if="showConfirmButton">
          <Button variant="secondary" size="sm" @click="confirmTransaction(localEditingTransaction || transaction)">
            Confirm
          </Button>
        </TableCell>
        <TableCell>
          <TransactionActions :transaction="transaction"
            :is-editing="localEditingTransaction && localEditingTransaction.id === transaction.id"
            @edit="editTransaction" @delete="deleteTransaction" @cancel="cancelEdit" @save="saveTransaction" />
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { formatDate } from '@/utils/utils'
import TransactionActions from '@/components/Actions.vue'
import { Input } from '@/components/ui/input'
import { useTransactionStore } from '@/stores/transactions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getCategoryColor } from '@/utils/utils'
import { Calendar as CalendarIcon } from 'lucide-vue-next'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/utils/utils'
import {
  DateFormatter,
  type DateValue,
  getLocalTimeZone,
  today,
} from '@internationalized/date'

import {
  Table,
  TableBody,
  TableHead,
  TableCell,
  TableHeader,
  TableRow
} from '@/components/ui/table'

const props = defineProps({
  showConfirmButton: {
    type: Boolean,
    default: true
  },
  onConfirm: {
    type: Function,
    default: () => { }
  },
  onSave: {
    type: Function,
    default: () => { }
  }
})

const emit = defineEmits(['edit'])

const transactionStore = useTransactionStore()
const localEditingTransaction = ref(null)
const df = new DateFormatter('en-US', {
  dateStyle: 'long',
})

onMounted(async () => {
  if (props.showConfirmButton) {
    await transactionStore.fetchUnconfirmedTransactions()
  }
})

watch(
  () => transactionStore.transactions,
  () => {
    if (localEditingTransaction.value) {
      const updatedTransaction = transactionStore.transactions.find(
        (t) => t.id === localEditingTransaction.value.id
      )
      if (updatedTransaction) {
        const transactionDate = new Date(updatedTransaction.transaction_date)
        const dateValue = today(getLocalTimeZone())
        dateValue.year = transactionDate.getFullYear()
        dateValue.month = transactionDate.getMonth() + 1
        dateValue.day = transactionDate.getDate()
        localEditingTransaction.value = { ...updatedTransaction, transaction_date: dateValue }
      } else {
        localEditingTransaction.value = null
      }
    }
  },
  { deep: true }
)

const editTransaction = (transaction) => {
  const transactionDate = new Date(transaction.transaction_date)
  const dateValue = today(getLocalTimeZone())
  dateValue.year = transactionDate.getFullYear()
  dateValue.month = transactionDate.getMonth() + 1
  dateValue.day = transactionDate.getDate()
  localEditingTransaction.value = { ...transaction, transaction_date: dateValue }
  emit('edit', transaction)
}

const cancelEdit = () => {
  localEditingTransaction.value = null
}

const confirmTransaction = (transaction) => {
  console.log('Confirming transaction:', transaction);

  // Check if localEditingTransaction is not set, then use the provided transaction
  const transactionToConfirm = localEditingTransaction.value || transaction;

  // Format the transaction_date to YYYY-MM-DD before confirming
  const formattedTransaction = {
    ...transactionToConfirm,
    transaction_date: formatDate(transactionToConfirm.transaction_date.toDate(getLocalTimeZone())),
  };

  props.onConfirm(formattedTransaction);
  localEditingTransaction.value = null;  // Clear the editing state
}

const saveTransaction = () => {
  if (!localEditingTransaction.value) {
    console.error('No transaction is currently being edited.');
    return;
  }

  // Format the transaction_date to YYYY-MM-DD before saving
  const formattedTransaction = {
    ...localEditingTransaction.value,
    transaction_date: formatDate(localEditingTransaction.value.transaction_date.toDate(getLocalTimeZone())),
  };

  props.onSave(formattedTransaction);
  localEditingTransaction.value = null;
}

</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Date</TableHead>
        <TableHead>Amount</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Description</TableHead>
        <TableHead>Mode</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="transaction in transactionStore.transactions" :key="transaction.id">
        <TableCell>
          <Popover v-if="localEditingTransaction && localEditingTransaction.id === transaction.id">
            <PopoverTrigger as-child>
              <Button variant="outline" :class="cn(
                'w-[280px] justify-start text-left font-normal',
                !localEditingTransaction.transaction_date && 'text-muted-foreground',
              )">
                <CalendarIcon class="mr-2 h-4 w-4" />
                {{ localEditingTransaction.transaction_date ?
                  df.format(localEditingTransaction.transaction_date.toDate(getLocalTimeZone())) :
                  "Pick a date" }}
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0">
              <Calendar v-model="localEditingTransaction.transaction_date" initial-focus />
            </PopoverContent>
          </Popover>
          <span v-else>{{ formatDate(transaction.transaction_date) }}</span>
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
          <Badge :class="getCategoryColor(transaction.category)" v-else>
            {{ transaction.category }}
          </Badge>
        </TableCell>
        <TableCell>
          <Input class="w-3/4" v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.description" />
          <span v-else>{{ transaction.description }}</span>
        </TableCell>
        <TableCell>
          <Input class="w-3/4" v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.mode" />
          <span v-else>{{ transaction.mode }}</span>
        </TableCell>
        <TableCell v-if="showConfirmButton">
          <Button variant="secondary" size="sm" @click="confirmTransaction(localEditingTransaction || transaction)">
            Confirm
          </Button>
        </TableCell>
        <TableCell>
          <TransactionActions :transaction="transaction"
            :is-editing="localEditingTransaction && localEditingTransaction.id === transaction.id"
            @edit="editTransaction" @cancel="cancelEdit" @save="saveTransaction" />
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
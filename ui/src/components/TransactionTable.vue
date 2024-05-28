<script setup>
import { ref, watch, onMounted } from 'vue'
import { formatDate } from '@/utils/utils'
import TransactionActions from '@/components/Actions.vue'
import { Input } from '@/components/ui/input'
import { useTransactionStore } from '@/stores/transactions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getCategoryColor } from '@/utils/utils'

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
    default: () => {}
  },
  onSave: {
    type: Function,
    default: () => {}
  }
})

const emit = defineEmits(['edit'])

const transactionStore = useTransactionStore()
const localEditingTransaction = ref(null)

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
        localEditingTransaction.value = { ...updatedTransaction }
      } else {
        localEditingTransaction.value = null
      }
    }
  },
  { deep: true }
)

const editTransaction = (transaction) => {
  localEditingTransaction.value = { ...transaction }
  emit('edit', transaction)
}

const cancelEdit = () => {
  localEditingTransaction.value = null
}

const confirmTransaction = (transaction) => {
  props.onConfirm(transaction)
}

const saveTransaction = (transaction) => {
  props.onSave(transaction)
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
          <span>{{ formatDate(transaction.transaction_date) }}</span>
        </TableCell>
        <TableCell>
          <Input
            type="number"
            step="0.01"
            class="w-3/4"
            v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.amount"
          />
          <span v-else>{{ transaction.currency }}{{ transaction.amount.toFixed(2) }}</span>
        </TableCell>
        <TableCell>
          <Input
            class="w-3/4"
            v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.category"
          />
          <Badge :class="getCategoryColor(transaction.category)" v-else>
            {{ transaction.category }}
          </Badge>
        </TableCell>
        <TableCell>
          <Input
            class="w-3/4"
            v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.description"
          />
          <span v-else>{{ transaction.description }}</span>
        </TableCell>
        <TableCell>
          <Input
            class="w-3/4"
            v-if="localEditingTransaction && localEditingTransaction.id === transaction.id"
            v-model="localEditingTransaction.mode"
          />
          <span v-else>{{ transaction.mode }}</span>
        </TableCell>
        <TableCell v-if="showConfirmButton">
          <Button
            variant="secondary"
            size="sm"
            @click="confirmTransaction(localEditingTransaction || transaction)"
          >
            Confirm
          </Button>
        </TableCell>
        <TableCell>
          <TransactionActions
            :transaction="transaction"
            :is-editing="localEditingTransaction && localEditingTransaction.id === transaction.id"
            @edit="editTransaction"
            @cancel="cancelEdit"
            @save="saveTransaction"
          />
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>

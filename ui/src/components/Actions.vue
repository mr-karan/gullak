<script setup>
import { MoreHorizontal, Edit, Trash, X, Save } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTransactionStore } from '@/stores/transactions'
import { useToast } from 'vue-toastification'

const props = defineProps({
  transaction: {
    type: Object,
    required: true
  },
  isEditing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['edit', 'cancel', 'save'])

const transactionStore = useTransactionStore()
const toast = useToast()

const editTransaction = () => {
  emit('edit', props.transaction)
}

const saveTransaction = () => {
  emit('save', props.transaction)
}

const deleteTransactionHandler = async () => {
  try {
    await transactionStore.deleteTransaction(props.transaction.id)
    toast.success('Transaction deleted!')
  } catch (error) {
    toast.error('Error deleting transaction: ' + error.message)
  }
}

const cancelEdit = () => {
  emit('cancel')
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger>
      <MoreHorizontal class="h-5 w-5 text-gray-500 hover:text-gray-700 cursor-pointer" />
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem @click="editTransaction" v-if="!isEditing">
        <Edit class="mr-2 h-4 w-4" />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem @click="cancelEdit" v-else>
        <X class="mr-2 h-4 w-4" />
        Cancel
      </DropdownMenuItem>
      <DropdownMenuItem @click="saveTransaction" v-if="isEditing">
        <Save class="mr-2 h-4 w-4" />
        Save
      </DropdownMenuItem>
      <DropdownMenuItem @click="deleteTransactionHandler">
        <Trash class="mr-2 h-4 w-4" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

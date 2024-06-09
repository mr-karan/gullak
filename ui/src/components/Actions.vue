<script setup>
import { MoreHorizontal, Edit, Trash, X, Save } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

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

const emit = defineEmits(['edit', 'cancel', 'save', 'delete'])

const editTransaction = () => {
  emit('edit', props.transaction)
}

const saveTransaction = () => {
  emit('save', props.transaction)
}

const deleteTransaction = () => {
  emit('delete', props.transaction)
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
      <DropdownMenuItem @click="deleteTransaction">
        <Trash class="mr-2 h-4 w-4" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

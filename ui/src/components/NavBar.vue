<script setup>
import { PiggyBank, Menu } from 'lucide-vue-next'
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
</script>

<template>
  <nav class="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 sticky top-0">
    <!-- Desktop Navigation -->
    <div
      class="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
      <a href="#" class="flex items-center gap-2 text-lg font-semibold md:text-base">
        <PiggyBank class="h-6 w-6" />
        <span>
          <router-link to="/">Gullak</router-link>
        </span>
      </a>
      <router-link class="text-gray-700 transition-colors hover:text-gray-900 hover:bg-gray-100 p-2 rounded"
        to="/transactions">Transactions
      </router-link>
    </div>

    <!-- Mobile Navigation Trigger -->
    <Sheet>
      <SheetTrigger as-child>
        <Button variant="outline" size="icon" class="shrink-0 md:hidden">
          <Menu class="h-5 w-5" />
          <span class="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <nav class="grid gap-6 text-lg font-medium">
          <a href="#" class="flex items-center gap-2 text-lg font-semibold">
            <PiggyBank class="h-6 w-6" />
            <span>
              <router-link to="/">Gullak</router-link>
            </span>
          </a>
          <router-link class="text-gray-700 transition-colors hover:text-gray-900" to="/transactions">Transactions
          </router-link>
        </nav>
      </SheetContent>
    </Sheet>
  </nav>
</template>

<script setup lang="ts">
import { Package2, Menu } from 'lucide-vue-next'
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
</script>

<template>
  <nav class="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 sticky top-0">
    <!-- Desktop Navigation -->
    <div
      class="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
      <a href="#" class="flex items-center gap-2 text-lg font-semibold md:text-base">
        <Package2 class="h-6 w-6" />
        <span class="sr-only">Acme Inc</span>
      </a>
      <a href="#" class="text-foreground transition-colors hover:text-foreground">Dashboard</a>
      <a href="#" class="text-muted-foreground transition-colors hover:text-foreground">Orders</a>
      <a href="#" class="text-muted-foreground transition-colors hover:text-foreground">Products</a>
      <a href="#" class="text-muted-foreground transition-colors hover:text-foreground">Customers</a>
      <a href="#" class="text-muted-foreground transition-colors hover:text-foreground">Analytics</a>
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
            <Package2 class="h-6 w-6" />
            <span class="sr-only">Acme Inc</span>
          </a>
          <a href="#" class="hover:text-foreground">Dashboard</a>
          <a href="#" class="text-muted-foreground hover:text-foreground">Orders</a>
          <a href="#" class="text-muted-foreground hover:text-foreground">Products</a>
          <a href="#" class="text-muted-foreground hover:text-foreground">Customers</a>
          <a href="#" class="text-muted-foreground hover:text-foreground">Analytics</a>
        </nav>
      </SheetContent>
    </Sheet>
  </nav>
</template>

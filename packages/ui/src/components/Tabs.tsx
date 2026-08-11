import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/cn.js';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex items-center gap-1 rounded-(--radius-md) bg-(--color-muted-subtle) p-1', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'rounded-(--radius-sm) px-3 py-1.5 text-(--text-sm) font-medium text-(--color-muted)',
      'data-[state=active]:bg-(--color-surface) data-[state=active]:text-(--color-text) data-[state=active]:shadow-(--shadow-sm)',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

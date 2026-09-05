import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
}

/** Select accesible sobre Radix: navegación por teclado y `Escape` para cerrar vienen incluidos. */
export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Seleccioná una opción',
  disabled,
  invalid,
  name,
  id,
  ...aria
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          'flex h-(--control-height-md) w-full items-center justify-between gap-2 rounded-(--radius-md) border bg-(--color-surface) px-3',
          'text-(length:--text-base) text-(--color-text) disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
          invalid ? 'border-(--color-danger)' : 'border-(--color-border-strong)',
        )}
        {...aria}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-(--color-muted)" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 overflow-hidden rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-lg)"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1">
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-(--radius-sm) py-1.5 pl-7 pr-2 text-(length:--text-base) text-(--color-text) outline-none',
                  'data-[highlighted]:bg-(--color-primary-subtle) data-[highlighted]:text-(--color-primary-subtle-foreground)',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                )}
              >
                <span className="absolute left-2 inline-flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1">
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

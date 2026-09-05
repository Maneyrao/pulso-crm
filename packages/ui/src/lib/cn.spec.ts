import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('preserva color y tamaño del token en ambos órdenes, incluidos consumidores anteriores', () => {
    for (const size of ['text-(length:--text-sm)', 'text-(--text-sm)']) {
      const color = 'text-(--color-primary-foreground)';
      expect(cn(color, size).split(' ')).toEqual([color, size]);
      expect(cn(size, color).split(' ')).toEqual([size, color]);
      expect(cn(color, size, 'text-(length:--text-lg)')).toBe(`${color} text-(length:--text-lg)`);
    }
  });
  it('concatena clases estáticas', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('descarta valores falsy', () => {
    const showB = false;
    expect(cn('a', showB && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('resuelve conflictos de utilidades de Tailwind a favor de la última', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('permite que un className externo pise el de un componente', () => {
    expect(cn('text-sm text-muted', 'text-lg')).toBe('text-muted text-lg');
  });
});

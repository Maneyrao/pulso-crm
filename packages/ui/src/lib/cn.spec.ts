import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
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

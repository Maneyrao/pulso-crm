import { render, screen } from '@testing-library/react';
import { formatMoney } from '@pulso/config/money';
import { describe, expect, it } from 'vitest';
import { MoneyDisplay } from './MoneyDisplay.js';

// Intl.NumberFormat en es-AR separa el símbolo del monto con un espacio
// irrompible (U+00A0), que el normalizador por defecto de Testing Library
// no aplica al string de búsqueda (sólo al texto ya renderizado). Se
// desactiva el normalizador para comparar el texto tal cual lo devuelve
// `formatMoney` en ambos lados.
const exact = { normalizer: (text: string) => text };

describe('MoneyDisplay', () => {
  it('formatea el importe usando el helper compartido de @pulso/config', () => {
    render(<MoneyDisplay value="1234.50" />);
    expect(screen.getByText(formatMoney('1234.50'), exact)).toBeInTheDocument();
  });

  it('respeta la currency y locale pasadas', () => {
    render(<MoneyDisplay value="10.00" currency="USD" locale="en-US" />);
    expect(
      screen.getByText(formatMoney('10.00', { currency: 'USD', locale: 'en-US' }), exact),
    ).toBeInTheDocument();
  });

  it('nunca convierte el importe a number en las props que recibe: acepta strings con 12 dígitos sin truncar', () => {
    render(<MoneyDisplay value="999999999999.99" />);
    expect(screen.getByText(formatMoney('999999999999.99'), exact)).toBeInTheDocument();
  });

  it('resalta importes negativos cuando se pide explícitamente', () => {
    render(<MoneyDisplay value="-50.00" emphasizeNegative />);
    const el = screen.getByText(formatMoney('-50.00'), exact);
    expect(el.className).toContain('color-danger');
  });
});

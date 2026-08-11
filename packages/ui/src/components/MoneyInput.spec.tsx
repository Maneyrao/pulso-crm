import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput.js';

function ControlledMoneyInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return <MoneyInput aria-label="Importe" value={value} onChange={setValue} />;
}

describe('MoneyInput', () => {
  it('renderiza el valor recibido como texto plano (string)', () => {
    render(<MoneyInput aria-label="Importe" value="1234.50" onChange={() => {}} />);
    const input = screen.getByLabelText('Importe') as HTMLInputElement;
    expect(input.value).toBe('1234.50');
    expect(typeof input.value).toBe('string');
  });

  it('onChange siempre recibe un string, nunca un number', async () => {
    const values: unknown[] = [];
    function Wrapper() {
      const [value, setValue] = React.useState('');
      return (
        <MoneyInput
          aria-label="Importe"
          value={value}
          onChange={(next) => {
            values.push(next);
            setValue(next);
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.type(screen.getByLabelText('Importe'), '12.5');
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(typeof v).toBe('string');
    }
  });

  it('no pierde precisión con importes grandes (no pasa por number/float)', async () => {
    const user = userEvent.setup();
    render(<ControlledMoneyInput />);
    const input = screen.getByLabelText('Importe') as HTMLInputElement;
    // 12 dígitos enteros: Number(...) en punto flotante ya empieza a perder
    // precisión en este rango. Como el componente nunca convierte a number,
    // el string debe llegar intacto.
    await user.type(input, '999999999999.99');
    expect(input.value).toBe('999999999999.99');
  });

  it('rechaza letras y otros caracteres inválidos', async () => {
    const user = userEvent.setup();
    render(<ControlledMoneyInput />);
    const input = screen.getByLabelText('Importe') as HTMLInputElement;
    await user.type(input, 'abc');
    expect(input.value).toBe('');
  });

  it('rechaza un segundo punto decimal', async () => {
    const user = userEvent.setup();
    render(<ControlledMoneyInput initial="12.5" />);
    const input = screen.getByLabelText('Importe') as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
    await user.type(input, '.');
    expect(input.value).toBe('12.5');
  });

  it('rechaza más de dos decimales', async () => {
    const user = userEvent.setup();
    render(<ControlledMoneyInput initial="12." />);
    const input = screen.getByLabelText('Importe') as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
    await user.type(input, '999');
    expect(input.value).toBe('12.99');
  });

  it('normaliza a dos decimales al perder el foco', async () => {
    const user = userEvent.setup();
    render(<ControlledMoneyInput initial="5" />);
    const input = screen.getByLabelText('Importe') as HTMLInputElement;
    await user.click(input);
    await user.tab();
    expect(input.value).toBe('5.00');
  });

  it('permite un importe vacío sin forzar un valor', () => {
    render(<MoneyInput aria-label="Importe" value="" onChange={() => {}} />);
    expect((screen.getByLabelText('Importe') as HTMLInputElement).value).toBe('');
  });
});

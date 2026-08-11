import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../lib/expectNoAxeViolations.js';
import { FormField } from './FormField.js';
import { Input } from './Input.js';

describe('FormField', () => {
  it('asocia el label con el control vía id/htmlFor', () => {
    render(
      <FormField label="Nombre">{(field) => <Input {...field} />}</FormField>,
    );
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('cablea aria-describedby al hint cuando no hay error', () => {
    render(
      <FormField label="Documento" hint="Sin puntos ni guiones">
        {(field) => <Input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Documento');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('Sin puntos ni guiones')).toHaveAttribute('id', describedBy);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('cablea aria-describedby y aria-invalid al error', () => {
    render(
      <FormField label="Email" error="Formato inválido">
        {(field) => <Input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorNode = screen.getByRole('alert');
    expect(errorNode).toHaveAttribute('id', describedBy);
    expect(errorNode).toHaveTextContent('Formato inválido');
  });

  it('incluye tanto hint como error en aria-describedby cuando ambos están presentes', () => {
    render(
      <FormField label="Teléfono" hint="Formato +54 9 11..." error="Requerido">
        {(field) => <Input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Teléfono');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ');
    expect(ids).toHaveLength(2);
  });

  it('no marca aria-invalid cuando no hay error', () => {
    render(<FormField label="Apellido">{(field) => <Input {...field} />}</FormField>);
    expect(screen.getByLabelText('Apellido')).not.toHaveAttribute('aria-invalid');
  });

  it('no tiene violaciones de accesibilidad detectables (axe)', async () => {
    const { container } = render(
      <FormField label="Documento" hint="Sin puntos ni guiones" error="Requerido" required>
        {(field) => <Input {...field} />}
      </FormField>,
    );
    const results = await axe(container);
    expectNoAxeViolations(results);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConsentConfirmationDialog } from './ConsentConfirmationDialog';

describe('ConsentConfirmationDialog', () => {
  it('explica la trazabilidad antes de registrar el consentimiento', () => {
    const onConfirm = vi.fn();
    render(
      <ConsentConfirmationDialog
        open={true}
        onOpenChange={vi.fn()}
        memberName="Ada Lovelace"
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Confirmar consentimiento biométrico' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/usuario responsable, la fecha y la versión del consentimiento/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar consentimiento' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

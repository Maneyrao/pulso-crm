import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Asistente IA (demo, sin backend real). Sin `PermissionGate`, igual que en
 * `nav-items.ts`. Cubre chips de preguntas sugeridas, matching por palabra
 * clave en texto libre y la respuesta de último recurso.
 */

const FIND_TIMEOUT = 2000;

/**
 * Las respuestas canned citan importes formateados con `Intl.NumberFormat`
 * (`es-AR`), que intercala un espacio no separable. El normalizador por
 * defecto de Testing Library sólo colapsa esos espacios del lado del DOM, no
 * del texto buscado, así que hay que igualarlos a mano antes de comparar.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

describe('AiPage', () => {
  it('muestra el subtítulo, el alert de demo y las preguntas sugeridas', async () => {
    const { default: AiPage } = await import('./page');
    const { getInsightsDemoDataset } = await import('@/lib/mock/data/insights-demo');
    const dataset = getInsightsDemoDataset();
    render(<AiPage />);

    expect(screen.getByText('Consultá los datos de tu gimnasio en lenguaje natural.')).toBeInTheDocument();
    expect(screen.getByText('Demo sin IA real')).toBeInTheDocument();

    for (const question of dataset.suggestedQuestions) {
      expect(screen.getByRole('button', { name: question.question })).toBeInTheDocument();
    }
  });

  it('al clickear una pregunta sugerida responde con la respuesta canned tras un delay', async () => {
    const { default: AiPage } = await import('./page');
    const { getInsightsDemoDataset } = await import('@/lib/mock/data/insights-demo');
    const dataset = getInsightsDemoDataset();
    const question = dataset.suggestedQuestions[0]!;
    render(<AiPage />);

    fireEvent.click(screen.getByRole('button', { name: question.question }));

    // El mensaje del usuario aparece inmediatamente.
    expect(screen.getAllByText(question.question).length).toBeGreaterThan(0);

    expect(await screen.findByText(flat(question.answer), {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
  });

  it('texto libre que matchea una palabra clave responde con la respuesta canned correspondiente', async () => {
    const { default: AiPage } = await import('./page');
    const { getInsightsDemoDataset } = await import('@/lib/mock/data/insights-demo');
    const dataset = getInsightsDemoDataset();
    const incomeQuestion = dataset.suggestedQuestions.find((q) => q.id === 'income')!;
    render(<AiPage />);

    const input = screen.getByLabelText('Escribí tu pregunta');
    fireEvent.change(input, { target: { value: '¿cómo vienen los ingresos del mes?' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/i }));

    expect(await screen.findByText(flat(incomeQuestion.answer), {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
  });

  it('texto libre sin match responde con el mensaje de último recurso', async () => {
    const { default: AiPage } = await import('./page');
    render(<AiPage />);

    const input = screen.getByLabelText('Escribí tu pregunta');
    fireEvent.change(input, { target: { value: 'contame un chiste' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/i }));

    expect(
      await screen.findByText(
        'En la demo puedo responder las preguntas sugeridas. El asistente completo llega con el backend de reportes.',
        {},
        { timeout: FIND_TIMEOUT },
      ),
    ).toBeInTheDocument();
  });

  it('el botón de enviar está deshabilitado sin texto', async () => {
    const { default: AiPage } = await import('./page');
    render(<AiPage />);
    expect(screen.getByRole('button', { name: /Enviar mensaje/i })).toBeDisabled();
  });
});

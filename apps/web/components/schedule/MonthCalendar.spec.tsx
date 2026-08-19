import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MonthCalendar } from './MonthCalendar';

/**
 * Calendario mensual propio (sin dependencias nuevas). Cubre navegación,
 * badges de reservas/excepciones, selección de día, atenuado de días de otro
 * mes y el resaltado de "hoy" con anillo primario.
 */

describe('MonthCalendar', () => {
  it('muestra el título del mes en español (ej. "agosto 2026")', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 15)}
        onMonthChange={vi.fn()}
        reservationsByDay={{}}
        exceptionsByDay={{}}
      />,
    );
    expect(screen.getByText('agosto 2026')).toBeInTheDocument();
  });

  it('muestra los encabezados de la semana Lun a Dom', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 15)}
        onMonthChange={vi.fn()}
        reservationsByDay={{}}
        exceptionsByDay={{}}
      />,
    );
    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent);
    expect(headers).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
  });

  it('muestra el badge de reservas con aria-label completo', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 1)}
        onMonthChange={vi.fn()}
        reservationsByDay={{ '2026-08-15': 4 }}
        exceptionsByDay={{}}
      />,
    );
    const cell = screen.getByRole('gridcell', { name: '15 de agosto, 4 reservas' });
    expect(cell).toBeInTheDocument();
    expect(screen.getByText('4 reservas')).toBeInTheDocument();
  });

  it('usa singular cuando hay una sola reserva', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 1)}
        onMonthChange={vi.fn()}
        reservationsByDay={{ '2026-08-15': 1 }}
        exceptionsByDay={{}}
      />,
    );
    expect(screen.getByRole('gridcell', { name: '15 de agosto, 1 reserva' })).toBeInTheDocument();
  });

  it('muestra el badge de excepción (tono warning) con aria-label completo', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 1)}
        onMonthChange={vi.fn()}
        reservationsByDay={{}}
        exceptionsByDay={{ '2026-08-17': 'Feriado' }}
      />,
    );
    const cell = screen.getByRole('gridcell', { name: '17 de agosto, Feriado' });
    expect(cell).toBeInTheDocument();
    expect(screen.getByText('Feriado')).toBeInTheDocument();
  });

  it('combina reservas y excepción en el mismo aria-label', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 1)}
        onMonthChange={vi.fn()}
        reservationsByDay={{ '2026-08-15': 4 }}
        exceptionsByDay={{ '2026-08-15': 'Horario reducido' }}
      />,
    );
    expect(
      screen.getByRole('gridcell', { name: '15 de agosto, 4 reservas, Horario reducido' }),
    ).toBeInTheDocument();
  });

  it('atenúa los días que pertenecen a otro mes', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 7, 15)}
        onMonthChange={vi.fn()}
        reservationsByDay={{}}
        exceptionsByDay={{}}
      />,
    );
    // Agosto 2026 empieza en sábado; con semana Lun→Dom, la grilla arranca el
    // lunes 27 de julio (mes anterior).
    const outOfMonthCell = screen.getByRole('gridcell', { name: '27 de julio' });
    expect(outOfMonthCell.className).toMatch(/opacity-50/);
  });

  it('resalta el día de hoy con anillo primario', () => {
    const today = new Date();
    render(
      <MonthCalendar
        month={today}
        onMonthChange={vi.fn()}
        reservationsByDay={{}}
        exceptionsByDay={{}}
      />,
    );
    const label = format(today, "d 'de' MMMM", { locale: es });
    const cell = screen.getByRole('gridcell', { name: label });
    expect(cell.className).toMatch(/ring-2/);
  });

  it('al hacer click en un día llama a onSelectDay y lo marca como seleccionado', () => {
    const onSelectDay = vi.fn();
    render(
      <MonthCalendar
        month={new Date(2026, 7, 1)}
        onMonthChange={vi.fn()}
        reservationsByDay={{}}
        exceptionsByDay={{}}
        onSelectDay={onSelectDay}
      />,
    );
    const cell = screen.getByRole('gridcell', { name: '10 de agosto' });
    fireEvent.click(cell);

    expect(onSelectDay).toHaveBeenCalledTimes(1);
    const calledDay = onSelectDay.mock.calls[0]?.[0] as Date;
    expect(format(calledDay, 'yyyy-MM-dd')).toBe('2026-08-10');
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    expect(cell.className).toMatch(/bg-\(--color-primary-subtle\)/);
  });

  it('la navegación de mes llama a onMonthChange con el mes anterior/siguiente', () => {
    const onMonthChange = vi.fn();
    render(
      <MonthCalendar
        month={new Date(2026, 7, 15)}
        onMonthChange={onMonthChange}
        reservationsByDay={{}}
        exceptionsByDay={{}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(format(onMonthChange.mock.calls[0]?.[0] as Date, 'yyyy-MM')).toBe('2026-09');

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(format(onMonthChange.mock.calls[1]?.[0] as Date, 'yyyy-MM')).toBe('2026-07');
  });
});

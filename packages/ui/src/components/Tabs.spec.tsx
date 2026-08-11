import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs.js';

function DemoTabs() {
  return (
    <Tabs defaultValue="resumen">
      <TabsList>
        <TabsTrigger value="resumen">Resumen</TabsTrigger>
        <TabsTrigger value="membresias">Membresías</TabsTrigger>
        <TabsTrigger value="asistencias">Asistencias</TabsTrigger>
      </TabsList>
      <TabsContent value="resumen">Contenido resumen</TabsContent>
      <TabsContent value="membresias">Contenido membresías</TabsContent>
      <TabsContent value="asistencias">Contenido asistencias</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('activa la primera pestaña por defecto', () => {
    render(<DemoTabs />);
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Contenido resumen')).toBeInTheDocument();
  });

  it('cambia de pestaña al hacer click', async () => {
    const user = userEvent.setup();
    render(<DemoTabs />);
    await user.click(screen.getByRole('tab', { name: 'Membresías' }));
    expect(screen.getByRole('tab', { name: 'Membresías' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Contenido membresías')).toBeInTheDocument();
  });

  it('navega con las flechas del teclado y activa la pestaña enfocada', async () => {
    const user = userEvent.setup();
    render(<DemoTabs />);
    screen.getByRole('tab', { name: 'Resumen' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Membresías' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Membresías' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft desde la primera pestaña vuelve (wrap) a la última', async () => {
    const user = userEvent.setup();
    render(<DemoTabs />);
    screen.getByRole('tab', { name: 'Resumen' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Asistencias' })).toHaveFocus();
  });
});

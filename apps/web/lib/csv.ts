/**
 * Generación y descarga de CSV en el cliente. Con BOM UTF-8 para que Excel
 * (el destino real de estos exports en un gimnasio) abra acentos y eñes bien.
 */

function escapeCell(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  // Separador `;`: Excel en configuración regional es-AR usa coma decimal,
  // así que la coma como separador rompería los montos.
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

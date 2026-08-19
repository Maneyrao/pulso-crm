/**
 * Transición de ruta: fade + translate de 8px (160ms). El template se
 * remonta en cada navegación, lo que reinicia la animación. Con
 * `prefers-reduced-motion` la animación se anula globalmente (tokens.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-(--animate-page-in)">{children}</div>;
}

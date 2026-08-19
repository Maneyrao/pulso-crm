/**
 * Dataset determinista de demo para los módulos de comercio: Productos
 * (POS), Factura electrónica y Fidelización (puntos). Sin backend todavía
 * (docs/CONTROLFIT_PARITY_AUDIT.md §2) — estas páginas usan `useMockData`.
 *
 * Nada de `Math.random()` ni `new Date()`: todo el dataset es literal para
 * no romper snapshots/tests ni la hidratación.
 */
import { multiplyMoneyByInt, sumMoney } from '@pulso/config/money';

// ─────────────────────────────────────────────────────────────────────────
// Productos
// ─────────────────────────────────────────────────────────────────────────

export type ProductCategory = 'Bebidas' | 'Suplementos' | 'Accesorios' | 'Indumentaria';
export type ProductStatus = 'Activo' | 'Inactivo';

export interface DemoProduct {
  id: string;
  name: string;
  category: ProductCategory;
  /** Importe como string decimal (ADR-010). Nunca `number`. */
  price: string;
  stock: number;
  status: ProductStatus;
}

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { id: 'prod-01', name: 'Agua mineral 500ml', category: 'Bebidas', price: '1500.00', stock: 120, status: 'Activo' },
  { id: 'prod-02', name: 'Bebida isotónica 500ml', category: 'Bebidas', price: '2200.00', stock: 60, status: 'Activo' },
  { id: 'prod-03', name: 'Gaseosa light 350ml', category: 'Bebidas', price: '1800.00', stock: 4, status: 'Activo' },
  { id: 'prod-04', name: 'Proteína whey 1kg', category: 'Suplementos', price: '45000.00', stock: 8, status: 'Activo' },
  { id: 'prod-05', name: 'Proteína vegana 1kg', category: 'Suplementos', price: '52000.00', stock: 3, status: 'Activo' },
  { id: 'prod-06', name: 'Creatina monohidrato 300g', category: 'Suplementos', price: '28000.00', stock: 15, status: 'Activo' },
  { id: 'prod-07', name: 'BCAA 200 cápsulas', category: 'Suplementos', price: '32000.00', stock: 2, status: 'Activo' },
  { id: 'prod-08', name: 'Barrita proteica', category: 'Suplementos', price: '2500.00', stock: 200, status: 'Activo' },
  { id: 'prod-09', name: 'Barrita de cereal', category: 'Suplementos', price: '1900.00', stock: 90, status: 'Activo' },
  { id: 'prod-10', name: 'Toalla deportiva', category: 'Accesorios', price: '8500.00', stock: 25, status: 'Activo' },
  { id: 'prod-11', name: 'Guantes de entrenamiento', category: 'Accesorios', price: '12000.00', stock: 0, status: 'Inactivo' },
  { id: 'prod-12', name: 'Cinturón de levantamiento', category: 'Accesorios', price: '35000.00', stock: 6, status: 'Activo' },
  { id: 'prod-13', name: 'Shaker 700ml', category: 'Accesorios', price: '6500.00', stock: 40, status: 'Activo' },
  { id: 'prod-14', name: 'Remera Pulso Gym', category: 'Indumentaria', price: '15000.00', stock: 18, status: 'Activo' },
  { id: 'prod-15', name: 'Buzo Pulso Gym', category: 'Indumentaria', price: '32000.00', stock: 1, status: 'Activo' },
];

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'Bebidas',
  'Suplementos',
  'Accesorios',
  'Indumentaria',
];

/** Cantidad de productos con `status === 'Activo'`. */
export const activeProductsCount = (): number =>
  DEMO_PRODUCTS.filter((p) => p.status === 'Activo').length;

/** Cantidad de productos con stock en cero. */
export const outOfStockCount = (): number => DEMO_PRODUCTS.filter((p) => p.stock === 0).length;

/** Valor total del inventario (precio × stock, sumado). */
export const inventoryValue = (): string =>
  sumMoney(DEMO_PRODUCTS.map((p) => multiplyMoneyByInt(p.price, p.stock)));

// ─────────────────────────────────────────────────────────────────────────
// Factura electrónica
// ─────────────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'Emitida' | 'Pendiente' | 'Rechazada';

export interface DemoInvoice {
  id: string;
  number: string;
  date: string;
  memberName: string;
  concept: string;
  amount: string;
  status: InvoiceStatus;
}

export const DEMO_INVOICES: readonly DemoInvoice[] = [
  { id: 'inv-01', number: 'B-0001-00001234', date: '2026-08-01', memberName: 'García, Bruno', concept: 'Cuota mensual', amount: '25000.00', status: 'Emitida' },
  { id: 'inv-02', number: 'B-0001-00001235', date: '2026-08-02', memberName: 'Fernández, Lucía', concept: 'Cuota trimestral', amount: '65000.00', status: 'Emitida' },
  { id: 'inv-03', number: 'B-0001-00001236', date: '2026-08-03', memberName: 'Gómez, Martín', concept: 'Venta de productos', amount: '8500.00', status: 'Emitida' },
  { id: 'inv-04', number: 'B-0001-00001237', date: '2026-08-04', memberName: 'Rodríguez, Sofía', concept: 'Cuota mensual', amount: '25000.00', status: 'Pendiente' },
  { id: 'inv-05', number: 'B-0001-00001238', date: '2026-08-05', memberName: 'López, Nicolás', concept: 'Matrícula', amount: '15000.00', status: 'Emitida' },
  { id: 'inv-06', number: 'B-0001-00001239', date: '2026-08-06', memberName: 'Díaz, Valentina', concept: 'Cuota mensual', amount: '25000.00', status: 'Rechazada' },
  { id: 'inv-07', number: 'B-0001-00001240', date: '2026-08-07', memberName: 'Martínez, Tomás', concept: 'Venta de productos', amount: '4200.00', status: 'Emitida' },
  { id: 'inv-08', number: 'B-0001-00001241', date: '2026-08-08', memberName: 'Sánchez, Camila', concept: 'Cuota anual', amount: '240000.00', status: 'Emitida' },
  { id: 'inv-09', number: 'B-0001-00001242', date: '2026-08-09', memberName: 'Pérez, Agustín', concept: 'Cuota mensual', amount: '25000.00', status: 'Pendiente' },
  { id: 'inv-10', number: 'B-0001-00001243', date: '2026-08-10', memberName: 'Romero, Julieta', concept: 'Clase suelta', amount: '3500.00', status: 'Emitida' },
  { id: 'inv-11', number: 'B-0001-00001244', date: '2026-08-11', memberName: 'Torres, Franco', concept: 'Cuota mensual', amount: '25000.00', status: 'Rechazada' },
  { id: 'inv-12', number: 'B-0001-00001245', date: '2026-08-12', memberName: 'Flores, Milagros', concept: 'Cuota trimestral', amount: '65000.00', status: 'Pendiente' },
];

// ─────────────────────────────────────────────────────────────────────────
// Fidelización — puntos
// ─────────────────────────────────────────────────────────────────────────

export type LoyaltyLevel = 'Oro' | 'Plata' | 'Bronce';

export interface DemoLoyaltyAccount {
  id: string;
  memberName: string;
  level: LoyaltyLevel;
  points: number;
  lastActivity: string;
}

export const DEMO_LOYALTY_ACCOUNTS: readonly DemoLoyaltyAccount[] = [
  { id: 'loy-01', memberName: 'García, Bruno', level: 'Oro', points: 2500, lastActivity: '2026-08-15' },
  { id: 'loy-02', memberName: 'Fernández, Lucía', level: 'Oro', points: 2100, lastActivity: '2026-08-14' },
  { id: 'loy-03', memberName: 'Gómez, Martín', level: 'Plata', points: 1450, lastActivity: '2026-08-16' },
  { id: 'loy-04', memberName: 'Rodríguez, Sofía', level: 'Plata', points: 1200, lastActivity: '2026-08-13' },
  { id: 'loy-05', memberName: 'López, Nicolás', level: 'Plata', points: 980, lastActivity: '2026-08-10' },
  { id: 'loy-06', memberName: 'Díaz, Valentina', level: 'Plata', points: 760, lastActivity: '2026-08-17' },
  { id: 'loy-07', memberName: 'Martínez, Tomás', level: 'Plata', points: 610, lastActivity: '2026-08-09' },
  { id: 'loy-08', memberName: 'Sánchez, Camila', level: 'Bronce', points: 480, lastActivity: '2026-08-12' },
  { id: 'loy-09', memberName: 'Pérez, Agustín', level: 'Bronce', points: 350, lastActivity: '2026-08-08' },
  { id: 'loy-10', memberName: 'Romero, Julieta', level: 'Bronce', points: 300, lastActivity: '2026-08-18' },
  { id: 'loy-11', memberName: 'Torres, Franco', level: 'Bronce', points: 220, lastActivity: '2026-08-07' },
  { id: 'loy-12', memberName: 'Flores, Milagros', level: 'Bronce', points: 150, lastActivity: '2026-08-06' },
  { id: 'loy-13', memberName: 'Acosta, Ignacio', level: 'Bronce', points: 90, lastActivity: '2026-08-05' },
  { id: 'loy-14', memberName: 'Herrera, Emilia', level: 'Bronce', points: 40, lastActivity: '2026-08-04' },
  { id: 'loy-15', memberName: 'Suárez, Dante', level: 'Bronce', points: 0, lastActivity: '2026-08-01' },
];

export interface DemoLoyaltyMovement {
  id: string;
  date: string;
  memberName: string;
  reason: string;
  delta: number;
}

export const DEMO_LOYALTY_MOVEMENTS: readonly DemoLoyaltyMovement[] = [
  { id: 'mov-01', date: '2026-08-18', memberName: 'García, Bruno', reason: 'Asistencia', delta: 10 },
  { id: 'mov-02', date: '2026-08-17', memberName: 'Díaz, Valentina', reason: 'Renovación', delta: 100 },
  { id: 'mov-03', date: '2026-08-17', memberName: 'Fernández, Lucía', reason: 'Asistencia', delta: 10 },
  { id: 'mov-04', date: '2026-08-16', memberName: 'Gómez, Martín', reason: 'Asistencia', delta: 10 },
  { id: 'mov-05', date: '2026-08-16', memberName: 'Romero, Julieta', reason: 'Canje bebida', delta: -150 },
  { id: 'mov-06', date: '2026-08-15', memberName: 'García, Bruno', reason: 'Renovación', delta: 100 },
  { id: 'mov-07', date: '2026-08-15', memberName: 'López, Nicolás', reason: 'Asistencia', delta: 10 },
  { id: 'mov-08', date: '2026-08-14', memberName: 'Fernández, Lucía', reason: 'Canje barrita', delta: -80 },
  { id: 'mov-09', date: '2026-08-14', memberName: 'Sánchez, Camila', reason: 'Asistencia', delta: 10 },
  { id: 'mov-10', date: '2026-08-13', memberName: 'Rodríguez, Sofía', reason: 'Renovación', delta: 100 },
  { id: 'mov-11', date: '2026-08-13', memberName: 'Pérez, Agustín', reason: 'Asistencia', delta: 10 },
  { id: 'mov-12', date: '2026-08-12', memberName: 'Flores, Milagros', reason: 'Asistencia', delta: 10 },
  { id: 'mov-13', date: '2026-08-12', memberName: 'Sánchez, Camila', reason: 'Canje toalla', delta: -300 },
  { id: 'mov-14', date: '2026-08-11', memberName: 'Torres, Franco', reason: 'Asistencia', delta: 10 },
  { id: 'mov-15', date: '2026-08-10', memberName: 'López, Nicolás', reason: 'Canje bebida', delta: -150 },
  { id: 'mov-16', date: '2026-08-09', memberName: 'Martínez, Tomás', reason: 'Asistencia', delta: 10 },
  { id: 'mov-17', date: '2026-08-08', memberName: 'Pérez, Agustín', reason: 'Renovación', delta: 100 },
  { id: 'mov-18', date: '2026-08-07', memberName: 'Torres, Franco', reason: 'Canje barrita', delta: -80 },
  { id: 'mov-19', date: '2026-08-06', memberName: 'Flores, Milagros', reason: 'Asistencia', delta: 10 },
  { id: 'mov-20', date: '2026-08-01', memberName: 'Suárez, Dante', reason: 'Asistencia', delta: 10 },
];

export interface DemoRedemption {
  id: string;
  product: string;
  points: number;
}

export interface DemoLoyaltyRules {
  attendancePoints: number;
  renewalPoints: number;
  redemptions: readonly DemoRedemption[];
}

export const DEMO_LOYALTY_RULES: DemoLoyaltyRules = {
  attendancePoints: 10,
  renewalPoints: 100,
  redemptions: [
    { id: 'red-01', product: 'Bebida isotónica 500ml', points: 150 },
    { id: 'red-02', product: 'Barrita proteica', points: 80 },
    { id: 'red-03', product: 'Toalla deportiva', points: 300 },
    { id: 'red-04', product: 'Shaker 700ml', points: 250 },
  ],
};

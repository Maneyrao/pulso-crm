'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { inventoryProductInputSchema, inventoryReverseInputSchema, inventoryStockInputSchema,
  type InventoryProduct, type InventorySale } from '@pulso/contracts/inventory';
import { Button, Checkbox, FormField, Input, Modal, MoneyInput, Select, Textarea } from '@pulso/ui';
import { Save, Undo2 } from 'lucide-react';
import { adjustInventoryStock, createInventoryProduct, reverseInventorySale, updateInventoryProduct } from '@/lib/api/inventory';
import { ApiError } from '@/lib/api/errors';
import { useIdempotencyKey } from '@/lib/api/idempotency';

export const inventoryError = (error: unknown) => error instanceof ApiError
  ? error.detail ?? error.message : 'No se pudo completar la operacion. Reintenta.';

// A retry of unchanged data keeps its key; editing a submitted form starts a different operation.
export function useInventoryAttempt() {
  const attempt = useIdempotencyKey();
  const previous = React.useRef<string | undefined>(undefined);
  const keyFor = (input: unknown) => {
    const signature = JSON.stringify(input);
    if (previous.current !== undefined && previous.current !== signature) attempt.renew();
    previous.current = signature;
    return attempt.getKey();
  };
  return { keyFor, renew: () => { previous.current = undefined; attempt.renew(); } };
}

export function ProductForm({ product, onClose, onSaved }: {
  product: InventoryProduct | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = React.useState({ name: product?.name ?? '', sku: product?.sku ?? '',
    costPrice: product?.costPrice ?? '', salePrice: product?.salePrice ?? '', isActive: product?.isActive ?? true });
  const [error, setError] = React.useState('');
  const { keyFor } = useInventoryAttempt();
  const mutation = useMutation({ mutationFn: async () => {
    const body = inventoryProductInputSchema.parse(form);
    return product ? updateInventoryProduct(product.id, body, keyFor(body)) : createInventoryProduct(body, keyFor(body));
  }, onSuccess: onSaved, onError: (e) => setError(inventoryError(e)) });
  return <Modal open onOpenChange={(open) => !open && !mutation.isPending && onClose()} title={product ? 'Editar producto' : 'Nuevo producto'}
    footer={<><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
      <Button type="submit" form="inventory-product" loading={mutation.isPending}><Save size={16} aria-hidden />Guardar</Button></>}>
    <form id="inventory-product" className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault(); const valid = inventoryProductInputSchema.safeParse(form);
      if (!valid.success) { setError(valid.error.issues[0]?.message ?? 'Revisa los datos.'); return; }
      setError(''); mutation.mutate();
    }}>
      {error && <p role="alert" className="text-(--color-danger)">{error}</p>}
      <fieldset disabled={mutation.isPending} className="flex min-w-0 flex-col gap-4">
        <FormField label="Nombre" required>{(field) => <Input {...field} value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</FormField>
        <FormField label="SKU" required>{(field) => <Input {...field} value={form.sku} maxLength={64} onChange={(e) => setForm({ ...form, sku: e.target.value })} />}</FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Precio costo" required>{(field) => <MoneyInput {...field} value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} />}</FormField>
          <FormField label="Precio venta" required>{(field) => <MoneyInput {...field} value={form.salePrice} onChange={(v) => setForm({ ...form, salePrice: v })} />}</FormField>
        </div>
        <label className="flex items-center gap-2"><Checkbox checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Activo</label>
      </fieldset>
    </form>
  </Modal>;
}

export function StockForm({ product, branchId, onClose, onSaved }: {
  product: InventoryProduct; branchId: string; onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = React.useState<'RESTOCK' | 'ADJUSTMENT'>('RESTOCK');
  const [quantity, setQuantity] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState('');
  const { keyFor } = useInventoryAttempt();
  const body = { productId: product.id, branchId, type, quantity: Number(quantity), reason };
  const mutation = useMutation({ mutationFn: () => adjustInventoryStock(inventoryStockInputSchema.parse(body), keyFor(body)),
    onSuccess: onSaved, onError: (e) => setError(inventoryError(e)) });
  return <Modal open onOpenChange={(open) => !open && !mutation.isPending && onClose()} title="Reponer o ajustar stock"
    footer={<><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
      <Button form="inventory-stock" type="submit" loading={mutation.isPending}><Save size={16} aria-hidden />Guardar movimiento</Button></>}>
    <form id="inventory-stock" className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault(); const valid = inventoryStockInputSchema.safeParse(body);
      if (!valid.success) { setError(valid.error.issues[0]?.message ?? 'Revisa los datos.'); return; }
      setError(''); mutation.mutate();
    }}>
      <p className="break-words font-medium">{product.name} · Stock actual: {product.stock}</p>
      {error && <p role="alert" className="text-(--color-danger)">{error}</p>}
      <fieldset disabled={mutation.isPending} className="flex min-w-0 flex-col gap-4">
        <FormField label="Operacion">{(field) => <Select {...field} value={type} disabled={mutation.isPending} onValueChange={(v) => setType(v as typeof type)}
          options={[{ value: 'RESTOCK', label: 'Reposicion' }, { value: 'ADJUSTMENT', label: 'Ajuste (+ / -)' }]} />}</FormField>
        <FormField label={type === 'RESTOCK' ? 'Unidades a reponer' : 'Diferencia de unidades (+ / -)'} required>{(field) => <Input {...field} type="number" step={1} min={type === 'RESTOCK' ? 1 : -1_000_000} max={1_000_000} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</FormField>
        <FormField label="Motivo" required>{(field) => <Textarea {...field} minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
      </fieldset>
    </form>
  </Modal>;
}

export function ReverseForm({ sale, onClose, onSaved }: { sale: InventorySale; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState('');
  const { keyFor } = useInventoryAttempt();
  const mutation = useMutation({ mutationFn: () => reverseInventorySale(sale.id, { reason }, keyFor({ reason })),
    onSuccess: onSaved, onError: (e) => setError(inventoryError(e)) });
  return <Modal open onOpenChange={(open) => !open && !mutation.isPending && onClose()} title="Revertir venta"
    footer={<><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
      <Button form="inventory-reverse" type="submit" variant="danger" loading={mutation.isPending}><Undo2 size={16} aria-hidden />Revertir venta</Button></>}>
    <form id="inventory-reverse" className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault(); const valid = inventoryReverseInputSchema.safeParse({ reason });
      if (!valid.success) { setError('Ingresa un motivo de al menos 5 caracteres.'); return; }
      setError(''); mutation.mutate();
    }}>
      {error && <p role="alert" className="text-(--color-danger)">{error}</p>}
      <ul className="list-inside list-disc">{sale.items.map((item) => <li key={item.productId}>{item.quantity} × {item.productName}</li>)}</ul>
      <FormField label="Motivo" required>{(field) => <Textarea {...field} disabled={mutation.isPending} value={reason} minLength={5} maxLength={500} onChange={(e) => setReason(e.target.value)} />}</FormField>
    </form>
  </Modal>;
}

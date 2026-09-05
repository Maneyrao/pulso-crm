'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fromCents, toCents } from '@pulso/config/money';
import { inventorySaleInputSchema, type InventoryProduct, type InventorySale } from '@pulso/contracts/inventory';
import { Button, DataTable, EmptyState, FormField, Input, MoneyDisplay, Pagination, Select,
  Tabs, TabsContent, TabsList, TabsTrigger, useToast } from '@pulso/ui';
import { Package, PackagePlus, Pencil, Plus, ShoppingCart, Trash2, Undo2 } from 'lucide-react';
import { createInventorySale, getInventoryCheckout, listInventoryMovements, listInventoryProducts, listInventorySales } from '@/lib/api/inventory';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { useSessionStore } from '@/lib/stores/session';
import { inventoryError, ProductForm, ReverseForm, StockForm, useInventoryAttempt } from './inventory-forms';

export default function InventoryPage() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const branchId = useSessionStore((s) => s.activeBranchId);
  return <PermissionGate permission="product:read" fallback={<EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver inventario." />}>
    {gymId && branchId ? <InventoryScreen key={`${gymId}:${branchId}`} gymId={gymId} branchId={branchId} /> : <EmptyState title="Selecciona una sede" />}
  </PermissionGate>;
}

const PAGE_SIZE = 20;
const MAX_CENTS = 99_999_999_999_999n;
type CartItem = { product: InventoryProduct; quantity: number };
const movementLabels = { RESTOCK: 'Reposicion', ADJUSTMENT: 'Ajuste', SALE: 'Venta', REVERSAL: 'Reversa' };

function InventoryScreen({ gymId, branchId }: { gymId: string; branchId: string }) {
  const canWrite = usePermission('product:write');
  const canSellProduct = usePermission('product:sell');
  const canOperate = usePermission('cash:operate');
  const canSell = canSellProduct && canOperate;
  const branchName = useSessionStore((s) => s.branches.find((b) => b.id === branchId)?.name);
  const [tab, setTab] = React.useState('catalog');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [historyPage, setHistoryPage] = React.useState(1);
  const [salePage, setSalePage] = React.useState(1);
  const [productForm, setProductForm] = React.useState<InventoryProduct | 'new' | null>(null);
  const [stockForm, setStockForm] = React.useState<InventoryProduct | null>(null);
  const [reverseForm, setReverseForm] = React.useState<InventorySale | null>(null);
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [paymentMethodId, setPaymentMethodId] = React.useState('');
  const [saleError, setSaleError] = React.useState('');
  const [receipt, setReceipt] = React.useState<InventorySale | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { keyFor, renew } = useInventoryAttempt();
  const products = useQuery({ queryKey: ['inventory', gymId, branchId, 'products', search, page],
    queryFn: () => listInventoryProducts({ branchId, search, page, pageSize: PAGE_SIZE }) });
  const checkout = useQuery({ queryKey: ['inventory', gymId, branchId, 'checkout'],
    queryFn: () => getInventoryCheckout(branchId), enabled: canSell, refetchInterval: 30_000 });
  const sales = useQuery({ queryKey: ['inventory', gymId, branchId, 'sales', salePage],
    queryFn: () => listInventorySales({ branchId, page: salePage, pageSize: PAGE_SIZE }), enabled: tab === 'sales' });
  const movements = useQuery({ queryKey: ['inventory', gymId, branchId, 'movements', historyPage],
    queryFn: () => listInventoryMovements({ branchId, page: historyPage, pageSize: PAGE_SIZE }), enabled: tab === 'movements' });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory', gymId] });
    for (const prefix of ['cash-movements', 'cash-session', 'daybook', 'dashboard']) {
      void queryClient.invalidateQueries({ queryKey: [prefix, gymId] });
    }
  };
  const saved = () => { setProductForm(null); setStockForm(null); setReverseForm(null); invalidate(); toast({ title: 'Inventario actualizado', tone: 'success' }); };
  const saleMutation = useMutation({ mutationFn: (body: Parameters<typeof createInventorySale>[0]) => createInventorySale(body, keyFor(body)),
    onSuccess: (result) => { renew(); setReceipt(result); setCart([]); setPaymentMethodId(''); setSaleError(''); invalidate(); },
    onError: (e) => { setSaleError(inventoryError(e)); invalidate(); } });
  const totalCents = cart.reduce((sum, item) => sum + toCents(item.product.salePrice) * BigInt(item.quantity), 0n);
  const total = totalCents <= MAX_CENTS ? fromCents(totalCents) : null;
  const effectiveMethod = paymentMethodId || (checkout.data?.paymentMethods.length === 1 ? checkout.data.paymentMethods[0]!.id : '');
  const methodValid = checkout.data?.paymentMethods.some((method) => method.id === effectiveMethod);

  function add(product: InventoryProduct) {
    setReceipt(null);
    setSaleError('');
    setCart((current) => {
      const found = current.find((i) => i.product.id === product.id);
      if (found) return current.map((i) => i.product.id === product.id ? { product, quantity: Math.min(product.stock, i.quantity + 1) } : i);
      return [...current, { product, quantity: 1 }];
    });
  }

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-(--text-2xl) font-semibold"><Package size={24} aria-hidden />Inventario</h1>
        <p className="text-sm text-(--color-muted)">{branchName}</p></div>
      {canWrite && <Button onClick={() => setProductForm('new')}><Plus size={16} aria-hidden />Nuevo producto</Button>}
    </header>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Inventario"><TabsTrigger value="catalog">Catalogo y stock</TabsTrigger>
        {canSell && <TabsTrigger value="sale">Nueva venta</TabsTrigger>}
        <TabsTrigger value="sales">Ventas</TabsTrigger><TabsTrigger value="movements">Movimientos</TabsTrigger></TabsList>

      {(tab === 'catalog' || tab === 'sale') && <div className="my-4 max-w-lg">
        <FormField label="Buscar producto">{(field) => <Input {...field} placeholder="Nombre o SKU" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />}</FormField>
      </div>}

      <TabsContent value="catalog">
        <DataTable caption="Catalogo y stock por sede" data={products.data?.data ?? []} rowKey={(p) => p.id} loading={products.isPending}
          error={products.isError ? inventoryError(products.error) : undefined} onRetry={() => products.refetch()} emptyTitle="Sin productos"
          columns={[
            { id: 'name', header: 'Producto', cell: (p) => <span className="block max-w-64 break-words font-medium">{p.name}</span> },
            { id: 'sku', header: 'SKU', cell: (p) => <span className="block max-w-40 break-all">{p.sku}</span> },
            { id: 'cost', header: 'Costo', cell: (p) => <MoneyDisplay value={p.costPrice} /> },
            { id: 'price', header: 'Venta', cell: (p) => <MoneyDisplay value={p.salePrice} /> },
            { id: 'stock', header: 'Stock', cell: (p) => p.stock },
            { id: 'active', header: 'Estado', cell: (p) => p.isActive ? 'Activo' : 'Inactivo' },
            ...(canWrite ? [{ id: 'actions', header: 'Acciones', cell: (p: InventoryProduct) => <div className="flex gap-1">
              <Button size="sm" variant="ghost" title="Editar producto" aria-label={`Editar ${p.name}`} onClick={() => setProductForm(p)}><Pencil size={16} aria-hidden /></Button>
              <Button size="sm" variant="ghost" title="Reponer o ajustar stock" aria-label={`Reponer ${p.name}`} onClick={() => setStockForm(p)}><PackagePlus size={16} aria-hidden /></Button>
            </div> }] : []),
          ]} />
        <div className="mt-3"><Pagination page={page} pageCount={Math.ceil((products.data?.total ?? 0) / PAGE_SIZE)} totalItems={products.data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} /></div>
      </TabsContent>

      {canSell && <TabsContent value="sale">
        {checkout.isError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-(--color-danger)">{inventoryError(checkout.error)}<Button size="sm" variant="outline" onClick={() => checkout.refetch()}>Reintentar</Button></div>}
        {!checkout.isPending && !checkout.isError && !checkout.data?.session && <p role="status" className="mb-4 text-(--color-warning)">No tenes una caja propia abierta en esta sede. <Link href="/cash" className="underline">Ir a Caja</Link></p>}
        {receipt && <p role="status" className="mb-4 font-medium text-(--color-success)">Venta registrada · <MoneyDisplay value={receipt.total} /></p>}
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="min-w-0">
            <DataTable caption="Productos para vender" data={(products.data?.data ?? []).filter((p) => p.isActive)} rowKey={(p) => p.id}
              loading={products.isPending} error={products.isError ? inventoryError(products.error) : undefined} onRetry={() => products.refetch()} emptyTitle="Sin productos disponibles"
              columns={[
                { id: 'product', header: 'Producto', cell: (p) => <div className="max-w-64 break-words"><span className="font-medium">{p.name}</span><div className="break-all text-xs text-(--color-muted)">{p.sku}</div></div> },
                { id: 'price', header: 'Precio', cell: (p) => <MoneyDisplay value={p.salePrice} /> },
                { id: 'stock', header: 'Stock', cell: (p) => p.stock },
                { id: 'add', header: '', cell: (p) => <Button size="sm" variant="outline" title="Agregar a la venta" aria-label={`Agregar ${p.name}`} disabled={saleMutation.isPending || p.stock <= (cart.find((i) => i.product.id === p.id)?.quantity ?? 0)} onClick={() => add(p)}><Plus size={16} aria-hidden /></Button> },
              ]} />
            <div className="mt-3"><Pagination page={page} pageCount={Math.ceil((products.data?.total ?? 0) / PAGE_SIZE)} onPageChange={setPage} /></div>
          </div>
          <form className="flex min-w-0 flex-col gap-4" onSubmit={(e) => {
            e.preventDefault(); if (!checkout.data?.session || !methodValid || total === null || saleMutation.isPending) return;
            const parsed = inventorySaleInputSchema.safeParse({ branchId, paymentMethodId: effectiveMethod,
              items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })) });
            if (!parsed.success) { setSaleError('Agrega productos y cantidades validas.'); return; }
            setSaleError(''); saleMutation.mutate(parsed.data);
          }}>
            <h2 className="text-lg font-semibold">Detalle de venta</h2>
            {saleError && <p role="alert" className="text-(--color-danger)">{saleError}</p>}
            {cart.length === 0 && <p className="text-sm text-(--color-muted)">Sin productos en la venta.</p>}
            {cart.map((item) => <div key={item.product.id} className="grid grid-cols-[minmax(0,1fr)_80px_40px] items-center gap-2 border-b border-(--color-border) pb-3">
              <div className="min-w-0 break-words"><p className="font-medium">{item.product.name}</p><MoneyDisplay value={item.product.salePrice} /></div>
              <Input aria-label={`Cantidad de ${item.product.name}`} type="number" min={1} max={Math.min(item.product.stock, 1_000_000)} step={1} value={item.quantity} disabled={saleMutation.isPending}
                onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 0 && n <= Math.min(item.product.stock, 1_000_000)) setCart(cart.map((i) => i.product.id === item.product.id ? { ...i, quantity: n } : i)); }} />
              <Button variant="ghost" size="sm" title="Quitar producto" aria-label={`Quitar ${item.product.name}`} disabled={saleMutation.isPending} onClick={() => setCart(cart.filter((i) => i.product.id !== item.product.id))}><Trash2 size={16} aria-hidden /></Button>
            </div>)}
            <FormField label="Medio de pago" required>{(field) => <Select {...field} value={effectiveMethod} onValueChange={setPaymentMethodId} disabled={saleMutation.isPending || checkout.isPending}
              options={(checkout.data?.paymentMethods ?? []).map((m) => ({ value: m.id, label: m.name }))} />}</FormField>
            {checkout.data?.paymentMethods.length === 0 && <p role="status" className="text-(--color-warning)">No hay medios de pago activos.</p>}
            <div className="flex justify-between gap-2 border-t border-(--color-border) pt-4 font-semibold"><span>Total</span>{total === null ? <span role="alert">Importe fuera de limite</span> : <MoneyDisplay value={total} />}</div>
            <Button type="submit" loading={saleMutation.isPending} disabled={!checkout.data?.session || !methodValid || !cart.length || total === null}><ShoppingCart size={16} aria-hidden />Cobrar venta</Button>
          </form>
        </div>
      </TabsContent>}

      <TabsContent value="sales"><DataTable caption="Ventas de la sede" data={sales.data?.data ?? []} rowKey={(s) => s.id} loading={sales.isPending}
        error={sales.isError ? inventoryError(sales.error) : undefined} onRetry={() => sales.refetch()} emptyTitle="Sin ventas"
        columns={[
          { id: 'date', header: 'Fecha', cell: (s) => new Date(s.createdAt).toLocaleString('es-AR') },
          { id: 'items', header: 'Productos', cell: (s) => <ul className="max-w-72 break-words">{s.items.map((i) => <li key={i.productId}>{i.quantity} × {i.productName}</li>)}</ul> },
          { id: 'total', header: 'Total', cell: (s) => <MoneyDisplay value={s.total} /> },
          { id: 'method', header: 'Medio de pago', cell: (s) => s.paymentMethodName },
          { id: 'status', header: 'Estado', cell: (s) => <span title={s.reversalReason ?? undefined}>{s.status === 'COMPLETED' ? 'Cobrada' : 'Revertida'}</span> },
          ...(canSell ? [{ id: 'reverse', header: '', cell: (s: InventorySale) => s.status === 'COMPLETED' ? <Button size="sm" variant="ghost" title="Revertir venta" aria-label={`Revertir venta ${s.id}`} onClick={() => setReverseForm(s)}><Undo2 size={16} aria-hidden /></Button> : null }] : []),
        ]} /><div className="mt-3"><Pagination page={salePage} pageCount={Math.ceil((sales.data?.total ?? 0) / PAGE_SIZE)} totalItems={sales.data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setSalePage} /></div></TabsContent>

      <TabsContent value="movements"><DataTable caption="Historial de stock" data={movements.data?.data ?? []} rowKey={(m) => m.id} loading={movements.isPending}
        error={movements.isError ? inventoryError(movements.error) : undefined} onRetry={() => movements.refetch()} emptyTitle="Sin movimientos"
        columns={[
          { id: 'date', header: 'Fecha', cell: (m) => new Date(m.createdAt).toLocaleString('es-AR') },
          { id: 'name', header: 'Producto', cell: (m) => <span className="block max-w-64 break-words">{m.productName}</span> },
          { id: 'type', header: 'Operacion', cell: (m) => movementLabels[m.type] },
          { id: 'quantity', header: 'Cantidad', cell: (m) => `${m.quantity > 0 ? '+' : ''}${m.quantity}` },
          { id: 'balance', header: 'Stock posterior', cell: (m) => m.balanceAfter },
          { id: 'reason', header: 'Motivo', cell: (m) => <span className="block max-w-72 break-words">{m.reason}</span> },
        ]} /><div className="mt-3"><Pagination page={historyPage} pageCount={Math.ceil((movements.data?.total ?? 0) / PAGE_SIZE)} totalItems={movements.data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setHistoryPage} /></div></TabsContent>
    </Tabs>
    {productForm && <ProductForm product={productForm === 'new' ? null : productForm} onClose={() => setProductForm(null)} onSaved={saved} />}
    {stockForm && <StockForm product={stockForm} branchId={branchId} onClose={() => setStockForm(null)} onSaved={saved} />}
    {reverseForm && <ReverseForm sale={reverseForm} onClose={() => setReverseForm(null)} onSaved={saved} />}
  </div>;
}

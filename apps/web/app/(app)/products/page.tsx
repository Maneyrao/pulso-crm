'use client';

import * as React from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  Input,
  Modal,
  MoneyDisplay,
  Select,
  StatusBadge,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import {
  activeProductsCount,
  DEMO_PRODUCTS,
  inventoryValue,
  outOfStockCount,
  PRODUCT_CATEGORIES,
  type DemoProduct,
} from '@/lib/mock/data/commerce-demo';

const DEMO_TOAST_MESSAGE = 'Demo: disponible con backend';

/**
 * Productos (POS) — sin backend todavía (`product:read`), pantalla de demo
 * con `useMockData` (docs/CONTROLFIT_PARITY_AUDIT.md §2).
 */
export default function ProductsPage() {
  return (
    <PermissionGate
      permission="product:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ProductsScreen />
    </PermissionGate>
  );
}

function ProductsScreen() {
  const { data, isLoading } = useMockData(() => DEMO_PRODUCTS);
  const { toast } = useToast();

  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [newProductOpen, setNewProductOpen] = React.useState(false);

  const isFiltered = search.trim() !== '' || category !== 'all';

  const filtered = React.useMemo(() => {
    const items = data ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((p) => {
      const matchesSearch = normalizedSearch === '' || p.name.toLowerCase().includes(normalizedSearch);
      const matchesCategory = category === 'all' || p.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [data, search, category]);

  const handleDemoAction = (): void => {
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const handleCreateDemo = (): void => {
    setNewProductOpen(false);
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const columns: DataTableColumn<DemoProduct>[] = [
    {
      id: 'name',
      header: 'Producto',
      cell: (p) => <span className="font-medium text-(--color-text)">{p.name}</span>,
    },
    {
      id: 'category',
      header: 'Categoría',
      cell: (p) => <Badge tone="neutral">{p.category}</Badge>,
    },
    {
      id: 'price',
      header: 'Precio',
      cell: (p) => <MoneyDisplay value={p.price} />,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'stock',
      header: 'Stock',
      cell: (p) =>
        p.stock < 5 ? (
          <span className="inline-flex items-center gap-1 font-medium text-(--color-danger)">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden={true} />
            {p.stock}
          </span>
        ) : (
          <span className="tabular-nums">{p.stock}</span>
        ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (p) =>
        p.status === 'Activo' ? (
          <StatusBadge tone="success" label="Activo" />
        ) : (
          <StatusBadge tone="neutral" label="Inactivo" />
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleDemoAction}>
            Vender
          </Button>
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  const categoryOptions = [
    { value: 'all', label: 'Todas las categorías' },
    ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Package}
        title="Productos"
        description="Venta de productos y control de stock."
        mock
        actions={<Button onClick={() => setNewProductOpen(true)}>Nuevo producto</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-(--text-sm) text-(--color-muted)">Productos activos</span>
            <span className="text-(--text-2xl) font-semibold text-(--color-text)">
              {activeProductsCount()}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-(--text-sm) text-(--color-muted)">Sin stock</span>
            <span className="text-(--text-2xl) font-semibold text-(--color-text)">
              {outOfStockCount()}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-(--text-sm) text-(--color-muted)">Valor de inventario</span>
            <span className="text-(--text-2xl) font-semibold text-(--color-text)">
              <MoneyDisplay value={inventoryValue()} />
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor="products-search" className="text-(--text-sm) font-medium text-(--color-text)">
            Buscar
          </label>
          <Input
            id="products-search"
            type="search"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex w-56 flex-col gap-1.5">
          <label htmlFor="products-category" className="text-(--text-sm) font-medium text-(--color-text)">
            Categoría
          </label>
          <Select id="products-category" options={categoryOptions} value={category} onValueChange={setCategory} />
        </div>
      </div>

      <DataTable
        caption="Productos"
        columns={columns}
        data={filtered}
        rowKey={(p) => p.id}
        loading={isLoading}
        isFiltered={isFiltered}
        onClearFilters={() => {
          setSearch('');
          setCategory('all');
        }}
        emptyTitle="Todavía no hay productos"
        emptyDescription="Los productos se cargan cuando el módulo de POS tenga backend."
      />

      <Modal
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        title="Nuevo producto"
        description="Este módulo todavía no tiene backend: por ahora es una vista de demostración."
        footer={
          <>
            <Button variant="outline" onClick={() => setNewProductOpen(false)}>
              Cerrar
            </Button>
            <Button onClick={handleCreateDemo}>Guardar</Button>
          </>
        }
      >
        <p className="text-(--text-sm) text-(--color-muted)">
          Cuando el backend de productos esté disponible, acá vas a poder cargar nombre, categoría, precio y
          stock inicial.
        </p>
      </Modal>
    </div>
  );
}

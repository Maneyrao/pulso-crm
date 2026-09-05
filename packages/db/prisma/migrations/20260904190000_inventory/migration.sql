-- CreateEnum
CREATE TYPE "InventoryStockMovementType" AS ENUM ('RESTOCK', 'ADJUSTMENT', 'SALE', 'REVERSAL');

-- CreateTable
CREATE TABLE "inventory_products" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" CITEXT NOT NULL,
    "costPrice" DECIMAL(14,2) NOT NULL,
    "salePrice" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sales" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "cashMovementId" UUID NOT NULL,
    "reversalMovementId" UUID,
    "total" DECIMAL(14,2) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,

    CONSTRAINT "inventory_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sale_items" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "inventory_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock_movements" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "saleId" UUID,
    "type" "InventoryStockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_operations" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_products_gymId_name_idx" ON "inventory_products"("gymId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_products_gymId_id_key" ON "inventory_products"("gymId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_products_gymId_sku_key" ON "inventory_products"("gymId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_gymId_branchId_productId_key" ON "inventory_stock"("gymId", "branchId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sales_cashMovementId_key" ON "inventory_sales"("cashMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sales_reversalMovementId_key" ON "inventory_sales"("reversalMovementId");

-- CreateIndex
CREATE INDEX "inventory_sales_gymId_branchId_createdAt_idx" ON "inventory_sales"("gymId", "branchId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sales_gymId_id_key" ON "inventory_sales"("gymId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sale_items_gymId_saleId_productId_key" ON "inventory_sale_items"("gymId", "saleId", "productId");

-- CreateIndex
CREATE INDEX "inventory_stock_movements_gymId_branchId_createdAt_idx" ON "inventory_stock_movements"("gymId", "branchId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "inventory_stock_movements_gymId_productId_createdAt_idx" ON "inventory_stock_movements"("gymId", "productId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_movements_gymId_saleId_productId_type_key" ON "inventory_stock_movements"("gymId", "saleId", "productId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_operations_gymId_key_key" ON "inventory_operations"("gymId", "key");

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_gymId_productId_fkey" FOREIGN KEY ("gymId", "productId") REFERENCES "inventory_products"("gymId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sales" ADD CONSTRAINT "inventory_sales_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sales" ADD CONSTRAINT "inventory_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sales" ADD CONSTRAINT "inventory_sales_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sales" ADD CONSTRAINT "inventory_sales_reversalMovementId_fkey" FOREIGN KEY ("reversalMovementId") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sale_items" ADD CONSTRAINT "inventory_sale_items_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sale_items" ADD CONSTRAINT "inventory_sale_items_gymId_saleId_fkey" FOREIGN KEY ("gymId", "saleId") REFERENCES "inventory_sales"("gymId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sale_items" ADD CONSTRAINT "inventory_sale_items_gymId_productId_fkey" FOREIGN KEY ("gymId", "productId") REFERENCES "inventory_products"("gymId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_gymId_productId_fkey" FOREIGN KEY ("gymId", "productId") REFERENCES "inventory_products"("gymId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_gymId_saleId_fkey" FOREIGN KEY ("gymId", "saleId") REFERENCES "inventory_sales"("gymId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE inventory_products ADD CONSTRAINT inventory_prices_valid
  CHECK ("costPrice" >= 0 AND "salePrice" > 0);
ALTER TABLE inventory_stock ADD CONSTRAINT inventory_stock_non_negative CHECK (quantity >= 0);
ALTER TABLE inventory_sales ADD CONSTRAINT inventory_sale_total_positive CHECK (total > 0);
ALTER TABLE inventory_sales ADD CONSTRAINT inventory_sale_reversal_complete CHECK (
  ("reversedAt" IS NULL AND "reversalMovementId" IS NULL AND "reversalReason" IS NULL) OR
  ("reversedAt" IS NOT NULL AND "reversalMovementId" IS NOT NULL AND length(trim("reversalReason")) >= 5));
ALTER TABLE inventory_sale_items ADD CONSTRAINT inventory_item_valid
  CHECK (quantity > 0 AND "unitPrice" > 0 AND "unitCost" >= 0 AND "lineTotal" = quantity * "unitPrice");
ALTER TABLE inventory_stock_movements ADD CONSTRAINT inventory_movement_valid CHECK (
  quantity <> 0 AND "balanceAfter" >= 0 AND length(trim(reason)) >= 5 AND
  ((type = 'SALE' AND quantity < 0 AND "saleId" IS NOT NULL) OR
   (type = 'REVERSAL' AND quantity > 0 AND "saleId" IS NOT NULL) OR
   (type = 'RESTOCK' AND quantity > 0 AND "saleId" IS NULL) OR
   (type = 'ADJUSTMENT' AND "saleId" IS NULL)));

CREATE TRIGGER inventory_movements_append_only BEFORE UPDATE OR DELETE ON inventory_stock_movements
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();
CREATE TRIGGER inventory_items_append_only BEFORE UPDATE OR DELETE ON inventory_sale_items
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();
CREATE TRIGGER inventory_operations_append_only BEFORE UPDATE OR DELETE ON inventory_operations
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();

CREATE FUNCTION pulso_inventory_sale_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se borran.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF ROW(NEW.id, NEW."gymId", NEW."branchId", NEW."cashMovementId", NEW.total, NEW."createdByUserId", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id, OLD."gymId", OLD."branchId", OLD."cashMovementId", OLD.total, OLD."createdByUserId", OLD."createdAt")
    OR OLD."reversedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'La venta es inmutable salvo su primera reversa.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_sales_immutable BEFORE UPDATE OR DELETE ON inventory_sales
  FOR EACH ROW EXECUTE FUNCTION pulso_inventory_sale_immutable();

-- Defense in depth: even a direct generic cash reversal cannot commit without restoring inventory.
-- Deferred because the matching sale, cash and stock rows are inserted in the same transaction.
CREATE FUNCTION pulso_inventory_cash_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s inventory_sales%ROWTYPE;
BEGIN
  SELECT * INTO s FROM inventory_sales WHERE "cashMovementId" = COALESCE(NEW."reversalOfId", NEW.id);
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW."reversalOfId" IS NOT NULL OR NEW."isReversed" THEN
    IF s."reversedAt" IS NULL OR s."reversalMovementId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM cash_movements r WHERE r.id = s."reversalMovementId"
      AND r."reversalOfId" = s."cashMovementId" AND r."gymId" = s."gymId" AND r.type = 'EXPENSE' AND r.amount = s.total
    ) OR EXISTS (
      SELECT 1 FROM inventory_sale_items i WHERE i."saleId" = s.id AND NOT EXISTS (
        SELECT 1 FROM inventory_stock_movements m WHERE m."saleId" = s.id
        AND m."gymId" = s."gymId" AND m."branchId" = s."branchId" AND m."productId" = i."productId"
        AND m.type = 'REVERSAL' AND m.quantity = i.quantity
      )
    ) THEN
      RAISE EXCEPTION 'Revertir esta venta exige restaurar el inventario en la misma transaccion.' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER inventory_cash_consistency AFTER INSERT OR UPDATE ON cash_movements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pulso_inventory_cash_consistent();

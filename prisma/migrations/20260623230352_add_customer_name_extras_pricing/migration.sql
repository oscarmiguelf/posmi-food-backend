-- AlterTable
ALTER TABLE "order_item_modifiers" ADD COLUMN     "extra_price" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_name" TEXT;

-- CreateTable
CREATE TABLE "menu_item_extras" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "menu_item_id" TEXT NOT NULL,
    "ingredient_name" TEXT NOT NULL,
    "price_with_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_extras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_extras_menu_item_id_ingredient_name_deleted_at_key" ON "menu_item_extras"("menu_item_id", "ingredient_name", "deleted_at");

-- AddForeignKey
ALTER TABLE "menu_item_extras" ADD CONSTRAINT "menu_item_extras_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

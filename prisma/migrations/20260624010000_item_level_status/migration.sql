-- CreateEnum
CREATE TYPE "order_item_status" AS ENUM ('pending', 'in_kitchen', 'ready', 'delivered');

-- AlterTable: add item_status to order_items
ALTER TABLE "order_items" ADD COLUMN "item_status" "order_item_status" NOT NULL DEFAULT 'pending';

-- Clean up any orders with old statuses before removing enum values
UPDATE "orders" SET "status" = 'open' WHERE "status" IN ('in_kitchen', 'ready');

-- Convert order_status_history columns to text (they used the old enum)
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" TYPE TEXT USING "from_status"::TEXT;
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" TYPE TEXT USING "to_status"::TEXT;

-- AlterEnum: remove in_kitchen and ready from order_status (now on item level)
CREATE TYPE "order_status_new" AS ENUM ('open', 'closed');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "order_status_new" USING ("status"::text::"order_status_new");
ALTER TYPE "order_status" RENAME TO "order_status_old";
ALTER TYPE "order_status_new" RENAME TO "order_status";
DROP TYPE "order_status_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'open';

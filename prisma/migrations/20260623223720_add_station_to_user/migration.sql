-- AlterTable
ALTER TABLE "users" ADD COLUMN     "station_id" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

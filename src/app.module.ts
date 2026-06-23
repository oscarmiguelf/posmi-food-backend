import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { EventsModule } from './shared/websocket/events.module';
import { PinoLoggerModule } from './shared/logger/pino-logger.module';
import { GlobalExceptionFilter } from './shared/filters/http-exception.filter';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { TablesModule } from './modules/tables/tables.module';
import { StationsModule } from './modules/stations/stations.module';
import { MenuItemsModule } from './modules/menu-items/menu-items.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CashSessionsModule } from './modules/cash-sessions/cash-sessions.module';
import { ConfigAppModule } from './modules/config/config-app.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { SyncModule } from './modules/sync/sync.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PinoLoggerModule,
    EventsModule,
    // Auth & identity
    AuthModule,
    UsersModule,
    RolesModule,
    // Operations
    TablesModule,
    StationsModule,
    MenuItemsModule,
    OrdersModule,
    CashSessionsModule,
    // Fase 2 — Insumos, recetas y costos
    IngredientsModule,
    ReportsModule,
    // Fase 3 — Compras
    SuppliersModule,
    PurchaseOrdersModule,
    // Fase 5 — Clientes
    CustomersModule,
    ReservationsModule,
    // Fase 6 — Offline-first sync
    SyncModule,
    // Config
    ConfigAppModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}

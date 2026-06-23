import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { EventsModule } from './shared/websocket/events.module';
import { GlobalExceptionFilter } from './shared/filters/http-exception.filter';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    // Config
    ConfigAppModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}

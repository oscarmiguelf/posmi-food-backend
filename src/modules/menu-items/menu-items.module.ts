import { Module } from '@nestjs/common';
import { MenuItemsController } from './infrastructure/http/menu-items.controller';

@Module({ controllers: [MenuItemsController] })
export class MenuItemsModule {}

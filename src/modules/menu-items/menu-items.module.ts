import { Module } from '@nestjs/common';
import { MenuItemsController } from './infrastructure/http/menu-items.controller';
import { MenuItemTypesController } from './infrastructure/http/menu-item-types.controller';

@Module({ controllers: [MenuItemsController, MenuItemTypesController] })
export class MenuItemsModule {}

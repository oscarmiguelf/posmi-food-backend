import { Module } from '@nestjs/common';
import { MenuCategoriesController } from './infrastructure/http/menu-categories.controller';
import { DigitalMenuController } from './infrastructure/http/digital-menu.controller';

@Module({
  controllers: [MenuCategoriesController, DigitalMenuController],
})
export class DigitalMenuModule {}

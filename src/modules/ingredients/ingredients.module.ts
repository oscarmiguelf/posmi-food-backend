import { Module } from '@nestjs/common';
import { IngredientsController } from './infrastructure/http/ingredients.controller';

@Module({
  controllers: [IngredientsController],
})
export class IngredientsModule {}

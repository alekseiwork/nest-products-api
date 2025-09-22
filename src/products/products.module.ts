import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController, ImportController } from './products.controller';
import { ProductEntity } from './product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity])],
  providers: [ProductsService],
  controllers: [ProductsController, ImportController],
})
export class ProductsModule {}

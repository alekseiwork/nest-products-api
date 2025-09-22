import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { ProductEntity } from './product.entity';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
  ) {}

  async findAll(): Promise<ProductEntity[]> {
    return this.productsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ProductEntity | null> {
    return this.productsRepo.findOneBy({ id });
  }

  async findByArticle(article: string): Promise<ProductEntity | null> {
    return this.productsRepo.findOneBy({ article });
  }

  async findWithFilters(
    search?: string,
    brand?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<ProductEntity[]> {
    const queryBuilder = this.productsRepo.createQueryBuilder('product');

    if (search) {
      queryBuilder.where(
        '(product.name ILIKE :search OR product.article ILIKE :search OR product.brand ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (brand) {
      if (search) {
        queryBuilder.andWhere('product.brand ILIKE :brand', {
          brand: `%${brand}%`,
        });
      } else {
        queryBuilder.where('product.brand ILIKE :brand', {
          brand: `%${brand}%`,
        });
      }
    }

    // Сортировка по любой колонке
    const validSortColumns = [
      'article',
      'name',
      'brand',
      'price',
      'color',
      'country',
      'createdAt',
    ];
    if (!validSortColumns.includes(sortBy)) sortBy = 'createdAt';

    return queryBuilder.orderBy(`product.${sortBy}`, sortOrder).getMany();
  }

  async create(data: CreateProductDto): Promise<ProductEntity> {
    // Проверяем на дубликат артикула
    const existing = await this.findByArticle(data.article);
    if (existing) {
      throw new Error(`Продукт с артикулом ${data.article} уже существует`);
    }

    const product = this.productsRepo.create(data);
    return this.productsRepo.save(product);
  }

  async update(id: number, data: UpdateProductDto): Promise<ProductEntity> {
    const existingProduct = await this.findOne(id);
    if (!existingProduct) {
      throw new NotFoundException(`Продукт с ID ${id} не найден`);
    }

    // Если обновляется артикул, проверяем на дубликат
    if (data.article && data.article !== existingProduct.article) {
      const duplicate = await this.findByArticle(data.article);
      if (duplicate) {
        throw new Error(`Продукт с артикулом ${data.article} уже существует`);
      }
    }

    await this.productsRepo.update(id, data);
    const updatedProduct = await this.findOne(id);
    return updatedProduct!;
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    if (!product) {
      throw new NotFoundException(`Продукт с ID ${id} не найден`);
    }

    await this.productsRepo.delete(id);
  }

  async getBrands(): Promise<string[]> {
    const result = await this.productsRepo
      .createQueryBuilder('product')
      .select('DISTINCT product.brand', 'brand')
      .where('product.brand IS NOT NULL')
      .andWhere('product.brand != :empty', { empty: '' })
      .orderBy('product.brand', 'ASC')
      .getRawMany();

    return result.map((item) => item.brand);
  }

  async clearTable(): Promise<void> {
    await this.productsRepo.query(
      `TRUNCATE TABLE "${this.productsRepo.metadata.tableName}" RESTART IDENTITY CASCADE;`,
    );
  }
}

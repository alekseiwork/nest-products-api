import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductEntity } from './product.entity';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import csvParser from 'csv-parser';
import { FileInterceptor } from '@nestjs/platform-express';
import { Readable } from 'stream';

// Контроллер CRUD для продуктов
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getAll(
    @Query('search') search?: string,
    @Query('brand') brand?: string,
  ): Promise<ProductEntity[]> {
    if (search || brand) {
      return this.productsService.findWithFilters(search, brand);
    }
    return this.productsService.findAll();
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<ProductEntity> {
    const product = await this.productsService.findOne(id);
    if (!product) {
      throw new HttpException('Продукт не найден', HttpStatus.NOT_FOUND);
    }
    return product;
  }

  @Post()
  async create(
    @Body() createProductDto: CreateProductDto,
  ): Promise<ProductEntity> {
    try {
      return await this.productsService.create(createProductDto);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        throw new HttpException(
          'Продукт с таким артикулом уже существует',
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        'Ошибка создания продукта',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductEntity> {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.productsService.remove(id);
    return { message: 'Продукт успешно удален' };
  }
}

// Контроллер импорта CSV файлов
@Controller('import')
export class ImportController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async importFile(@UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new HttpException('Файл не загружен', HttpStatus.BAD_REQUEST);
    }

    // Проверяем тип файла
    const allowedMimeTypes = [
      'text/csv',
      'text/tab-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (
      !allowedMimeTypes.includes(file.mimetype) &&
      !file.originalname.match(/\.(csv|tsv|xls|xlsx)$/i)
    ) {
      throw new HttpException(
        'Неподдерживаемый формат файла. Поддерживаются: CSV, TSV, XLS, XLSX',
        HttpStatus.BAD_REQUEST,
      );
    }

    const results: CreateProductDto[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];

    const stream: Readable = Readable.from(file.buffer);

    return new Promise<{
      imported: number;
      errors?: string[];
      duplicates?: string[];
    }>((resolve, reject) => {
      // Определяем разделитель на основе расширения файла
      const separator = file.originalname.toLowerCase().includes('.tsv')
        ? '\t'
        : ',';

      stream
        .pipe(csvParser({ separator }))
        .on('data', (data: Record<string, string>) => {
          try {
            // Проверяем обязательные поля с различными вариантами названий колонок
            const article = (
              data['Артикул'] ||
              data['артикул'] ||
              data['Article'] ||
              data['article'] ||
              data['SKU'] ||
              data['sku']
            )?.trim();

            const name = (
              data['Название товара'] ||
              data['название товара'] ||
              data['Название'] ||
              data['название'] ||
              data['Name'] ||
              data['name'] ||
              data['Product Name'] ||
              data['product name']
            )?.trim();

            if (!article || !name) {
              errors.push(
                `Пропущена строка: отсутствует артикул или название - ${JSON.stringify(
                  data,
                )}`,
              );
              return;
            }

            // Парсим цену более надежно
            const priceStr = (
              data['Цена, руб.*'] ||
              data['Цена'] ||
              data['цена'] ||
              data['Price'] ||
              data['price']
            )
              ?.trim()
              .replace(/[^\d.,]/g, '')
              .replace(',', '.');

            const price =
              priceStr && !isNaN(Number(priceStr))
                ? Number(priceStr)
                : undefined;

            const productData: CreateProductDto = {
              article,
              name,
              brand:
                (
                  data['Бренд'] ||
                  data['бренд'] ||
                  data['Brand'] ||
                  data['brand']
                )?.trim() || undefined,
              price: price,
              color:
                (
                  data['Цвет'] ||
                  data['цвет'] ||
                  data['Color'] ||
                  data['color']
                )?.trim() || undefined,
              country:
                (
                  data['Страна-изготовитель'] ||
                  data['страна-изготовитель'] ||
                  data['Страна'] ||
                  data['страна'] ||
                  data['Country'] ||
                  data['country']
                )?.trim() || undefined,
            };

            results.push(productData);
          } catch (error) {
            errors.push(
              `Ошибка обработки строки: ${JSON.stringify(data)} - ${error}`,
            );
          }
        })
        .on('end', async () => {
          try {
            let imported = 0;

            for (const productData of results) {
              try {
                // Проверяем на дубликаты перед созданием
                const existing = await this.productsService.findByArticle(
                  productData.article,
                );
                if (existing) {
                  duplicates.push(
                    `Продукт с артикулом ${productData.article} уже существует`,
                  );
                  continue;
                }

                await this.productsService.create(productData);
                imported++;
              } catch (saveError) {
                errors.push(
                  `Ошибка сохранения продукта ${productData.article}: ${saveError}`,
                );
              }
            }

            resolve({
              imported,
              errors: errors.length > 0 ? errors : undefined,
              duplicates: duplicates.length > 0 ? duplicates : undefined,
            });
          } catch (error) {
            reject(
              new HttpException(
                'Ошибка сохранения в базу данных',
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            );
          }
        })
        .on('error', (err: Error) => {
          reject(
            new HttpException(
              `Ошибка обработки файла: ${err.message}`,
              HttpStatus.BAD_REQUEST,
            ),
          );
        });
    });
  }
}

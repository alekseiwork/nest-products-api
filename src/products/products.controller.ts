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
import { FileInterceptor } from '@nestjs/platform-express';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Контроллер CRUD для продуктов
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getAll(
    @Query('search') search?: string,
    @Query('brand') brand?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<ProductEntity[]> {
    return this.productsService.findWithFilters(
      search,
      brand,
      sortBy,
      sortOrder,
    );
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

    let rows: Record<string, string>[] = [];

    try {
      if (file.originalname.match(/\.(csv|tsv)$/i)) {
        // CSV/TSV
        const separator = file.originalname.toLowerCase().includes('.tsv')
          ? '\t'
          : ',';
        const text = file.buffer.toString('utf-8');
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        rows = parsed.data;
      } else {
        // XLS/XLSX
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<
          string,
          string
        >[];
      }
    } catch (err) {
      throw new HttpException(
        `Ошибка чтения файла: ${err}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const results: CreateProductDto[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];

    for (const row of rows) {
      try {
        const article = (
          row['Артикул'] ||
          row['артикул'] ||
          row['Article'] ||
          row['article'] ||
          row['SKU'] ||
          row['sku']
        )
          ?.toString()
          .trim();

        const name = (
          row['Название товара'] ||
          row['название товара'] ||
          row['Название'] ||
          row['название'] ||
          row['Name'] ||
          row['name'] ||
          row['Product Name'] ||
          row['product name']
        )
          ?.toString()
          .trim();

        if (!article || !name) {
          errors.push(
            `Пропущена строка: отсутствует артикул или название - ${JSON.stringify(
              row,
            )}`,
          );
          continue;
        }

        const priceStr = (
          row['Цена, руб.*'] ||
          row['Цена'] ||
          row['цена'] ||
          row['Price'] ||
          row['price']
        )
          ?.toString()
          .replace(/[^\d.,]/g, '')
          .replace(',', '.');

        const price =
          priceStr && !isNaN(Number(priceStr)) ? Number(priceStr) : undefined;

        const productData: CreateProductDto = {
          article,
          name,
          brand:
            (row['Бренд'] || row['бренд'] || row['Brand'] || row['brand'])
              ?.toString()
              .trim() || undefined,
          price,
          color:
            (row['Цвет'] || row['цвет'] || row['Color'] || row['color'])
              ?.toString()
              .trim() || undefined,
          country:
            (
              row['Страна-изготовитель'] ||
              row['страна-изготовитель'] ||
              row['Страна'] ||
              row['страна'] ||
              row['Country'] ||
              row['country']
            )
              ?.toString()
              .trim() || undefined,
        };

        // Проверяем на дубликаты
        const existing = await this.productsService.findByArticle(article);
        if (existing) {
          duplicates.push(`Продукт с артикулом ${article} уже существует`);
          continue;
        }

        await this.productsService.create(productData);
        results.push(productData);
      } catch (err) {
        errors.push(`Ошибка строки ${JSON.stringify(row)}: ${err}`);
      }
    }

    return {
      imported: results.length,
      errors: errors.length ? errors : undefined,
      duplicates: duplicates.length ? duplicates : undefined,
    };
  }
}

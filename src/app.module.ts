import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    // Подключаем .env и делаем глобальным
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Настройка TypeORM через ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASS'),
        database: configService.get<string>('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // В продакшене лучше использовать миграции
        logging: false,
      }),
    }),
    ProductsModule,
  ],
})
export class AppModule {}

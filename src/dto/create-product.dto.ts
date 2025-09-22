import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(100)
  article!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('products')
@Index(['article'], { unique: true })
export class ProductEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  article: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index()
  brand?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import { IsString, IsNotEmpty, IsInt, IsNumber, IsPositive, IsOptional, IsIn, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { RoomStatus } from '../../../infrastructure/database/entities/Room.entity';

/**
 * Body de `POST /rooms` (CA2, CA3): alta de una habitación.
 *
 * `categoryName` es el "tipo" (Doble, Suite, etc.). Si ya existe una categoría con ese nombre
 * (comparación case-insensitive) la habitación se suma a esa categoría tal cual está: para
 * cambiarle el precio o la capacidad a un tipo existente se usa `PATCH /rooms/:id` (CA4), así
 * evitamos que dar de alta una habitación más pise silenciosamente el precio de las demás.
 * `capacity`/`basePrice` solo se usan cuando el tipo es nuevo.
 */
export class CreateRoomDto {
  @Transform(({ value }) => value?.toString().trim())
  @IsString({ message: 'El número/nombre de la habitación debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El número/nombre de la habitación no puede estar vacío' })
  @MaxLength(20, { message: 'El número/nombre de la habitación es demasiado largo' })
  roomNumber!: string;

  @Transform(({ value }) => value?.toString().trim())
  @IsString({ message: 'El tipo de habitación debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El tipo de habitación no puede estar vacío' })
  @MaxLength(60, { message: 'El tipo de habitación es demasiado largo' })
  categoryName!: string;

  @IsInt({ message: 'La capacidad debe ser un número entero' })
  @IsPositive({ message: 'La capacidad debe ser un valor positivo' })
  capacity!: number;

  @IsNumber({}, { message: 'El precio base debe ser un número' })
  @IsPositive({ message: 'El precio base debe ser un valor positivo' })
  basePrice!: number;

  @IsOptional()
  @IsIn(Object.values(RoomStatus), { message: 'Estado inválido' })
  status?: RoomStatus;
}

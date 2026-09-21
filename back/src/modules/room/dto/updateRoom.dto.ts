import { IsString, IsNotEmpty, IsInt, IsNumber, IsPositive, IsOptional, IsIn, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { RoomStatus } from '../../../infrastructure/database/entities/Room.entity';

/**
 * Body de `PATCH /rooms/:id` (CA2, CA3, CA4): edición de una habitación existente.
 *
 * Todos los campos son opcionales. Si viene `categoryName` distinto al tipo actual, la
 * habitación pasa a esa categoría (buscándola o creándola, igual que en el alta). Si viene
 * `capacity` y/o `basePrice` sin cambiar el tipo, se actualiza el tipo actual de la habitación
 * (afecta a todas las habitaciones de ese mismo tipo): así es como el admin cambia el precio
 * base y el bot lo usa de inmediato (CA4).
 */
export class UpdateRoomDto {
  @IsOptional()
  @Transform(({ value }) => value?.toString().trim())
  @IsString({ message: 'El número/nombre de la habitación debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El número/nombre de la habitación no puede estar vacío' })
  @MaxLength(20, { message: 'El número/nombre de la habitación es demasiado largo' })
  roomNumber?: string;

  @IsOptional()
  @Transform(({ value }) => value?.toString().trim())
  @IsString({ message: 'El tipo de habitación debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El tipo de habitación no puede estar vacío' })
  @MaxLength(60, { message: 'El tipo de habitación es demasiado largo' })
  categoryName?: string;

  @IsOptional()
  @IsInt({ message: 'La capacidad debe ser un número entero' })
  @IsPositive({ message: 'La capacidad debe ser un valor positivo' })
  capacity?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El precio base debe ser un número' })
  @IsPositive({ message: 'El precio base debe ser un valor positivo' })
  basePrice?: number;

  @IsOptional()
  @IsIn(Object.values(RoomStatus), { message: 'Estado inválido' })
  status?: RoomStatus;
}

import { Type } from 'class-transformer';
import { IsDateString, IsInt, Min } from 'class-validator';

export class SearchAvailabilityDto {
  @IsDateString({}, { message: 'La fecha de entrada (checkIn) no es una fecha válida' })
  checkIn!: string;

  @IsDateString({}, { message: 'La fecha de salida (checkOut) no es una fecha válida' })
  checkOut!: string;

  @Type(() => Number)
  @IsInt({ message: 'La capacidad debe ser un número entero' })
  @Min(1, { message: 'La capacidad debe ser mayor a 0' })
  capacity!: number;
}

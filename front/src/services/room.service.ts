import apiClient from '@/config/api';
import type { RoomOption } from '@/config/types';

/**
 * Habitaciones para el selector del formulario de alta/edición manual.
 * El back resuelve la categoría (nombre, capacidad, precio) para no tener que
 * pedirla aparte acá.
 */
export const listRoomOptions = async (): Promise<RoomOption[]> => {
  const { data } = await apiClient.get<RoomOption[]>('/rooms');
  return data;
};

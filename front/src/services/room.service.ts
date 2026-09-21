import apiClient from '@/config/api';
import type { RoomFormData, RoomOption } from '@/config/types';

/**
 * Inventario completo (CA1) y habitaciones para el selector del formulario de alta/edición
 * manual de reservas. El back resuelve la categoría (nombre, capacidad, precio) para no tener
 * que pedirla aparte acá. Lectura abierta a cualquier usuario autenticado (ADMIN o EMPLOYEE).
 */
export const listRoomOptions = async (): Promise<RoomOption[]> => {
  const { data } = await apiClient.get<RoomOption[]>('/rooms');
  return data;
};

/** Alta de una habitación (CA2). Solo ADMIN. */
export const createRoom = async (payload: RoomFormData): Promise<RoomOption> => {
  const { data } = await apiClient.post<RoomOption>('/rooms', payload);
  return data;
};

/** Edición de una habitación, incluye cambio de precio base y de estado (CA2, CA4). Solo ADMIN. */
export const updateRoom = async (id: string, payload: Partial<RoomFormData>): Promise<RoomOption> => {
  const { data } = await apiClient.patch<RoomOption>(`/rooms/${id}`, payload);
  return data;
};

/** Baja segura (soft delete): el back cambia el estado a INACTIVE, nunca borra el registro (CA3). Solo ADMIN. */
export const deactivateRoom = async (id: string): Promise<void> => {
  await apiClient.delete(`/rooms/${id}`);
};

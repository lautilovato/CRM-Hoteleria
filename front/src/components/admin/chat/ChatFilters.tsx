import type { ChatListFilters, ChatSessionStatus } from '@/config/types';

interface ChatFiltersProps {
  filters: ChatListFilters;
  /** Cambia un filtro y resetea a página 1 (lo resuelve el hook). */
  onChange: (patch: Partial<ChatListFilters>) => void;
}

const STATUS_OPTIONS: { value: ChatSessionStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'WAITING_HUMAN', label: 'Esperando operador' },
  { value: 'HUMAN', label: 'Atendidas por un humano' },
  { value: 'BOT', label: 'Con el bot' },
];

const inputClasses =
  'w-full rounded-xl border border-goldLight/20 bg-surface px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60';

const toggleClasses = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-medium transition motion-reduce:transition-none ${
    active
      ? 'border-gold/60 bg-gold/15 text-goldLight'
      : 'border-goldLight/20 text-textMuted hover:bg-goldLight/10'
  }`;

/** Búsqueda y filtros de la bandeja de conversaciones. */
export default function ChatFilters({ filters, onChange }: ChatFiltersProps) {
  return (
    <div className="space-y-3 border-b border-goldLight/10 p-4">
      <input
        type="search"
        value={filters.search ?? ''}
        // El back corta la búsqueda en 60 caracteres: se limita acá para no comerse un 400.
        maxLength={60}
        onChange={(event) => onChange({ search: event.target.value })}
        placeholder="Buscar por nombre, usuario o ID de Telegram"
        className={inputClasses}
        aria-label="Buscar conversaciones"
      />

      <select
        value={filters.status ?? 'ALL'}
        onChange={(event) => onChange({ status: event.target.value as ChatSessionStatus | 'ALL' })}
        className={inputClasses}
        aria-label="Estado de la conversación"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={Boolean(filters.pendingHandover)}
          onClick={() => onChange({ pendingHandover: !filters.pendingHandover })}
          className={toggleClasses(Boolean(filters.pendingHandover))}
        >
          Piden un humano
        </button>
        <button
          type="button"
          aria-pressed={Boolean(filters.assignedToMe)}
          onClick={() => onChange({ assignedToMe: !filters.assignedToMe })}
          className={toggleClasses(Boolean(filters.assignedToMe))}
        >
          Mías
        </button>
      </div>
    </div>
  );
}

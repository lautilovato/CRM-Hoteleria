import { useState, type FormEvent, type KeyboardEvent } from 'react';

/** Mismo tope que el `MaxLength` del `SendChatMessageDto` del back. */
const MAX_LENGTH = 4000;

interface ChatComposerProps {
  /** Rechaza si el envío falló; el texto se conserva para poder reintentar. */
  onSend: (text: string) => Promise<void>;
  isSending: boolean;
  /** Avisa que escribir va a silenciar al bot (todavía no se tomó el control). */
  willTakeOver: boolean;
}

/** Compositor del operador (CA3): lo que se escribe acá llega al Telegram del huésped. */
export default function ChatComposer({ onSend, isSending, willTakeOver }: ChatComposerProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !isSending;

  const submit = async () => {
    if (!canSend) return;

    setError(null);
    try {
      await onSend(trimmed);
      setText('');
    } catch (err) {
      // El interceptor de axios ya dejó el detalle del back en `message` (p. ej. el 502
      // de Telegram). El texto no se borra: el mensaje no se guardó en ningún lado.
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje.');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-goldLight/10 p-4">
      {error && <p className="text-sm text-dangerText">⚠ {error}</p>}

      {willTakeOver && !error && (
        <p className="text-xs text-textMuted">Al enviar un mensaje vas a tomar el control y Chamber deja de responder.</p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          rows={2}
          placeholder="Escribí un mensaje… (Enter envía, Shift+Enter salta de línea)"
          className="flex-1 resize-none rounded-xl border border-goldLight/20 bg-surface px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          aria-label="Mensaje para el huésped"
        />

        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-gold px-4 py-2 text-sm font-medium text-shell transition hover:bg-goldLight disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          {isSending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>

      <p className="text-right text-[11px] text-textMuted tabular-nums">
        {text.length} / {MAX_LENGTH}
      </p>
    </form>
  );
}

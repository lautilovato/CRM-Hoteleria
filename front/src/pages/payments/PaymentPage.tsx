import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ReservationSummary } from '@/config/types';
import { getReservationSummary, goToCheckout, summaryToFormData } from '@/services/payment.service';
import PaymentForm from './PaymentForm';

/** Resultado de la última carga, junto al id al que corresponde. */
interface LoadState {
  id?: string;
  summary: ReservationSummary | null;
  error: string | null;
}

export default function PaymentPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const [load, setLoad] = useState<LoadState>({ summary: null, error: null });

  // Derivado en vez de un estado aparte: mientras lo cargado no sea de este id,
  // la pantalla sigue en "cargando" (incluso si el link cambia de reserva).
  const isLoading = Boolean(reservationId) && load.id !== reservationId;

  useEffect(() => {
    if (!reservationId) return;

    let isActive = true;

    getReservationSummary(reservationId)
      .then((data) => {
        if (isActive) setLoad({ id: reservationId, summary: data, error: null });
      })
      .catch((loadError: unknown) => {
        console.error('No se pudo cargar la reserva', loadError);
        if (isActive) {
          setLoad({
            id: reservationId,
            summary: null,
            error: 'No encontramos esa reserva. Revisá el link que te enviamos.',
          });
        }
      });

    // Descarta la respuesta si el efecto se vuelve a disparar (StrictMode / cambio de id).
    return () => {
      isActive = false;
    };
  }, [reservationId]);

  const { summary } = load;

  const handleConfirmedPayment = useCallback(() => {
    goToCheckout(summary?.initPoint ?? null);
  }, [summary]);

  if (!reservationId) {
    return (
      <StatusScreen
        title="Falta el código de reserva"
        detail="Entrá desde el link que te mandamos por Telegram para ver tu reserva."
      />
    );
  }

  if (isLoading) return <StatusScreen title="Cargando tu reserva…" />;

  if (load.error || !summary) {
    return (
      <StatusScreen
        title="No pudimos mostrar tu reserva"
        detail={load.error ?? 'Intentá de nuevo en unos minutos.'}
      />
    );
  }

  if (summary.status === 'CANCELLED') {
    return (
      <StatusScreen
        title="Esta reserva fue cancelada"
        detail="El tiempo para abonar la seña venció. Escribinos por Telegram para reservar de nuevo."
      />
    );
  }

  return (
    <PaymentForm
      reservation={summaryToFormData(summary)}
      alreadyPaid={summary.status === 'CONFIRMED'}
      onConfirmedPayment={handleConfirmedPayment}
    />
  );
}

function StatusScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-shell px-4">
      <div className="w-full max-w-md rounded-3xl border border-goldLight/25 bg-card p-8 text-center">
        <h1 className="font-poppins text-xl font-semibold text-goldLight">{title}</h1>
        {detail && <p className="mt-2 text-sm text-textMuted">{detail}</p>}
      </div>
    </div>
  );
}

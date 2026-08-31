import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppointmentLoading } from "../components/ui/AppointmentLoading";
import {
  findAppointmentByTokenInSupabase,
  updateAppointmentStatusByToken,
} from "../lib/appointmentsApi";
import { hasSupabaseConfig } from "../lib/supabaseClient";
import type { Appointment } from "../types/crm";

export function AppointmentConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const [appointment, setAppointment] = useState<Appointment | undefined>();
  const [done, setDone] = useState<"aceptada" | "rechazada" | null>(null);
  const [loading, setLoading] = useState(Boolean(token && hasSupabaseConfig));
  const [processingStatus, setProcessingStatus] = useState<"aceptada" | "rechazada" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!token || !hasSupabaseConfig) {
      setLoading(false);
      setError("La conexión con el sistema no está disponible.");
      return;
    }

    setLoading(true);
    void findAppointmentByTokenInSupabase(token)
      .then((result) => {
        if (!active) return;
        if (result) {
          setAppointment(result);
        }
      })
      .catch(() => {
        if (!active) return;
        setError("No pudimos consultar la cita en este momento.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleStatus = async (status: "aceptada" | "rechazada") => {
    if (!token || processingStatus) return;
    setError("");
    setProcessingStatus(status);

    try {
      if (hasSupabaseConfig) {
        const updated = await updateAppointmentStatusByToken(token, status);
        if (!updated) throw new Error("No se encontró la cita.");
        setAppointment(updated);
        setDone(status);
        return;
      }
      throw new Error("La conexión con el sistema no está disponible.");
    } catch {
      setError("No pudimos actualizar tu cita en este momento. Intenta nuevamente o contacta al negocio.");
    } finally {
      setProcessingStatus(null);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto mt-14 flex w-full max-w-xl justify-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl">
        <AppointmentLoading title="Cargando cita" message="Estamos revisando la información de tu cita y preparando la confirmación." mode="calendar" overlay={false} />
      </section>
    );
  }

  if (!token || !appointment) {
    return (
      <section className="mx-auto mt-14 w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 text-center">
        <h1 className="text-3xl font-semibold text-zinc-900">Enlace inválido</h1>
        <p className="mt-3 text-zinc-600">No encontramos una cita asociada a este enlace.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-14 w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 text-center">
      {processingStatus ? (
        <AppointmentLoading
          title={processingStatus === "aceptada" ? "Confirmando cita" : "Cancelando cita"}
          message={processingStatus === "aceptada" ? "Estamos registrando tu confirmación. No cierres esta ventana." : "Estamos registrando la cancelación de tu cita. No cierres esta ventana."}
          mode="calendar"
        />
      ) : null}

      <h1 className="text-3xl font-semibold text-zinc-900">Confirmación de cita</h1>
      <p className="mt-3 text-zinc-600">
        Cliente: <strong>{appointment.customerName}</strong><br />
        Servicio: <strong>{appointment.service}</strong><br />
        Fecha: <strong>{appointment.date}</strong> a las <strong>{appointment.start}</strong>
      </p>

      {error ? <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      {done ? (
        <div className={`mt-6 rounded-2xl p-4 ${done === "aceptada" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {done === "aceptada" ? "Tu cita fue aceptada correctamente." : "Tu cita fue rechazada correctamente."}
        </div>
      ) : (
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => void handleStatus("aceptada")}
            disabled={Boolean(processingStatus)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" /> {processingStatus === "aceptada" ? "Confirmando..." : "Confirmar cita"}
          </button>
          <button
            onClick={() => void handleStatus("rechazada")}
            disabled={Boolean(processingStatus)}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <XCircle className="h-4 w-4" /> {processingStatus === "rechazada" ? "Cancelando..." : "Cancelar cita"}
          </button>
        </div>
      )}
    </section>
  );
}

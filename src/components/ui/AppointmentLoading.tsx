import { CalendarCheck2, Database, Loader2, MailCheck } from "lucide-react";

interface AppointmentLoadingProps {
  title: string;
  message: string;
  mode?: "mail" | "calendar" | "database";
  overlay?: boolean;
}

export function AppointmentLoading({ title, message, mode = "calendar", overlay = true }: AppointmentLoadingProps) {
  const Icon = mode === "mail" ? MailCheck : mode === "database" ? Database : CalendarCheck2;
  const card = (
    <div className="appointment-loading-card relative w-full max-w-sm overflow-hidden rounded-3xl border p-6 text-center shadow-2xl">
      <div className="appointment-loader-glow" />
      <div className="appointment-loading-icon relative mx-auto grid h-16 w-16 place-items-center rounded-full">
        <Icon className="h-7 w-7" />
        <Loader2 className="appointment-loading-spinner absolute -right-1 -top-1 h-6 w-6 animate-spin" />
      </div>
      <h2 className="appointment-loading-title relative mt-4 text-xl font-semibold">{title}</h2>
      <p className="appointment-loading-message relative mt-2 text-sm leading-6">{message}</p>
      <div className="appointment-loading-track relative mt-5 h-1.5 overflow-hidden rounded-full">
        <div className="appointment-loader-bar h-full w-1/2 rounded-full" />
      </div>
    </div>
  );

  if (!overlay) return card;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/35 p-4 backdrop-blur-sm">
      {card}
    </div>
  );
}

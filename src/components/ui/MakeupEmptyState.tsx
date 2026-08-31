import { Brush, Frown, Sparkles } from "lucide-react";

interface MakeupEmptyStateProps {
  title?: string;
  message?: string;
  compact?: boolean;
}

export function MakeupEmptyState({
  title = "No encontramos resultados",
  message = "Prueba con otro nombre, correo o número de contacto.",
  compact = false,
}: MakeupEmptyStateProps) {
  return (
    <div className={`crm-empty-state mx-auto flex max-w-lg flex-col items-center px-5 text-center ${compact ? "py-6" : "py-12"}`}>
      <div className={`crm-empty-illustration relative grid place-items-center rounded-full ${compact ? "h-20 w-20" : "h-28 w-28"}`}>
        <Sparkles className={`absolute right-0 top-2 ${compact ? "h-4 w-4" : "h-6 w-6"}`} />
        <Brush className={`absolute -left-3 bottom-3 -rotate-12 ${compact ? "h-7 w-7" : "h-10 w-10"}`} />
        <div className={`crm-empty-face grid place-items-center rounded-full ${compact ? "h-12 w-12" : "h-16 w-16"}`}>
          <Frown className={compact ? "h-7 w-7" : "h-9 w-9"} />
        </div>
      </div>
      <h3 className={`${compact ? "mt-3 text-sm" : "mt-5 text-lg"} font-semibold`}>{title}</h3>
      <p className={`${compact ? "mt-1 text-xs leading-5" : "mt-2 text-sm leading-6"}`}>{message}</p>
    </div>
  );
}

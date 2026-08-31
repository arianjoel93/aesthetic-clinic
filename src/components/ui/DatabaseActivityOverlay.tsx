import { useEffect, useRef, useState } from "react";
import {
  databaseActivityEvent,
  getActiveDatabaseRequestCount,
} from "../../lib/supabaseClient";
import { AppointmentLoading } from "./AppointmentLoading";

export function DatabaseActivityOverlay() {
  const [activeRequests, setActiveRequests] = useState(getActiveDatabaseRequestCount);
  const [visible, setVisible] = useState(activeRequests > 0);
  const visibleSince = useRef(activeRequests > 0 ? Date.now() : 0);
  const visibleRef = useRef(visible);

  useEffect(() => {
    const update = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count ?? 0);
      setActiveRequests(Math.max(0, count));
    };
    window.addEventListener(databaseActivityEvent, update);
    setActiveRequests(getActiveDatabaseRequestCount());
    return () => window.removeEventListener(databaseActivityEvent, update);
  }, []);

  useEffect(() => {
    let timeout: number | undefined;
    if (activeRequests > 0) {
      if (!visibleRef.current) visibleSince.current = Date.now();
      visibleRef.current = true;
      setVisible(true);
    } else if (visibleRef.current) {
      const remaining = Math.max(0, 420 - (Date.now() - visibleSince.current));
      timeout = window.setTimeout(() => {
        visibleRef.current = false;
        setVisible(false);
      }, remaining);
    }
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [activeRequests]);

  if (!visible) return null;

  return (
    <AppointmentLoading
      title="Cargando información"
      message="Estamos consultando los datos más recientes del sistema."
      mode="database"
    />
  );
}

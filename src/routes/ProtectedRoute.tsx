import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { buildCloudSessionFromSupabaseUser, buildSessionFromSupabaseUser } from "../lib/auth";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { useCrmStore } from "../store/crmStore";

const SESSION_CHECK_TIMEOUT_MS = 8_000;

export function ProtectedRoute() {
  const session = useCrmStore((state) => state.session);
  const setSession = useCrmStore((state) => state.setSession);
  const logout = useCrmStore((state) => state.logout);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      logout();
      setIsChecking(false);
      return undefined;
    }

    let mounted = true;
    let activeUserId: string | null = null;
    const validationTimeout = window.setTimeout(() => {
      if (!mounted) return;
      activeUserId = null;
      setSession(null);
      setIsChecking(false);
    }, SESSION_CHECK_TIMEOUT_MS);

    const applyUser = (user: User | null) => {
      if (!mounted) return;
      window.clearTimeout(validationTimeout);
      activeUserId = user?.id ?? null;

      if (!user) {
        setSession(null);
        setIsChecking(false);
        return;
      }

      // La carga opcional del avatar no debe detener el acceso a la aplicación.
      setSession(buildSessionFromSupabaseUser(user));
      setIsChecking(false);

      void buildCloudSessionFromSupabaseUser(user)
        .then((cloudSession) => {
          if (mounted && activeUserId === user.id) setSession(cloudSession);
        })
        .catch(() => {
          // La sesión autenticada continúa aunque el avatar no esté disponible.
        });
    };

    void supabase.auth
      .getSession()
      .then(({ data, error }) => applyUser(error ? null : (data.session?.user ?? null)))
      .catch(() => applyUser(null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      // Evita llamadas asíncronas dentro del bloqueo interno de autenticación.
      applyUser(authSession?.user ?? null);
    });

    return () => {
      mounted = false;
      window.clearTimeout(validationTimeout);
      listener.subscription.unsubscribe();
    };
  }, [logout, setSession]);

  if (isChecking) {
    return <div className="grid min-h-screen place-items-center bg-[#fbf9fb] text-sm text-zinc-500">Validando sesión...</div>;
  }

  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

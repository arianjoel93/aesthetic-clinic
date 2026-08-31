import { ArrowRight, Bell, Boxes, Eye, EyeClosed, KanbanSquare, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { buildSessionFromSupabaseUser } from "../lib/auth";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { useCrmStore } from "../store/crmStore";

interface LoginForm {
  email: string;
  password: string;
}

const sandParticles = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  left: `${3 + ((i * 3.4) % 94)}%`,
  delay: `${(i % 11) * 0.55}s`,
  duration: `${4.8 + (i % 8) * 0.7}s`,
  size: `${2 + (i % 5)}px`,
}));

const LOGIN_TIMEOUT_MS = 15_000;

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useCrmStore((state) => state.setSession);
  const companyName = useCrmStore((state) => state.companyName);
  const { register, handleSubmit } = useForm<LoginForm>({ defaultValues: { email: "", password: "" } });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (values: LoginForm) => {
    setMessage("");
    if (!hasSupabaseConfig || !supabase) {
      setSession(null);
      setMessage("Falta configurar la llave pública de Supabase para iniciar sesión.");
      return;
    }

    setIsLoading(true);
    let timeoutId: number | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("LOGIN_TIMEOUT")),
          LOGIN_TIMEOUT_MS,
        );
      });
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({
          email: values.email.trim(),
          password: values.password,
        }),
        timeout,
      ]);

      if (error || !data.user) {
        setSession(null);
        setMessage("Correo o contraseña incorrectos, o el usuario no existe en Supabase.");
        return;
      }

      setSession(buildSessionFromSupabaseUser(data.user));
      navigate("/app/panel-general");
    } catch (error) {
      setSession(null);
      setMessage(
        error instanceof Error && error.message === "LOGIN_TIMEOUT"
          ? "La validación está tardando más de lo esperado. Revisa tu conexión e intenta nuevamente."
          : "No fue posible validar la sesión. Revisa tu conexión e intenta nuevamente.",
      );
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const input = document.getElementById("password") as HTMLInputElement | null;
    if (input) input.type = showPassword ? "text" : "password";
  }, [showPassword]);

  return (
    <div className="login-page-bg grid min-h-screen items-center gap-4 overflow-hidden p-3 lg:grid-cols-[1.04fr_0.96fr] lg:p-5">
      <section className="login-sand-panel hidden h-[calc(100vh-2.5rem)] min-h-0 flex-col justify-between rounded-[38px] p-7 text-white shadow-2xl lg:flex xl:p-9">
        <div className="login-sand-orb login-sand-orb-a" />
        <div className="login-sand-orb login-sand-orb-b" />
        <div className="login-sand-wave login-sand-wave-a" />
        <div className="login-sand-wave login-sand-wave-b" />
        <div className="login-sand-wave login-sand-wave-c" />

        <div className="login-sand-particles" aria-hidden="true">
          {sandParticles.map((particle) => (
            <span
              key={particle.id}
              className="login-sand-particle"
              style={{
                left: particle.left,
                animationDelay: particle.delay,
                animationDuration: particle.duration,
                width: particle.size,
                height: particle.size,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.28em] text-stone-200 backdrop-blur">
            <Sparkles className="h-4 w-4 text-rose-200" /> CRM inteligente
          </div>
          <div className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs text-stone-300 backdrop-blur">Belleza que conecta</div>
        </div>

        <div className="relative z-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.36em] text-rose-100/80">{companyName || "CRM"}</p>
          <h1 className="mt-5 text-5xl font-black leading-[0.93] tracking-[-0.06em] text-white xl:text-7xl">Control elegante para una operación impecable.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-stone-300 xl:text-lg xl:leading-8">Gestiona clientas, citas, servicios, POS y notificaciones en una sola plataforma moderna, segura y lista para crecer.</p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[
            { icon: Boxes, label: "Módulos", value: "360°" },
            { icon: KanbanSquare, label: "Indicadores", value: "Tiempo real" },
            { icon: Bell, label: "Alertas", value: "Inteligentes" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="login-feature-card rounded-[26px] border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
              <Icon className="h-9 w-auto text-rose-100" />
              <p className="mt-5 text-lg font-semibold text-white">{value}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-300">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-xl">
        <Card className="login-card border-white/70 bg-white/82 p-6 shadow-[0_30px_90px_rgba(63,45,45,0.14)] backdrop-blur-xl md:p-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-rose-500">Acceso seguro</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-zinc-950">Inicio de sesión</h2>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-950 text-white shadow-lg shadow-zinc-900/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-800">Correo</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-300" />
                <Input className="border-zinc-200 bg-white/90 py-3.5 pl-11 shadow-sm focus:border-rose-300 focus:ring-4 focus:ring-rose-100" type="email" autoComplete="email" placeholder="usuario@empresa.com" {...register("email", { required: true })} />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-800">Contraseña</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-300" />
                <Input id="password" className="border-zinc-200 bg-white/90 py-3.5 pl-11 pr-11 shadow-sm focus:border-rose-300 focus:ring-4 focus:ring-rose-100" type="password" autoComplete="current-password" placeholder="Ingresa tu contraseña" {...register("password", { required: true })} />
                <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeClosed className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {message ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p> : null}
            <Button className="login-submit-btn w-full rounded-2xl bg-zinc-950 py-3.5 text-white shadow-xl shadow-zinc-900/15 hover:bg-zinc-800" type="submit" disabled={isLoading}>
              {isLoading ? "Validando..." : "Entrar al panel"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Conexión protegida con Supabase Auth
          </div>
        </Card>
      </section>
    </div>
  );
}

import { Palette, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { applyAppTheme, getJsonSetting, getSetting, setJsonSetting, setSetting, type AppTheme, type ModuleLockKey, type ModuleLockMap } from "../lib/appSettings";
import { buildCloudSessionFromSupabaseUser } from "../lib/auth";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { useCrmStore } from "../store/crmStore";
import { isValidPin, sha256 } from "../utils/security";
import { showActionSuccess } from "../utils/appAlert";

const moduleOptions: Array<{ key: ModuleLockKey; label: string; description: string }> = [
  { key: "agenda", label: "Citas", description: "Oculta el botón Nueva cita." },
  { key: "clientes", label: "Clientes", description: "Oculta el botón Nuevo cliente." },
  { key: "servicios", label: "Servicios", description: "Oculta el botón Nuevo servicio." },
  { key: "tratamientos", label: "Tratamientos", description: "Bloquea acciones nuevas del módulo." },
  { key: "seguimientos", label: "Seguimientos", description: "Bloquea acciones nuevas del módulo." },
  { key: "ventas-cotizaciones", label: "Ventas y cotizaciones", description: "Bloquea acciones nuevas del módulo." },
  { key: "reportes", label: "Reportes", description: "Bloquea acciones nuevas del módulo." },
  { key: "usuarios", label: "Usuarios", description: "Bloquea acciones nuevas del módulo." },
];

const themeOptions: Array<{ key: AppTheme; name: string; description: string; swatches: string[] }> = [
  { key: "makeup", name: "Makeup Artist", description: "Rosa elegante, luz suave y estética beauty.", swatches: ["#f43f83", "#fff7fb", "#18181b"] },
  { key: "dark", name: "Dark", description: "Oscuro moderno con contraste alto y acentos premium.", swatches: ["#111827", "#38bdf8", "#f8fafc"] },
  { key: "terra", name: "Terra", description: "Minimalista, cálido, tierra, arcilla y arena.", swatches: ["#b45309", "#f7efe7", "#3f2f24"] },
  { key: "sea", name: "Sea", description: "Azules marinos, fresco, limpio y sofisticado.", swatches: ["#0e7490", "#ecfeff", "#083344"] },
];

function SwitchRow({ checked, onChange, title, description }: { checked: boolean; onChange: () => void; title: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button type="button" onClick={onChange} className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-rose-500" : "bg-zinc-300"}`} aria-pressed={checked}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const session = useCrmStore((state) => state.session);
  const globalCompanyName = useCrmStore((state) => state.companyName);
  const setSession = useCrmStore((state) => state.setSession);
  const updateProfile = useCrmStore((state) => state.updateProfile);
  const updateCompanyName = useCrmStore((state) => state.updateCompanyName);

  const [companyName, setCompanyName] = useState(session?.companyName ?? globalCompanyName);
  const [moduleLocks, setModuleLocks] = useState<ModuleLockMap>({});
  const [savedModuleLocks, setSavedModuleLocks] = useState<ModuleLockMap>({});
  const [theme, setTheme] = useState<AppTheme>("makeup");
  const [posPin, setPosPin] = useState("");
  const [posPinConfirm, setPosPinConfirm] = useState("");
  const [posPinConfigured, setPosPinConfigured] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getJsonSetting<ModuleLockMap>("module_admin_locks", {}).then((locks) => {
      setModuleLocks(locks);
      setSavedModuleLocks(locks);
    });
    void getSetting("app_theme").then(async (value) => {
      const nextTheme = (value || "makeup") as AppTheme;
      setTheme(nextTheme);
      applyAppTheme(nextTheme);
      if (!value) await setSetting("app_theme", nextTheme);
    });
    void getSetting("company_name").then((value) => {
      const cloudCompanyName = value ?? "";
      setCompanyName(cloudCompanyName);
      updateCompanyName(cloudCompanyName);
    });

    if (hasSupabaseConfig && supabase) {
      void getSetting("pos_pin_hash").then((value) => setPosPinConfigured(Boolean(value)));
      void supabase.auth.getUser().then(async ({ data }) => {
        const user = data.user;
        if (!user) return;
        setSession(await buildCloudSessionFromSupabaseUser(user));
      });
    }
  }, [globalCompanyName, setSession, updateCompanyName]);

  const saveCompany = async () => {
    if (!hasSupabaseConfig || !supabase) {
      setMessage("No hay conexión con la base de datos.");
      return;
    }
    try {
      await setSetting("company_name", companyName);
      const { data: current } = await supabase.auth.getUser();
      const metadata = current.user?.user_metadata ?? {};
      const { data, error } = await supabase.auth.updateUser({ data: { ...metadata, company_name: companyName } });
      if (error) throw error;
      if (data.user) setSession(await buildCloudSessionFromSupabaseUser(data.user));
      updateCompanyName(companyName);
      updateProfile({ companyName });
      setMessage("Nombre de empresa actualizado.");
      await showActionSuccess("Empresa actualizada", "El nombre se guardó correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el nombre de la empresa.");
    }
  };

  const toggleModuleLock = (key: ModuleLockKey) => {
    const next = { ...moduleLocks, [key]: !moduleLocks[key] };
    setModuleLocks(next);
  };

  const saveModuleLocks = async () => {
    await setJsonSetting("module_admin_locks", moduleLocks);
    setSavedModuleLocks(moduleLocks);
    window.dispatchEvent(new CustomEvent("crm-settings-updated"));
    setMessage("Acceso a módulos guardado correctamente.");
    await showActionSuccess("Configuración guardada", "Los accesos a módulos se actualizaron correctamente.");
  };

  const selectTheme = async (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    applyAppTheme(nextTheme);
    await setSetting("app_theme", nextTheme);
    window.dispatchEvent(new CustomEvent("crm-settings-updated"));
    setMessage(`Tema ${themeOptions.find((item) => item.key === nextTheme)?.name ?? nextTheme} aplicado.`);
  };

  const savePosPin = async () => {
    if (!isValidPin(posPin) || posPin !== posPinConfirm) {
      setMessage("El PIN POS debe tener exactamente 4 dígitos y coincidir en ambos campos.");
      return;
    }
    const hashedPin = await sha256(posPin);
    await setSetting("pos_pin_hash", hashedPin);
    setPosPin("");
    setPosPinConfirm("");
    setPosPinConfigured(true);
    setMessage("PIN de POS actualizado.");
    await showActionSuccess("PIN de POS actualizado", "El nuevo PIN se guardó correctamente.");
  };

  const moduleLocksChanged = JSON.stringify(moduleLocks) !== JSON.stringify(savedModuleLocks);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Configuraciones</h1>
        <p className="text-lg text-zinc-500">Empresa, módulos, temas visuales y PIN de Punto de Venta.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-xl font-semibold text-zinc-900">Empresa</h2>
          <p className="mt-2 text-sm text-zinc-500">Este nombre se muestra en el login y en el sidebar.</p>
          <div className="mt-4 space-y-3">
            <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nombre de la empresa</label><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></div>
            <Button variant="secondary" onClick={saveCompany}><Save className="h-4 w-4" /> Guardar empresa</Button>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-rose-500" /><h2 className="text-xl font-semibold text-zinc-900">PIN del punto de venta</h2></div>
          <p className="text-sm text-zinc-500">{posPinConfigured ? "PIN configurado. Puedes actualizarlo cuando lo necesites." : "Configura un PIN de 4 dígitos para abrir, cerrar y desbloquear el POS."}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nuevo PIN</label><Input inputMode="numeric" type="password" maxLength={4} value={posPin} onChange={(event) => setPosPin(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Confirmar PIN</label><Input inputMode="numeric" type="password" maxLength={4} value={posPinConfirm} onChange={(event) => setPosPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
          </div>
          <Button className="mt-3" variant="secondary" onClick={savePosPin}><Save className="h-4 w-4" /> Guardar PIN del POS</Button>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-rose-500" /><h2 className="text-xl font-semibold text-zinc-900">Acceso a módulos solo para administradores</h2></div>
        <p className="mb-4 text-sm text-zinc-500">Al activar un interruptor se oculta el botón Nuevo de ese módulo. El POS permanece siempre disponible. Presiona Guardar cambios para aplicarlo.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {moduleOptions.map((item) => <SwitchRow key={item.key} checked={Boolean(moduleLocks[item.key])} onChange={() => toggleModuleLock(item.key)} title={item.label} description={item.description} />)}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {moduleLocksChanged ? <span className="text-sm text-amber-600">Tienes cambios sin guardar.</span> : <span className="text-sm text-zinc-500">Cambios guardados.</span>}
          <Button onClick={saveModuleLocks} disabled={!moduleLocksChanged}><Save className="h-4 w-4" /> Guardar cambios</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2"><Palette className="h-5 w-5 text-rose-500" /><h2 className="text-xl font-semibold text-zinc-900">Paleta y tema de la app</h2></div>
        <p className="mb-4 text-sm text-zinc-500">Cambia el estilo visual sin alterar el funcionamiento de la plataforma.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {themeOptions.map((item) => (
            <button key={item.key} type="button" onClick={() => void selectTheme(item.key)} className={`rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${theme === item.key ? "border-rose-400 bg-rose-50" : "border-zinc-200 bg-white"}`}>
              <div className="mb-4 flex gap-2">{item.swatches.map((color) => <span key={color} className="h-8 w-8 rounded-full border border-white shadow" style={{ backgroundColor: color }} />)}</div>
              <p className="text-base font-semibold text-zinc-900">{item.name}</p>
              <p className="mt-1 text-sm text-zinc-500">{item.description}</p>
            </button>
          ))}
        </div>
      </Card>

      {message ? <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">{message}</p> : null}
    </section>
  );
}

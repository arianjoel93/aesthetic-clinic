import { History, KeyRound, Mail, Save, ShieldAlert, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { appendChangeHistory, getJsonSetting, getSetting, setSetting, type ChangeHistoryItem } from "../lib/appSettings";
import { buildCloudSessionFromSupabaseUser } from "../lib/auth";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { useCrmStore } from "../store/crmStore";
import { isValidPin, sha256 } from "../utils/security";
import { showActionSuccess } from "../utils/appAlert";

async function optimizeAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 350;
  canvas.height = 350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar la imagen.");
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, (bitmap.width - sourceSize) / 2);
  const sourceY = Math.max(0, (bitmap.height - sourceSize) / 2);
  context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 350, 350);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo convertir la imagen a WebP.")), "image/webp", 0.86);
  });
}

export function ProfilePage() {
  const session = useCrmStore((state) => state.session);
  const setSession = useCrmStore((state) => state.setSession);
  const updateProfile = useCrmStore((state) => state.updateProfile);

  const [firstName, setFirstName] = useState(session?.firstName ?? "");
  const [lastName, setLastName] = useState(session?.lastName ?? "");
  const [address, setAddress] = useState(session?.address ?? "");
  const [avatarUrl, setAvatarUrl] = useState(session?.avatarUrl ?? "");
  const [avatarPath, setAvatarPath] = useState(session?.avatarPath ?? "");
  const [email, setEmail] = useState(session?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [adminPinConfirm, setAdminPinConfirm] = useState("");
  const [pinConfigured, setPinConfigured] = useState(false);
  const [history, setHistory] = useState<ChangeHistoryItem[]>([]);
  const [message, setMessage] = useState("");

  const addHistory = async (title: string, detail: string) => {
    const next = await appendChangeHistory({ title, detail, userEmail: email || session?.email });
    setHistory(next);
  };

  useEffect(() => {
    void Promise.all([getSetting("admin_access_pin_hash"), getSetting("admin_pin_requires_change")])
      .then(([hash, requiresChange]) => setPinConfigured(Boolean(hash) && requiresChange !== "true"));
    void getJsonSetting<ChangeHistoryItem[]>("profile_change_history", []).then(setHistory);

    if (!hasSupabaseConfig || !supabase) return;

    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const metadata = user.user_metadata ?? {};
      const cloudSession = await buildCloudSessionFromSupabaseUser(user);
      setEmail(user.email ?? "");
      setFirstName((metadata.first_name as string) || session?.firstName || "");
      setLastName((metadata.last_name as string) || session?.lastName || "");
      setAddress((metadata.address as string) || "");
      setAvatarPath((metadata.avatar_path as string) || "");
      setAvatarUrl(cloudSession.avatarUrl ?? "");
      setSession(cloudSession);
    });
  }, [session?.email, session?.firstName, session?.lastName, setSession]);

  const saveProfile = async () => {
    const fullName = `${firstName} ${lastName}`.trim();
    const patch = { firstName, lastName, name: fullName, address, avatarUrl, avatarPath };

    if (hasSupabaseConfig && supabase) {
      const { data: current } = await supabase.auth.getUser();
      const metadata = current.user?.user_metadata ?? {};
      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...metadata,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          address,
          avatar_url: null,
          avatar_path: avatarPath || null,
        },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.user) setSession(await buildCloudSessionFromSupabaseUser(data.user));
    }

    updateProfile(patch);
    await addHistory("Perfil actualizado", "Se actualizaron datos personales del administrador.");
    setMessage("Perfil actualizado.");
    await showActionSuccess("Perfil guardado", "Los datos del administrador se actualizaron correctamente.");
  };

  const savePassword = async () => {
    if (!password || password !== passwordConfirm) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    if (!hasSupabaseConfig || !supabase) {
      setMessage("No hay conexión con la base de datos.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    await addHistory("Contraseña actualizada", "Se cambió la contraseña del usuario autenticado.");
    setMessage("Contraseña actualizada correctamente.");
    await showActionSuccess("Contraseña actualizada", "La nueva contraseña se guardó correctamente.");
  };

  const saveAdminPin = async () => {
    if (!isValidPin(adminPin) || adminPin !== adminPinConfirm) {
      setMessage("El PIN admin debe tener exactamente 4 dígitos y coincidir en ambos campos.");
      return;
    }
    await setSetting("admin_access_pin_hash", await sha256(adminPin));
    await setSetting("admin_pin_requires_change", "false");
    setAdminPin("");
    setAdminPinConfirm("");
    setPinConfigured(true);
    await addHistory("PIN admin actualizado", "Se actualizó el PIN para entrar a Mi perfil y Configuraciones.");
    setMessage("PIN admin actualizado.");
    await showActionSuccess("PIN actualizado", "El PIN administrativo se guardó correctamente.");
  };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Mi perfil</h1>
        <p className="text-lg text-zinc-500">Ajustes personales, seguridad e historial de cambios.</p>
      </div>

      {!pinConfigured ? (
        <div className="max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="mr-2 inline h-4 w-4" /> El PIN administrativo está usando el valor predeterminado <strong>0000</strong>. Cámbialo para proteger Mi perfil y Configuraciones.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <h2 className="text-xl font-semibold text-zinc-900">Datos del administrador</h2>
          <p className="mt-2 text-sm text-zinc-500">Actualiza tu foto, nombre, correo visible y dirección.</p>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-5 md:w-56">
              {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-28 w-28 rounded-full object-cover" /> : <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-xl text-zinc-500">NA</div>}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                <Upload className="h-4 w-4" /> Subir imagen
                <input type="file" accept="image/*" className="hidden" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file || !supabase) return;
                  try {
                    const { data } = await supabase.auth.getUser();
                    if (!data.user) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
                    const blob = await optimizeAvatar(file);
                    const path = `${data.user.id}/avatar.webp`;
                    const { error: uploadError } = await supabase.storage.from("admin-avatars").upload(path, blob, { contentType: "image/webp", upsert: true });
                    if (uploadError) throw uploadError;
                    const { data: signed, error: signedError } = await supabase.storage.from("admin-avatars").createSignedUrl(path, 60 * 60);
                    if (signedError) throw signedError;
                    setAvatarPath(path);
                    setAvatarUrl(signed.signedUrl);
                    setMessage("Imagen procesada y guardada. Presiona Guardar perfil para asociarla a tu cuenta.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "No se pudo guardar la imagen de perfil.");
                  }
                }} />
              </label>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nombre</label><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></div>
                <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Apellidos</label><Input value={lastName} onChange={(event) => setLastName(event.target.value)} /></div>
              </div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Correo electrónico</label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="pl-10" value={email} readOnly /></div></div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Dirección</label><Textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Dirección del administrador" /></div>
              <Button onClick={saveProfile}><Save className="h-4 w-4" /> Guardar perfil</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-xl font-semibold text-zinc-900">Seguridad</h2>
            <p className="mt-2 text-sm text-zinc-500">Cambia la contraseña del usuario autenticado en Supabase.</p>
            <div className="mt-4 space-y-3">
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nueva contraseña</label><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Confirmar contraseña</label><Input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} /></div>
              <Button onClick={savePassword}><KeyRound className="h-4 w-4" /> Guardar contraseña</Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold text-zinc-900">PIN administrativo</h2>
            <p className="mt-2 text-sm text-zinc-500">Este PIN protege Mi perfil y Configuraciones. Su valor predeterminado es 0000.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nuevo PIN</label><Input inputMode="numeric" type="password" maxLength={4} value={adminPin} onChange={(event) => setAdminPin(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Confirmar PIN</label><Input inputMode="numeric" type="password" maxLength={4} value={adminPinConfirm} onChange={(event) => setAdminPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
            </div>
            <Button className="mt-3" variant="secondary" onClick={saveAdminPin}><Save className="h-4 w-4" /> Guardar PIN administrativo</Button>
          </Card>
        </div>
      </div>

      <Card className="max-w-5xl">
        <div className="mb-4 flex items-center gap-2"><History className="h-5 w-5 text-rose-500" /><h2 className="text-xl font-semibold text-zinc-900">Historial de cambios</h2></div>
        <div className="space-y-2">
          {history.length === 0 ? <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">Todavía no hay cambios registrados.</p> : history.map((item) => (
            <article key={item.id} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-zinc-900">{item.title}</p><span className="text-xs text-zinc-500">{new Date(item.at).toLocaleString("es-MX")}</span></div>
              <p className="mt-1 text-zinc-600">{item.detail}</p>
              {item.userEmail ? <p className="mt-1 text-xs text-zinc-400">Usuario: {item.userEmail}</p> : null}
            </article>
          ))}
        </div>
      </Card>

      {message ? <p className="max-w-5xl rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">{message}</p> : null}
    </section>
  );
}

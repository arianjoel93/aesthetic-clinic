import { Edit3, RefreshCcw, Save, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { MakeupEmptyState } from "../components/ui/MakeupEmptyState";
import { Select } from "../components/ui/Select";
import { listServices, saveService, setServiceActive } from "../lib/servicesApi";
import { useCrmStore } from "../store/crmStore";
import type { Service } from "../types/crm";
import { fireAppAlert, showActionCancelled, showActionSuccess } from "../utils/appAlert";
import { getDemoLimitNotice, isDemoEmail } from "../utils/demoAccess";

const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value || 0);

const emptyForm = {
  id: "",
  name: "",
  category: "",
  description: "",
  price: "0",
  active: true,
};

export function ServicesPage() {
  const session = useCrmStore((state) => state.session);
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const query = searchParams.get("q") ?? "";
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [form, setForm] = useState(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const isDemoAccount = isDemoEmail(session?.email);

  const loadServices = async () => {
    setLoading(true);
    setMessage("");
    try {
      setServices(await listServices());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar los servicios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadServices();
  }, []);

  useEffect(() => {
    if (searchParams.get("nuevo") === "1") {
      setForm(emptyForm);
      setIsModalOpen(true);
    }
  }, [searchParams]);

  const filteredServices = useMemo(
    () =>
      services.filter((service) => {
        const text = `${service.name} ${service.category ?? ""} ${service.description ?? ""}`.toLowerCase();
        const matchesQuery = !query || text.includes(query.toLowerCase());
        const matchesActive = activeFilter === "Todos" || (activeFilter === "Activos" ? service.active : !service.active);
        return matchesQuery && matchesActive;
      }),
    [activeFilter, query, services],
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(services.map((service) => service.category?.trim()).filter((category): category is string => Boolean(category))))
        .sort((a, b) => a.localeCompare(b, "es")),
    [services],
  );

  const setServiceQuery = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const closeModal = () => {
    setForm(emptyForm);
    setIsModalOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
  };

  const cancelModal = async () => {
    closeModal();
    await showActionCancelled("El formulario del servicio se cerró sin guardar cambios.");
  };

  const editService = (service: Service) => {
    if (isDemoAccount && service.isShared) {
      void fireAppAlert({
        title: "Servicio del catálogo base",
        text: "Puedes consultar y utilizar este servicio, pero una cuenta demo no puede modificar el catálogo base.",
        icon: "info",
        confirmButtonText: "Entendido",
      });
      return;
    }
    setForm({
      id: service.id,
      name: service.name,
      category: service.category ?? "",
      description: service.description ?? "",
      price: String(service.price ?? 0),
      active: service.active,
    });
    setIsModalOpen(true);
  };

  const submitService = async () => {
    setMessage("");
    const wasEditing = Boolean(form.id);
    if (!form.name.trim()) {
      setMessage("El nombre del servicio es obligatorio.");
      return;
    }
    const price = Number(form.price || 0);
    if (Number.isNaN(price) || price < 0) {
      setMessage("El precio debe ser mayor o igual a cero.");
      return;
    }

    try {
      const saved = await saveService({
        id: form.id || undefined,
        name: form.name,
        category: form.category,
        description: form.description,
        price,
        active: form.active,
      });
      setServices((prev) => {
        const exists = prev.some((service) => service.id === saved.id);
        return exists ? prev.map((service) => (service.id === saved.id ? saved : service)) : [saved, ...prev];
      });
      closeModal();
      setMessage("Servicio guardado correctamente.");
      await showActionSuccess(wasEditing ? "Servicio actualizado" : "Servicio guardado", "La información se guardó correctamente.");
    } catch (error) {
      const demoLimit = getDemoLimitNotice(error);
      const text = demoLimit?.message ?? (error instanceof Error ? error.message : "No se pudo guardar el servicio.");
      setMessage(text);
      if (demoLimit) {
        await fireAppAlert({
          title: demoLimit.title,
          text: demoLimit.message,
          icon: "info",
          confirmButtonText: "Entendido",
        });
      }
    }
  };

  const toggleService = async (service: Service) => {
    if (isDemoAccount && service.isShared) {
      await fireAppAlert({
        title: "Servicio del catálogo base",
        text: "Puedes consultar y utilizar este servicio, pero una cuenta demo no puede cambiar su estado.",
        icon: "info",
        confirmButtonText: "Entendido",
      });
      return;
    }
    setMessage("");
    try {
      const updated = await setServiceActive(service.id, !service.active);
      setServices((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(updated.active ? "Servicio activado correctamente." : "Servicio desactivado correctamente.");
      await showActionSuccess(updated.active ? "Servicio activado" : "Servicio desactivado", "El estado se actualizó correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el servicio.");
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Servicios</h1>
          <p className="text-sm text-zinc-500">Catálogo conectado al Punto de Venta.</p>
        </div>
        <Button variant="secondary" onClick={loadServices}>
          <RefreshCcw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {message ? <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div> : null}

      <Card>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input value={query} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Buscar por nombre, categoría o descripción" className="pl-10" />
          </div>
          <Select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
            <option>Todos</option>
            <option>Activos</option>
            <option>Inactivos</option>
          </Select>
        </div>

        {!loading && filteredServices.length === 0 ? (
          <div className="md:hidden"><MakeupEmptyState compact title="No encontramos servicios" message="Prueba con otro nombre, categoría o descripción." /></div>
        ) : null}
        <div className="space-y-2 md:hidden">
          {filteredServices.map((service) => (
            <article key={`mobile-${service.id}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900">{service.name}</p><p className="text-xs text-zinc-500">{service.category || "Sin categoría"}</p></div><p className="shrink-0 text-sm text-zinc-800">{money(service.price)}</p></div>
              <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{service.description || "Sin descripción"}</p>
              <div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => editService(service)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600"><Edit3 className="h-3.5 w-3.5" /> Editar</button><button type="button" onClick={() => void toggleService(service)} className={`relative h-7 w-12 rounded-full transition ${service.active ? "bg-emerald-500" : "bg-zinc-300"}`} aria-pressed={service.active} title={service.active ? "Desactivar servicio" : "Activar servicio"}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${service.active ? "left-6" : "left-1"}`} /></button></div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="py-2">Servicio</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Estado</th>
                <th>Descripción</th>
                <th className="w-[150px] text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.length === 0 ? (
                <tr><td colSpan={6}>{loading ? null : <MakeupEmptyState compact title="No encontramos servicios" message="Prueba con otro nombre, categoría o descripción." />}</td></tr>
              ) : (
                filteredServices.map((service) => (
                  <tr key={service.id} className="border-b border-zinc-100 align-middle">
                    <td className="py-3 pr-4 font-semibold text-zinc-900">{service.name}</td>
                    <td className="pr-4">{service.category || "Sin categoría"}</td>
                    <td className="pr-4">{money(service.price)}</td>
                    <td className="pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${service.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                        {service.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate pr-4 text-zinc-500">{service.description || "Sin descripción"}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-zinc-50 px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => editService(service)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:border-rose-200 hover:text-rose-500"
                          title="Editar servicio"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleService(service)}
                          className={`relative h-7 w-12 rounded-full transition ${service.active ? "bg-emerald-500" : "bg-zinc-300"}`}
                          aria-pressed={service.active}
                          title={service.active ? "Desactivar servicio" : "Activar servicio"}
                        >
                          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${service.active ? "left-6" : "left-1"}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/35 p-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-rose-100 bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900">{form.id ? "Editar servicio" : "Nuevo servicio"}</h2>
                <p className="mt-1 text-sm text-zinc-500">Completa los datos del servicio para usarlo en el POS.</p>
              </div>
              <button onClick={() => void cancelModal()} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100" title="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nombre</label>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre del servicio" />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Categoría</label>
                <Input list="service-category-options" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Categoría" />
                <datalist id="service-category-options">
                  {categoryOptions.map((category) => <option key={category} value={category} />)}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Precio</label>
                <Input type="number" min={0} value={form.price} onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Estado</label>
                <Select value={form.active ? "activo" : "inactivo"} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.value === "activo" }))}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-stone-700"
                  placeholder="Detalles internos del servicio"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button variant="secondary" onClick={() => void cancelModal()}>Cancelar</Button>
              <Button onClick={submitService}>
                <Save className="h-4 w-4" /> Guardar servicio
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

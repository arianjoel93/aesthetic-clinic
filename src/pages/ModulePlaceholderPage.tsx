import { Plus, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";

interface ModulePlaceholderPageProps {
  title: string;
  description: string;
  createLabel?: string;
}

export function ModulePlaceholderPage({ title, description, createLabel }: ModulePlaceholderPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFormOpen = searchParams.get("nuevo") === "1";

  const closeForm = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Módulo en preparación</p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-900">{title}</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">{description}</p>
      </section>

      {isFormOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-xl font-black text-zinc-900">{createLabel || "Nuevo registro"}</h3>
              <button onClick={closeForm} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-zinc-600">
              Este módulo aún no está construido. El botón Nuevo ya detecta tu sección y abrirá el formulario correcto en cuanto implementemos esta pantalla.
            </p>
            <div className="mt-5 flex justify-end">
              <Button onClick={closeForm}><Plus className="h-4 w-4" /> Entendido</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

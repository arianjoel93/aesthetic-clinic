import type { PropsWithChildren } from "react";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-line bg-paper shadow-soft md:grid-cols-[0.9fr_1.1fr]">
          <section className="hidden bg-ink p-10 text-white md:block">
            <div className="flex h-full flex-col justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-sand">CRM Modular</p>
                <h1 className="mt-6 text-4xl font-bold leading-tight">
                  Operacion comercial clara, modular y lista para crecer.
                </h1>
              </div>
              <div className="space-y-4 text-sm text-slate-200">
                <div className="h-2 w-28 rounded-full bg-sage" />
                <p>Clientes, oportunidades, actividades y notas en un solo flujo.</p>
              </div>
            </div>
          </section>
          <section className="p-6 sm:p-10">{children}</section>
        </div>
      </div>
    </main>
  );
}

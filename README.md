# CRM App Basic

Aplicacion CRM para gestion de clientes, agenda, servicios, notificaciones,
dashboard y punto de venta.

## Arquitectura

- Aplicacion web: React, Vite, TypeScript y Tailwind CSS.
- Backend y base de datos: Supabase.
- Autenticacion: Supabase Auth.
- Datos y tiempo real: Supabase Database y Realtime.
- Funciones de servidor: Supabase Edge Functions.
- Archivos: Supabase Storage.
- Produccion web: Hostinger.
- Correo en Hostinger: endpoints PHP incluidos en `public/api`.

El proyecto se ejecuta directamente desde esta carpeta. No requiere FastAPI ni
un servidor Python local.

## Estructura

```text
crm-app-basic/
  public/
    api/
  src/
  supabase/
    functions/
    migrations/
  index.html
  package.json
  vite.config.ts
```

## Configuracion

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` a partir de `.env.example` y configurar:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

3. Iniciar la aplicacion:

```bash
npm run dev
```

La app queda disponible en `http://127.0.0.1:5173`, o en el siguiente puerto
libre que indique Vite.

## Produccion

```bash
npm run build
```

El resultado se genera en `dist/`. Consulta `DEPLOY_HOSTINGER.md` para subirlo
a Hostinger.

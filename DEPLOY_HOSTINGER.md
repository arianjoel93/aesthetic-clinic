# Deploy en Hostinger

## 1. Archivo listo para subir

El paquete de produccion se genera en:

`C:\SOFTWARE\crm-app-basic\deploy-hostinger-frontend.zip`

Incluye el build de Vite, los endpoints PHP de correo y `.htaccess` para las
rutas internas de React.

## 2. Subir en Hostinger

1. Entra a hPanel > Websites > Manage > File Manager.
2. Abre `public_html`.
3. Retira la version anterior si corresponde.
4. Sube `deploy-hostinger-frontend.zip`.
5. Extrae el ZIP dentro de `public_html`.
6. Comprueba que `index.html`, `assets/`, `api/` y `.htaccess` queden dentro de
   `public_html`.

## 3. Variables del build

La aplicacion utiliza:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Variables opcionales de los endpoints de correo.

No se requiere desplegar FastAPI. Supabase proporciona el backend, la
autenticacion, la base de datos y las funciones de servidor.

## 4. Verificacion

- Abre el dominio principal.
- Inicia sesion con un usuario de Supabase Auth.
- Navega directamente a `/app/agenda`.
- Verifica clientes, citas, notificaciones y envio de correo.

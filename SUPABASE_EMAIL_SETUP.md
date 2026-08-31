# Configuración de correo para citas

Este proyecto envía confirmaciones y recordatorios de citas desde Supabase Edge Functions usando el buzón de Hostinger.

## Buzón esperado

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=soporte@danielarodriguez.nodavexa.com
SMTP_FROM=soporte@danielarodriguez.nodavexa.com
SMTP_FROM_NAME=Daniela Rodríguez
```

`SMTP_PASS` debe guardarse como secreto de Supabase. No debe guardarse en archivos del frontend, del repositorio ni del `dist`.

## Secretos en Supabase

En el dashboard de Supabase, abre:

`Project Settings > Edge Functions > Secrets`

Agrega estos valores:

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=soporte@danielarodriguez.nodavexa.com
SMTP_PASS=contraseña_del_buzón
SMTP_FROM=soporte@danielarodriguez.nodavexa.com
SMTP_FROM_NAME=Daniela Rodríguez
```

También se puede hacer con Supabase CLI:

```powershell
supabase secrets set --project-ref fslsegyrrjhdxwvvxqmh --env-file supabase/functions/.env.local
```

El archivo `.env.local` no debe subirse al repositorio.

## Funciones que deben estar desplegadas

```powershell
supabase functions deploy appointment-email --project-ref fslsegyrrjhdxwvvxqmh --no-verify-jwt
supabase functions deploy appointment-reminders --project-ref fslsegyrrjhdxwvvxqmh --no-verify-jwt
```

## Diagnóstico rápido

- Si aparece que falta configurar el servidor de correo, falta uno de los secretos SMTP.
- Si aparece error de autenticación, revisa usuario y contraseña del buzón.
- Si aparece error de conexión SMTP, revisa host, puerto 465 y SSL activo.
- Si aparece que el servidor de correo no está desplegado, falta desplegar `appointment-email`.

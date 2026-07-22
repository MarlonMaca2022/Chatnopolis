# CLAUDE.md — Chatnopolis

Guía de arquitectura para retomar el proyecto rápido. Chat web en tiempo real con salas, mensajes privados (DM), envío de fotos y panel de administración.

## Stack

- **Backend:** Node.js **≥22.5** + Express + Socket.IO. Usa el módulo nativo `node:sqlite` (por eso exige Node 22.5+, no `better-sqlite3`).
- **Frontend:** React (Vite + Tailwind v4), icons con `lucide-react`.
- **Auth:** contraseñas con `bcryptjs`, sesión con JWT (`jsonwebtoken`).
- **Subida de archivos:** `multer` (disk storage).

## Cómo correr

```bash
npm install                  # deps backend (raíz)
npm --prefix client install  # deps frontend

npm run dev          # backend con nodemon → http://localhost:3000
npm run dev:client   # Vite dev server → http://localhost:5173 (proxy al backend)
```

- Desarrollo: abrir **http://localhost:5173** (Vite hace proxy de `/api` y `/socket.io` al :3000).
- Producción: `npm run build` compila React a `client/dist`, y `npm start` sirve todo desde Express en el `:3000`.
- Admin inicial: `admin` / `admin123` — se crea solo en el primer arranque si no hay usuarios. Cambiar en prod con la env `ADMIN_PASSWORD`.

## Estructura

```
server/
  index.js     Arranque Express + Socket.IO, sirve /uploads y client/dist (SPA fallback)
  db.js        SQLite (node:sqlite): tablas + helpers users/rooms/messages/guestBans + seed inicial
  auth.js      Firmar/verificar tokens JWT
  routes.js    API REST: login, register, rooms, users, upload de fotos + middleware requireAuth/requireAdmin
  socket.js    Chat en tiempo real; el rol se re-verifica server-side (no se confía en el cliente)
client/
  src/pages/         AuthPage (invitado/login/registro), ChatPage
  src/components/     MessageList, MessageInput (con fotos), UserList, AdminModal
  src/lib/           api.js (fetch wrapper + uploadPhoto), session.js (token en localStorage)
  vite.config.js     dev server + proxy
data/chat.db   Base de datos SQLite (se crea sola; gitignored)
uploads/       Fotos subidas (gitignored)
```

## Base de datos (`server/db.js`)

SQLite en `data/chat.db` (WAL). Tablas: `users`, `rooms`, `messages` (sala **o** DM: `room` NULL en DMs, `recipient` NULL en salas; guarda `text` y/o `image_url`), `guest_bans`. Se seedean 4 salas (general, tecnología, música, cine) y el usuario admin en el primer arranque.

## Fotos / uploads — IMPORTANTE

- Se guardan en **`uploads/`** (raíz del proyecto), en disco local. Definido en `server/routes.js` (`UPLOADS_DIR`), servido estático en `/uploads` por `server/index.js`.
- Endpoint `POST /api/upload` (campo `photo`, multipart): multer disk storage, tipos permitidos jpg/png/gif/webp, límite **5 MB**, nombre `timestamp-random.ext`. Devuelve `{ url: "/uploads/archivo.ext" }`, que se guarda como `image_url` en el mensaje.
- **Sin compresión**: la imagen se guarda tal cual la manda el cliente (`client/src/components/MessageInput.jsx` → `api.uploadPhoto`). Fotos de celular pueden ocupar varios MB cada una.
- `uploads/` está **gitignored**: no va al repo y **no sobrevive a un redeploy** en hosting efímero (Render/Railway free tier) sin volumen persistente o almacenamiento externo (S3, etc.).

## Convenciones / notas

- El rol de admin se valida **en el servidor** tanto en REST (`requireAdmin`) como en socket — nunca confiar en el flag del cliente.
- El fetch wrapper (`client/src/lib/api.js`) adjunta `Authorization: Bearer <token>` y serializa JSON salvo cuando el body es `FormData` (upload).
- Deploy en VPS (nginx + pm2 + HTTPS + backups): ver **DEPLOY.md**.

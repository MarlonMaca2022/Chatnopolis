# AGENTS.md — Chatnopolis

Chat web en tiempo real con salas, mensajes privados (DM), envío de fotos y panel de administración.
Node ≥22.5 + Express + Socket.IO + `node:sqlite` en el backend; React (Vite + Tailwind v4) en `client/`.

> **La guía canónica de este proyecto es [`CLAUDE.md`](./CLAUDE.md). Leela completa antes de tocar código.**
> Este archivo es solo el resumen para que ninguna herramienta rompa lo crítico si no abrió el otro.
> Cuando algo acá y `CLAUDE.md` no coincidan, manda `CLAUDE.md`.

## Cómo correr

```bash
npm install                  # deps backend (raíz)
npm --prefix client install  # deps frontend

npm run dev          # backend con nodemon → http://localhost:3000
npm run dev:client   # Vite dev server → http://localhost:5173  ← abrir este
```

`data/chat.db` y `uploads/` están gitignored: la base se crea sola en el primer arranque
(4 salas + admin `admin` / `admin123`), pero el historial y las fotos no viajan en el clone.

## Reglas no negociables

1. **Identidad por forma canónica.** Toda comparación de usuarios pasa por `canonicalNick()`
   (`server/nicks.js`): sin tildes, sin espacios, en minúsculas. Nunca compares nombres con `===`
   ni con `WHERE username = ?` — SQLite compara byte a byte, y sin esto un invitado entra como
   `Admin` o un baneado vuelve agregándole una tilde al nick. Las búsquedas por nombre van por
   `users.findByNick()`. Un invitado no tiene cuenta: **su identidad es el nombre**.

2. **Fotos solo por DM, y la regla vive en el servidor.** `chatMessage` descarta cualquier
   `imageUrl` en salas (`server/socket.js`). El cliente esconde el botón (`allowPhotos` en
   `MessageInput`), pero eso es cosmético — la validación real es server-side. Lo mismo para el
   rol de admin: se re-verifica en REST (`requireAdmin`) y en socket, nunca se confía en el flag
   del cliente.

3. **Color por tokens semánticos.** Nada de `bg-white`, `slate-*` ni `brand-*` en componentes:
   romperían el modo oscuro. Usá `bg-app`, `bg-panel`, `bg-surface`, `bg-muted`, `border-edge`,
   `text-ink`/`-soft`/`-faint`, `bg-accent` y familia (definidos en `client/src/index.css`).
   Los colores de estado sí van con utilidades de Tailwind, pero **siempre con su variante
   `dark:`** (patrón: `bg-red-50 dark:bg-red-400/10`).

4. **`JWT_SECRET` es obligatoria y el modo estricto es el default** (`server/auth.js`): sin ella
   el proceso aborta, y también rechaza los valores de ejemplo del repo. Se relaja solo con
   `NODE_ENV=development`, que lo setea `nodemon.json` — si agregás otro script de arranque para
   desarrollo, tiene que setear esa variable.

## Dónde está cada cosa

```
server/
  index.js     Arranque Express + Socket.IO, sirve /uploads y client/dist (SPA fallback)
  db.js        SQLite: tablas + helpers users/rooms/messages/guestBans + seed inicial
  auth.js      Firmar/verificar JWT; exige JWT_SECRET
  nicks.js     canonicalNick() — toda comparación de identidad pasa por acá
  routes.js    API REST + middleware requireAuth/requireAdmin/requireChatSession
  socket.js    Chat en tiempo real, moderación y reserva de nicks de invitado
  uploads.js   UPLOADS_DIR + removeUploadFile() + cuotas y techo de disco
  cleanup.js   Poda de historial y barrido de fotos vencidas/huérfanas
client/src/    pages/ (AuthPage, ChatPage), components/, lib/ (api, session, theme, compressImage)
```

Detalles de moderación (silenciar/expulsar/banear, vencimiento perezoso), retención de historial,
cuotas de subida, TTL de fotos y sistema de tema: todo explicado en `CLAUDE.md`.
Deploy en VPS (nginx + pm2 + HTTPS + backups): `DEPLOY.md`.

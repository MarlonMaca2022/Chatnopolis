# CLAUDE.md — Chatnopolis

Guía de arquitectura para retomar el proyecto rápido. Chat web en tiempo real con salas, mensajes privados (DM), envío de fotos y panel de administración.

## Stack

- **Backend:** Node.js **≥22.5** + Express + Socket.IO. Usa el módulo nativo `node:sqlite` (por eso exige Node 22.5+, no `better-sqlite3`).
- **Frontend:** React (Vite + Tailwind v4), icons con `lucide-react`, selector de emojis con `emoji-picker-react` (modo `native`, sin imágenes de CDN).
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
  auth.js      Firmar/verificar tokens JWT; exige JWT_SECRET o aborta el arranque
  nicks.js     canonicalNick() — forma canónica de un nombre; TODA comparación de identidad pasa por acá
  routes.js    API REST: login, register, rooms, users, upload de fotos + middleware requireAuth/requireAdmin
  socket.js    Chat en tiempo real; el rol se re-verifica server-side (no se confía en el cliente)
  uploads.js   UPLOADS_DIR + removeUploadFile() (único módulo que borra fotos) + cuotas y techo de disco
  cleanup.js   Poda de historial y barrido de fotos vencidas/huérfanas (startCleanupJobs)
client/
  src/pages/         AuthPage (invitado/login/registro), ChatPage
  src/components/     MessageList, MessageInput (fotos solo en DM), UserList, AdminModal
  src/lib/           api.js (fetch wrapper + uploadPhoto), session.js (token en localStorage),
                     compressImage.js (redimensiona/reencoda antes de subir)
  vite.config.js     dev server + proxy
data/chat.db   Base de datos SQLite (se crea sola; gitignored)
uploads/       Fotos subidas (gitignored)
```

## Base de datos (`server/db.js`)

SQLite en `data/chat.db` (WAL). Tablas: `users`, `rooms`, `messages` (sala **o** DM: `room` NULL en DMs, `recipient` NULL en salas; guarda `text` y/o `image_url`), `guest_bans`. Se seedean 4 salas (general, tecnología, música, cine) y el usuario admin en el primer arranque.

**Retención de salas: máx. `ROOM_HISTORY_LIMIT` (500) mensajes por sala.** `messages.pruneRoom()` se llama después de cada `chatMessage` y borra los más viejos; para no correr un DELETE en cada mensaje solo poda cuando hay `keep + PRUNE_SLACK` (550) filas, y devuelve las URLs de las fotos que se van para que `cleanup.js` borre los archivos. **Los DM no se podan** (son 1 a 1 y ahí sí viven las fotos). Al arrancar, `startCleanupJobs()` poda todas las salas — así se recorta el historial que ya existía.

`roomHistory()` manda por defecto **los mismos 500**: lo que la sala retiene es exactamente lo que se ve al entrar, así no hay dos números que explicar. `dmHistory()` sigue en **50** (los DM no se podan, ahí sí hay más guardado del que se envía y no hay paginación en la UI).

**El historial de DM solo se entrega entre cuentas registradas.** `dm:history` (`server/socket.js`) corta si quien pregunta es invitado o si el otro no existe en `users`: como el nick de un invitado lo puede reclamar cualquiera cuando se va, servirlo dejaría que el próximo `Maria` leyera los privados de la anterior. Para invitados el DM vive **solo en la sesión abierta** (se sigue guardando en la base, pero nadie lo puede leer desde la app).

El cliente **reemplaza** la lista local con cada `history` (`ChatPage.jsx`, `socket.on('history')`), así que cambiar de sala, recargar o reconectar reinicia lo que se ve a esos 500 — no se acumula entre sesiones.

Las migraciones sobre bases ya creadas van con `ALTER TABLE` guardado por el helper `hasColumn()` (`PRAGMA table_info`), porque `CREATE TABLE IF NOT EXISTS` no toca tablas existentes.

## Identidad y nicks — IMPORTANTE

Un invitado no tiene cuenta: **su identidad es el nombre**. De ahí salen tres reglas que hay que respetar en cualquier código que compare usuarios.

- **Todo se compara por forma canónica** (`server/nicks.js`, `canonicalNick()`): sin tildes, sin espacios y en minúsculas. `María`, `MARIA` y `M aria` son **la misma identidad** que `maria`. Nunca compares nombres con `===` ni con `WHERE username = ?` — SQLite compara texto byte a byte, y sin esto un invitado entra como `Admin` (no colisiona con `admin`) o un baneado vuelve agregándole una tilde a su nick. La canónica se guarda materializada en `users.username_canon` (índice `UNIQUE`) y `guest_bans.username_canon`; el `username` original queda solo para mostrarlo. Por eso las búsquedas por nombre van todas por **`users.findByNick()`**.
- **Un nick de invitado a la vez.** `guestNicks` (`server/socket.js`) reserva la canónica en el **handshake**, no en el `join`: entre uno y otro pasa tiempo y ahí entrarían las dos conexiones. Se libera en `disconnect` solo si la reserva sigue siendo de ese socket, y si el dueño ya no está en `io.sockets.sockets` el nombre se cede — una reserva colgada no bloquea el nick para siempre. El rechazo viaja como error de handshake, y el cliente ya lo muestra sin cambios (`ChatPage.jsx` → `sessionStorage.disconnect_reason` → `AuthPage`).
- **Una cuenta registrada sí puede tener varias sesiones** (celular + compu). Por eso `socketIdsFor()` devuelve **todos** los sockets de una identidad y los DM, `disconnectUser()` y `syncMuted()` se aplican a todos. Nunca vuelvas a un helper que devuelva "el primer socket que encuentre": era la causa de que un DM o un baneo cayeran en la persona equivocada.

## Moderación (silenciar / expulsar / banear)

- **Silenciar** — toggle sin vencimiento. Bloquea `chatMessage` y `privateMessage`. Persiste en `users.is_muted` para registrados; para invitados solo vive en la conexión. **`socket.user.isMuted` es la fuente de verdad de la sesión**: `join` reconstruye `usersOnline` a partir de él, así que todo cambio de silencio debe pasar por `syncMuted()` (`server/socket.js`) o se pierde al cambiar de sala. Las rutas REST también lo llaman para no desincronizar sesiones vivas. El estado viaja a toda la sala en `roomUsers` (`isMuted`), y `UserList` lo pinta en gris + alterna el label Silenciar/Desilenciar.
- **Expulsar** — solo cierra el socket, no persiste nada: el usuario puede volver enseguida.
- **Banear** — duraciones 10 min / 1 h / 4 h / permanente (`BAN_DURATIONS` en `server/socket.js`, validadas server-side). Registrados: `users.is_banned` + `banned_until`. Invitados: fila en `guest_bans` con `expires_at`. En ambos, **`NULL` en la fecha = permanente**. Se banea la **identidad, no la IP** (el proyecto no captura IPs): el ban aguanta las variantes del mismo nombre porque va por canónica (ver *Identidad y nicks*), pero un invitado sigue evadiéndolo si elige un nick **realmente** distinto.
- **Vencimiento perezoso**: no hay cron ni timers. `users.banStatus()` y `guestBans.status()` evalúan la fecha al leer y borran el registro vencido en el momento. Todo chequeo de ban debe pasar por esos helpers, nunca leer `is_banned` directo.
- **Desbanear / desilenciar** viven en el `AdminModal` vía REST (`POST /api/users/:u/unban`, `/unmute`, `DELETE /api/guest-bans/:u`), no en la lista de usuarios en línea: un baneado no está conectado. Los invitados baneados tienen su propia sección porque no existen en la tabla `users`.

## Fotos / uploads — IMPORTANTE

- **Solo por privado.** `chatMessage` descarta cualquier `imageUrl` y responde con un `system-error`; en salas solo viaja texto. El cliente ni siquiera muestra el botón (`allowPhotos` en `MessageInput`), pero **la regla real está en `server/socket.js`**. Nota: ahí no se borra el archivo rechazado a propósito — la URL la manda el cliente y podría ser la de otro mensaje; el archivo queda huérfano y lo recoge el barrido.
- Se guardan en **`uploads/`** (raíz del proyecto), en disco local. `UPLOADS_DIR` y `removeUploadFile()` viven en `server/uploads.js` (único lugar que toca el disco de fotos), servido estático en `/uploads` por `server/index.js`.
- Endpoint `POST /api/upload` (campo `photo`, multipart): multer disk storage, tipos permitidos jpg/png/gif/webp, límite **5 MB**, nombre `timestamp-random.ext`. Devuelve `{ url: "/uploads/archivo.ext" }`, que se guarda como `image_url` en el mensaje.
- **Subir exige estar conectado al chat.** Los invitados no tienen cuenta ni token, así que su credencial es **la sesión viva**: el cliente manda su `socket.id` en el header `X-Socket-Id` y `requireChatSession` (`server/routes.js`) lo valida contra `sessionForSocket()` (`server/socket.js`). No es una restricción extra — para enviar la foto por privado hace falta el socket igual. Un socket que ya se desconectó **no sirve** como credencial, y un usuario **silenciado** no puede subir. `ChatPage` guarda el `socket.id` en estado y lo limpia en `disconnect`, porque cambia en cada reconexión.
- **Tres cuotas, todas en `server/uploads.js`** y chequeadas **antes** de recibir el archivo (si no, para decidir si lo rechazábamos ya lo habríamos escrito en el disco que protegemos): techo de disco `PHOTO_DISK_LIMIT_MB` (por defecto **500**, `0` desactiva) → 507; **60 subidas/minuto** globales → 429; **12 subidas cada 5 min** por identidad → 429. Las cuotas cuentan subidas **efectivas**, no intentos. El techo de disco es el que acota el daño de verdad: no importa cuántas identidades use un atacante, el disco no pasa de ahí. El total de bytes se lleva en memoria (se suma al subir, se resta en `removeUploadFile()`) y lo pone en hora cada barrido, que ya recorre el directorio.
- **Compresión en el navegador** (`client/src/lib/compressImage.js`): al elegir la foto se redimensiona a 1600 px de lado mayor y se reencoda a webp 0.82 (jpeg de respaldo) vía canvas, respetando el EXIF con `imageOrientation: 'from-image'`. Los **GIF se dejan intactos** (perderían la animación) y si el resultado pesa más que el original se manda el original. Una foto de celular pasa de ~4 MB a ~200 KB. Ante cualquier fallo devuelve el archivo tal cual — el servidor sigue siendo el que valida.
- **TTL de fotos** (`server/cleanup.js`, env `PHOTO_TTL_MINUTES`, por defecto **1440 = 24 h**, `0` desactiva): un `setInterval` cada 5 min borra los archivos vencidos y pone `image_url = NULL, image_expired = 1` en el mensaje, que **sobrevive** con su texto; el cliente pinta "Foto vencida". Además borra **huérfanos** (archivos que ningún mensaje referencia) con más de `ORPHAN_GRACE_MINUTES` (60) — esto cubre las subidas que nunca se enviaron y las fotos rechazadas en salas, y corre aunque el TTL esté desactivado.
- `uploads/` está **gitignored**: no va al repo y **no sobrevive a un redeploy** en hosting efímero (Render/Railway free tier) sin volumen persistente o almacenamiento externo (S3, etc.).

## Tema y color (`client/src/index.css`)

Identidad: **verde petróleo**. La paleta de marca vive en `@theme` como `--color-brand-*`, pero **los componentes no la usan directamente**: usan **tokens semánticos** definidos en `@theme inline` que apuntan a variables de runtime (`--app`, `--ink`, `--accent`…). `:root` trae los valores del modo claro y `.dark` los pisa, así que cambiar de tema no recompila nada.

| Token | Para qué |
|---|---|
| `bg-app` | fondo de la aplicación y del área de mensajes |
| `bg-panel` | sidebars, headers, barra de escritura, modales |
| `bg-surface` | tarjetas y burbujas de otros |
| `bg-muted` | rellenos suaves: inputs, hover |
| `border-edge` | bordes y separadores |
| `text-ink` / `-soft` / `-faint` | texto principal / secundario / terciario |
| `bg-accent`, `accent-strong`, `accent-soft`, `accent-ink` | acento de marca; `accent-soft`+`accent-ink` es el par para elementos activos |

**Regla:** nada de `bg-white`, `slate-*` ni `brand-*` en componentes nuevos — romperían el modo oscuro. Los colores de estado (ámbar admin, rosa DM, rojo peligro) sí van con utilidades de Tailwind, pero **siempre con su variante `dark:`** (el patrón es `bg-red-50 dark:bg-red-400/10`), porque los tonos `-50/-100` queman sobre fondo oscuro.

**Modo nocturno:** clase `dark` en `<html>`, no media query — `@custom-variant dark` en el CSS. `client/src/lib/theme.js` es la fuente de verdad (store mínimo con `useSyncExternalStore` + `localStorage` bajo `chatnopolis-theme`); `ThemeToggle.jsx` lo dispara y está en el header del sidebar y en `AuthPage`. Sin preferencia guardada **se sigue al sistema** y se reacciona a sus cambios en vivo; el toggle la fija y pasa a mandar. El script inline de `client/index.html` aplica la clase antes del primer pintado para que no haya flash blanco — **si cambiás la clave de localStorage hay que cambiarla en los dos lados**. `emoji-picker-react` no ve el CSS: recibe el tema por prop desde `useTheme()`.

## Convenciones / notas

- **Cambio de sala:** una sala activa a la vez. El sidebar (`ChatPage.jsx`) lista todas las salas de `roomsMap`; al hacer clic, el cliente emite `join` y el servidor sale de la sala anterior, entra a la nueva y reenvía el historial. El servidor **ya soportaba** esto — no requiere cambios en `server/`. `roomId` es estado con un `roomIdRef` para que el handler `message` (registrado una sola vez) enrute al valor actual.
- **Usuarios en línea en móvil:** `UserList.jsx` renderiza el mismo contenido dos veces — columna fija (`hidden md:flex`) y drawer overlay a la derecha (`md:hidden`) controlado por las props `open`/`onClose` desde `ChatPage`. Se abre con el icono 👥 del header móvil, que muestra el contador de conectados.
- **Emojis:** botón 😊 en `MessageInput.jsx` abre un popover con `emoji-picker-react`; el emoji se inserta en la posición del cursor y viaja como texto normal (sin cambios en servidor ni base de datos).
- **`JWT_SECRET` es obligatoria y el modo estricto es el default** (`server/auth.js`): sin ella el proceso aborta con instrucciones, y también rechaza los valores de ejemplo (el de `DEPLOY.md`, el viejo default del repo). El chequeo **no** pregunta por `NODE_ENV === 'production'` porque nadie la setea en el VPS — pm2 arranca sin ella y el chequeo no protegería nada. Se relaja solo con `NODE_ENV=development`, que lo pone `nodemon.json`, así que `npm run dev` sigue andando sin `.env` (con aviso). Si agregás otro script de arranque para desarrollo, tiene que setear esa variable.
- El rol de admin se valida **en el servidor** tanto en REST (`requireAdmin`) como en socket — nunca confiar en el flag del cliente.
- El fetch wrapper (`client/src/lib/api.js`) adjunta `Authorization: Bearer <token>` y serializa JSON salvo cuando el body es `FormData` (upload).
- Deploy en VPS (nginx + pm2 + HTTPS + backups): ver **DEPLOY.md**.

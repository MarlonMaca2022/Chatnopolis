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
- Admin inicial: `admin` / `admin123` — se crea solo en el primer arranque si no hay usuarios. En prod se cambian con las envs `ADMIN_PASSWORD` y `ADMIN_USERNAME` (renombrar uno existente: DEPLOY.md §11).

## Estructura

```
server/
  index.js     Arranque Express + Socket.IO, cabeceras de seguridad (helmet + CSP), sirve /uploads y client/dist (SPA fallback)
  db.js        SQLite (node:sqlite): tablas + helpers users/rooms/messages/guestBans + seed inicial
  auth.js      Firmar tokens JWT y revalidarlos contra la base (sessionAccount); exige JWT_SECRET o aborta
  legal.js     TERMS_VERSION + edad mínima + los textos de rechazo por falta de consentimiento
  nicks.js     canonicalNick() — forma canónica de un nombre; TODA comparación de identidad pasa por acá
  routes.js    API REST: login, register, rooms, users, upload de fotos + middleware requireAuth/requireAdmin
  ratelimit.js Límites por frecuencia: REST (login/register/api) y chat en vivo (mensajes, consultas, conexiones)
  totp.js      Verificación en dos pasos: TOTP (RFC 6238) sobre node:crypto + códigos de recuperación
  socket.js    Chat en tiempo real; el rol se re-verifica server-side (no se confía en el cliente)
  uploads.js   UPLOADS_DIR + removeUploadFile() (único módulo que borra fotos) + cuotas y techo de disco
  cleanup.js   Poda de historial y barrido de fotos vencidas/huérfanas (startCleanupJobs)
  profile.js   Datos de perfil: GENDERS + validGender()
  seo.js       Todo el HTML de la SPA (renderPage): <head> por ruta + prerender de las páginas públicas
client/
  src/pages/         HomePage (/, pública), AuthPage (/entrar: invitado/login/registro), ChatPage,
                     LegalPage (renderiza las 3 legales)
  src/publicRoutes.jsx  Rutas públicas prerenderizadas (las usan App.jsx y entry-server.jsx)
  src/entry-server.jsx  Render en el servidor: `vite build --ssr` → client/dist-server (gitignored)
  src/components/     MessageList, MessageInput (fotos solo en DM), UserList, AdminModal,
                     TwoFactorSection (2FA, dentro de Mi perfil), AgeGate (aviso 18+), LegalFooter,
                     Avatar (foto o círculo con inicial), GenderPicker ("Soy": radios name="gender"),
                     Logo (emblema + texto en SVG, currentColor; LogoMark/LogoWord sueltos),
                     Ghost (el fantasmita del favicon, mascota de la homepage),
                     ProfileModal (Mi perfil: se abre tocando la tarjeta propia al pie del sidebar),
                     PasswordSection (cambiar la contraseña, dentro de Mi perfil; solo registrados)
  src/lib/           api.js (fetch wrapper + uploadPhoto), session.js (token en localStorage),
                     gender.js (textos de cada género; los ids los decide server/profile.js),
                     messages.js (REACTIONS + quoteLabel() para citas),
                     compressImage.js (redimensiona/reencoda antes de subir),
                     legal.js (texto de términos/privacidad/seguridad + responsable legal),
                     home.js (textos de la homepage + descripción de cada sala),
                     initialData.js (datos con los que el servidor prerenderizó: salas),
                     seo.js (título y descripción de cada ruta + APP_PATHS + usePageTitle)
  vite.config.js     dev server + proxy
data/chat.db   Base de datos SQLite (se crea sola; gitignored)
uploads/       Fotos subidas (gitignored)
```

## Base de datos (`server/db.js`)

SQLite en `data/chat.db` (WAL). Tablas: `users`, `rooms`, `messages` (sala **o** DM: `room` NULL en DMs, `recipient` NULL en salas; guarda `text` y/o `image_url`), `guest_bans`. Se seedean 4 salas (general, tecnología, música, cine) y el usuario admin en el primer arranque.

**Retención de salas: máx. `ROOM_HISTORY_LIMIT` (500) mensajes por sala.** `messages.pruneRoom()` se llama después de cada `chatMessage` y borra los más viejos; para no correr un DELETE en cada mensaje solo poda cuando hay `keep + PRUNE_SLACK` (550) filas, y devuelve las URLs de las fotos que se van para que `cleanup.js` borre los archivos. Al arrancar, `startCleanupJobs()` poda todas las salas — así se recorta el historial que ya existía.

**Retención de privados: `DM_RETENTION_DAYS` (90 días, `0` desactiva) y máx. `DM_PAIR_LIMIT` (500) por conversación.** Los DM no tienen sala, así que la poda de arriba no los alcanza: sin estos dos topes `messages` era el único lugar de la app donde se podía escribir sin ningún límite (las salas tienen su tope, las fotos el TTL y el techo de disco). Los dos frenos corren en el barrido de `cleanup.js` (`pruneDms()`), **no en el camino de cada mensaje**: cuestan un recorrido de la tabla y no hay ninguna urgencia en aplicarlos al instante. El par de una conversación se ordena con `MIN(sender,recipient)`/`MAX(...)` — la versión escalar de dos argumentos — para que "a→b" y "b→a" cuenten como una sola charla. `dmHistory()` sigue mandando **50** y no hay paginación en la UI, así que 500 es holgado.

`roomHistory()` manda por defecto **los mismos 500**: lo que la sala retiene es exactamente lo que se ve al entrar, así no hay dos números que explicar. `dmHistory()` sigue en **50** (los DM no se podan, ahí sí hay más guardado del que se envía y no hay paginación en la UI).

**El historial de DM solo se entrega entre cuentas registradas.** `dm:history` (`server/socket.js`) corta si quien pregunta es invitado o si el otro no existe en `users`: como el nick de un invitado lo puede reclamar cualquiera cuando se va, servirlo dejaría que el próximo `Maria` leyera los privados de la anterior. Para invitados el DM vive **solo en la sesión abierta** (se sigue guardando en la base, pero nadie lo puede leer desde la app).

El cliente **reemplaza** la lista local con cada `history` (`ChatPage.jsx`, `socket.on('history')`), así que cambiar de sala, recargar o reconectar reinicia lo que se ve a esos 500 — no se acumula entre sesiones.

**Respuestas y reacciones.** Todo mensaje viaja con su `id` (en vivo y en los historiales), que es lo que usan las tres acciones de `MessageList`:
- **Responder**: `messages.reply_to` (sin FK a propósito: si el original se borra, la respuesta queda con `replyTo: { id, deleted: true }` → "Mensaje eliminado"). El servidor manda la cita armada (`replyPreview()`, primeros 100 caracteres), resuelta en los historiales con un `LEFT JOIN` de `messages` sobre sí misma (`HISTORY_COLUMNS`).
- **Reaccionar**: tabla `message_reactions` (una fila por canónica + emoji, toggle), set fijo de 6 (`REACTIONS` en `server/socket.js` y en `client/src/lib/messages.js`, hay que mantenerlos iguales). `ON DELETE CASCADE` + `PRAGMA foreign_keys = ON`: la poda, la retención de DM y el borrado del admin se llevan las reacciones solas. El cambio viaja como `reactions {id, reactions: {emoji: [nicks]}}` por `emitToAudience()` — que nunca llama a `io.to([])`, porque con la lista vacía Socket.IO le manda a **todos**.
- **`quotable(socket, id)` es la única puerta** para citar y para reaccionar: la cita copia el texto del original, así que un id ajeno sería una forma de leer mensajes de otros. Sala: solo la sala en la que está. Privado: hay que ser parte, y las dos puntas tienen que poder verlo — `dmVisibleFrom()` deja a un invitado ver solo los privados de **su sesión actual** (`socket.user.sinceId`, el último id al momento del handshake), por el mismo motivo que `dm:history` no se le sirve. Al responder un privado, además, el citado tiene que ser de esa misma conversación (`samePair`).

Las migraciones sobre bases ya creadas van con `ALTER TABLE` guardado por el helper `hasColumn()` (`PRAGMA table_info`), porque `CREATE TABLE IF NOT EXISTS` no toca tablas existentes.

## Identidad y nicks — IMPORTANTE

Un invitado no tiene cuenta: **su identidad es el nombre**. De ahí salen tres reglas que hay que respetar en cualquier código que compare usuarios.

- **Todo se compara por forma canónica** (`server/nicks.js`, `canonicalNick()`): sin tildes, sin espacios y en minúsculas. `María`, `MARIA` y `M aria` son **la misma identidad** que `maria`. Nunca compares nombres con `===` ni con `WHERE username = ?` — SQLite compara texto byte a byte, y sin esto un invitado entra como `Admin` (no colisiona con `admin`) o un baneado vuelve agregándole una tilde a su nick. La canónica se guarda materializada en `users.username_canon` (índice `UNIQUE`) y `guest_bans.username_canon`; el `username` original queda solo para mostrarlo. Por eso las búsquedas por nombre van todas por **`users.findByNick()`**.
- **Nicks reservados** (`isReservedNick()`, `server/nicks.js`): nada que contenga `admin`, `moderador`, `soporte`, `staff`, `chatnopolis` o `sistema` (más `mod` y `root` exactos), como invitado ni al registrarse. Va por canónica y por "contiene" para que `El Admín` tampoco pase. No toca cuentas existentes — el admin real puede llamarse como quiera, y no conviene que se llame `admin`.
- **Un nick de invitado a la vez.** `guestNicks` (`server/socket.js`) reserva la canónica en el **handshake**, no en el `join`: entre uno y otro pasa tiempo y ahí entrarían las dos conexiones. Se libera en `disconnect` solo si la reserva sigue siendo de ese socket, y si el dueño ya no está en `io.sockets.sockets` el nombre se cede — una reserva colgada no bloquea el nick para siempre. El rechazo viaja como error de handshake, y el cliente ya lo muestra sin cambios (`ChatPage.jsx` → `sessionStorage.disconnect_reason` → `AuthPage`).
- **Las reglas de un nick de invitado viven en una sola función, `guestNickProblem()`** (`server/socket.js`): regex, reservados, bans de invitado, colisión con registrados y la reserva de `guestNicks`. La usan los dos caminos por los que un invitado elige nombre — el handshake y `profile:update` (cambio de nick desde Mi perfil, sin reconectar). Si agregás una regla, va ahí. Al renombrarse se mueve la reserva (el nick viejo queda libre en el acto), se reinicia `sinceId` (es otra identidad: no ve privados de quien soltó ese nick) y la sala recibe "X ahora se llama Y". Silenciados no pueden. **Los registrados no cambian su nombre**: es con lo que entran y de lo que cuelgan privados y bans.
- **Una cuenta registrada sí puede tener varias sesiones** (celular + compu). Por eso `socketIdsFor()` devuelve **todos** los sockets de una identidad y los DM, `disconnectUser()` y `syncMuted()` se aplican a todos. Nunca vuelvas a un helper que devuelva "el primer socket que encuentre": era la causa de que un DM o un baneo cayeran en la persona equivocada.

## Moderación (silenciar / expulsar / banear)

- **Silenciar** — toggle sin vencimiento. Bloquea `chatMessage` y `privateMessage`. Persiste en `users.is_muted` para registrados; para invitados solo vive en la conexión. **`socket.user.isMuted` es la fuente de verdad de la sesión**: `join` reconstruye `usersOnline` a partir de él, así que todo cambio de silencio debe pasar por `syncMuted()` (`server/socket.js`) o se pierde al cambiar de sala. Las rutas REST también lo llaman para no desincronizar sesiones vivas. El estado viaja a toda la sala en `roomUsers` (`isMuted`), y `UserList` lo pinta en gris + alterna el label Silenciar/Desilenciar.
- **Expulsar** — solo cierra el socket, no persiste nada: el usuario puede volver enseguida.
- **Quitar foto de perfil** — `admin:removeAvatar` (menú de `UserList`, solo si tiene foto): borra el archivo, la saca de las sesiones vivas y le avisa al dueño.
- **Borrar un mensaje** — solo de salas (`admin:deleteMessage`, botón 🗑 de `MessageList` con `canDelete`). Lo borra de la base del todo (`messages.removeRoomMessage`, con sus reacciones por el CASCADE) y emite `messageDeleted {id}` a la sala; el cliente lo saca de `chats` y marca como eliminadas las citas que lo apuntaban. Los privados no: el admin no los ve.
- **Banear** — duraciones 10 min / 1 h / 4 h / permanente (`BAN_DURATIONS` en `server/socket.js`, validadas server-side). Registrados: `users.is_banned` + `banned_until`. Invitados: fila en `guest_bans` con `expires_at`. En ambos, **`NULL` en la fecha = permanente**. Se banea la **identidad, no la IP** (el proyecto no captura IPs): el ban aguanta las variantes del mismo nombre porque va por canónica (ver *Identidad y nicks*), pero un invitado sigue evadiéndolo si elige un nick **realmente** distinto.
- **Vencimiento perezoso**: no hay cron ni timers. `users.banStatus()` y `guestBans.status()` evalúan la fecha al leer y borran el registro vencido en el momento. Todo chequeo de ban debe pasar por esos helpers, nunca leer `is_banned` directo.
- **Desbanear / desilenciar** viven en el `AdminModal` vía REST (`POST /api/users/:u/unban`, `/unmute`, `DELETE /api/guest-bans/:u`), no en la lista de usuarios en línea: un baneado no está conectado. Los invitados baneados tienen su propia sección porque no existen en la tabla `users`.

## Legales, edad y consentimiento — IMPORTANTE

El chat permite **contenido adulto entre adultos** en privado, así que la edad mínima (18) no es un adorno. Todo lo que la sostiene está en `server/legal.js` (`TERMS_VERSION`, `MIN_AGE`, los dos mensajes de rechazo) y el texto que ve el usuario en `client/src/lib/legal.js`.

- **El checkbox del formulario no vale nada por sí solo** — se evade con la consola. La declaración vale porque se exige en el servidor, por los **dos** caminos que existen: `POST /api/register` rechaza con 400 si falta `acceptedTerms === true`, y el **handshake de Socket.IO** rechaza al invitado si `auth.terms !== true`. Ese chequeo va **antes** del regex de nick: es un booleano, la comprobación más barata de todo el middleware.
- **El cliente nunca conoce `TERMS_VERSION`.** Solo manda booleanos y el servidor estampa la versión vigente. Así no hay una constante duplicada entre `server/` y `client/` que se desincronice, y quién decidió qué texto se aceptó lo sabe siempre el servidor.
- **Registrados: se persiste** (`users.accepted_terms_at` + `users.terms_version`). **Invitados: no.** Un invitado no tiene cuenta, y su nick lo puede reclamar otro cuando se va — una fila con ese nombre no identificaría a nadie. Su consentimiento viaja en cada handshake y vale para esa sesión.
- **Subir `TERMS_VERSION` re-pide la aceptación sola**, sin migración ni aviso manual. `POST /api/login` devuelve **200 con `termsOutdated: true` y sin token** (sin token no hay sesión, así que el paso no se saltea); `AuthPage` muestra el checkbox dentro del formulario de login y reenvía con `acceptedTerms: true`. El handshake de registrados hace el mismo chequeo, para que un **token ya firmado** antes del cambio no siga entrando. Las cuentas anteriores a esta función tienen `terms_version` en `NULL` y caen por el mismo camino, que es lo que se busca.
- El **único** dato que se sincroniza a mano: `LEGAL.actualizado` (cliente) tiene que coincidir con `TERMS_VERSION` (servidor). Uno decide, el otro se muestra.
- **`AgeGate`** envuelve la ruta `/entrar` en `App.jsx`, no el JSX de `AuthPage`. La homepage (`/`) **no** va detrás: no tiene nada explícito, es lo que lee Google y dice igual que es solo +18. El chat sigue detrás del cartel, la casilla y el chequeo del servidor. Es un cartel disuasorio con `localStorage['chatnopolis-age-ack']`; solo persiste el "sí" (bloquear el navegador para siempre por un clic mal dado sería peor). La declaración que cuenta sigue siendo el checkbox.
- Las tres páginas legales son **rutas públicas** (`/terminos`, `/privacidad`, `/seguridad`), fuera de `RequireSession` — tienen que leerse sin entrar. El fallback SPA de `server/index.js` ya las sirve: **no hace falta tocar el backend para agregar otra**. Un solo componente (`LegalPage`) renderiza cualquier entrada de `LEGAL_PAGES`, así que sumar una página es agregar una entrada al objeto y una `<Route>`.
- **El responsable legal es una sola constante** (`LEGAL` en `client/src/lib/legal.js`): nombre, email de contacto y edad mínima. Hoy es genérico y sin jurisdicción, por decisión de producto. Nombrar una razón social y un país es cambiar ese objeto — el texto de las tres páginas ya lo interpola.
- **La política de privacidad describe el sistema real, y eso es un compromiso**: si cambiás la retención (500 por sala, 90 días de DM, TTL de 24 h), o empezás a guardar IPs, o agregás analítica o un tercero, **hay que actualizar el texto en el mismo commit**. Una política que describe mal el sistema es peor que no tenerla.
- El camino de reporte de esta ola es **el email** publicado en las tres páginas. No hay botón "Reportar" en la UI todavía: es una ola aparte.
- **La etiqueta de contenido adulto va por página, solo en `/chat`**: `<meta name="rating" content="adult">` + la etiqueta RTA, que es lo que leen los filtros de control parental (y Google para SafeSearch). La portada, las salas y las legales no tienen nada explícito y van sin ella, así aparecen en Google con SafeSearch activado — lo adulto vive en los privados, que solo existen dentro de `/chat`. Las ponen **dos lados**: `server/seo.js` (`ADULT_PATHS`, junto con un `noindex`) cuando `/chat` se carga directo, y un `useEffect` de `ChatPage` cuando se llega navegando dentro de la SPA, que no recarga el `<head>`; al salir del chat las saca todas. Si algún día hay una sala +18, su ruta se suma a `ADULT_PATHS`. Si se prohíbe el contenido explícito, salen de los dos lados.

## Fotos / uploads — IMPORTANTE

- **Solo por privado.** `chatMessage` descarta cualquier `imageUrl` y responde con un `system-error`; en salas solo viaja texto. El cliente ni siquiera muestra el botón (`allowPhotos` en `MessageInput`), pero **la regla real está en `server/socket.js`**. Nota: ahí no se borra el archivo rechazado a propósito — la URL la manda el cliente y podría ser la de otro mensaje; el archivo queda huérfano y lo recoge el barrido.
- Se guardan en **`uploads/`** (raíz del proyecto), en disco local. `UPLOADS_DIR` y `removeUploadFile()` viven en `server/uploads.js` (único lugar que toca el disco de fotos), servido estático en `/uploads` por `server/index.js` con **`X-Content-Type-Options: nosniff`** y `Content-Disposition: inline`. El `mimetype` que valida multer lo declara quien sube, no sale de los bytes del archivo: con `nosniff` el navegador respeta el `Content-Type` que mandamos en vez de adivinar, así que un archivo con contenido de página web guardado como `.jpg` no se ejecuta.
- Endpoint `POST /api/upload` (campo `photo`, multipart): multer disk storage, tipos permitidos jpg/png/gif/webp, límite **5 MB**, nombre `timestamp-random.ext`. Devuelve `{ url: "/uploads/archivo.ext" }`, que se guarda como `image_url` en el mensaje.
- **Subir exige estar conectado al chat.** Los invitados no tienen cuenta ni token, así que su credencial es **la sesión viva**: el cliente manda su `socket.id` en el header `X-Socket-Id` y `requireChatSession` (`server/routes.js`) lo valida contra `sessionForSocket()` (`server/socket.js`). No es una restricción extra — para enviar la foto por privado hace falta el socket igual. Un socket que ya se desconectó **no sirve** como credencial, y un usuario **silenciado** no puede subir. `ChatPage` guarda el `socket.id` en estado y lo limpia en `disconnect`, porque cambia en cada reconexión.
- **Tres cuotas, todas en `server/uploads.js`** y chequeadas **antes** de recibir el archivo (si no, para decidir si lo rechazábamos ya lo habríamos escrito en el disco que protegemos): techo de disco `PHOTO_DISK_LIMIT_MB` (por defecto **500**, `0` desactiva) → 507; **60 subidas/minuto** globales → 429; **12 subidas cada 5 min** por identidad → 429. Las cuotas cuentan subidas **efectivas**, no intentos. El techo de disco es el que acota el daño de verdad: no importa cuántas identidades use un atacante, el disco no pasa de ahí. El total de bytes se lleva en memoria (se suma al subir, se resta en `removeUploadFile()`) y lo pone en hora cada barrido, que ya recorre el directorio.
- **Compresión en el navegador** (`client/src/lib/compressImage.js`): al elegir la foto se redimensiona a 1600 px de lado mayor y se reencoda a webp 0.82 (jpeg de respaldo) vía canvas, respetando el EXIF con `imageOrientation: 'from-image'`. Los **GIF se dejan intactos** (perderían la animación) y si el resultado pesa más que el original se manda el original. Una foto de celular pasa de ~4 MB a ~200 KB. Ante cualquier fallo devuelve el archivo tal cual — el servidor sigue siendo el que valida.
- **TTL de fotos** (`server/cleanup.js`, env `PHOTO_TTL_MINUTES`, por defecto **1440 = 24 h**, `0` desactiva): un `setInterval` cada 5 min borra los archivos vencidos y pone `image_url = NULL, image_expired = 1` en el mensaje, que **sobrevive** con su texto; el cliente pinta "Foto vencida". Además borra **huérfanos** (archivos que ningún mensaje referencia) con más de `ORPHAN_GRACE_MINUTES` (60) — esto cubre las subidas que nunca se enviaron y las fotos rechazadas en salas, y corre aunque el TTL esté desactivado.
- **Foto de perfil** (solo registrados, `users.avatar_url`): `POST /api/profile/avatar` con las mismas cuotas que las fotos de privados pero **tope propio de 1 MB** (`AVATAR_LIMIT_MB` en `server/routes.js`, repetido en `ProfileModal` solo para avisar antes de subir): se descarga para cada persona de la sala, y como los GIF no se comprimen, sin ese tope uno de 5 MB pesaría en cada mensaje. El cliente la comprime a 512 px (`compressImage(file, { maxDimension: 512 })`). No tiene TTL. Reemplazarla o quitarla (`DELETE /api/profile/avatar`, o `admin:removeAvatar`) borra el archivo anterior **en el momento** (`users.setAvatar()` devuelve la URL vieja). El barrido de huérfanos suma `users.avatarUrls()` a los referenciados: **sin eso las borraría a la hora**. Viaja en `roomUsers` y en cada mensaje (`avatarUrl`; los historiales la traen con un `LEFT JOIN users`); el cliente prefiere la de `roomUsers` (la vigente) y `Avatar` vuelve a la inicial si la imagen no carga. Se ve en salas públicas: los términos prohíben contenido sexual ahí y el admin la puede quitar desde el menú de `UserList`. Silenciados no pueden cambiarla.
- Los cambios de perfil de una cuenta (género por `PATCH /api/profile`, foto) llegan a las sesiones vivas con **`syncProfile()`** (`server/socket.js`), mismo patrón que `syncMuted()`.
- `uploads/` está **gitignored**: no va al repo y **no sobrevive a un redeploy** en hosting efímero (Render/Railway free tier) sin volumen persistente o almacenamiento externo (S3, etc.).

## Límites de frecuencia (`server/ratelimit.js`) — IMPORTANTE

Todo lo que frena el abuso **por frecuencia** vive en un solo módulo. Las cuotas de fotos siguen en `server/uploads.js` porque miden otra cosa (bytes en disco, no peticiones por minuto).

- **Por qué existe:** `bcryptjs` es JS puro y `compareSync` **bloquea el único hilo de Node** varios cientos de ms. Sin freno en `/api/login`, unas pocas peticiones por segundo congelan el chat entero — no solo el login. El límite no es solo contra fuerza bruta, es contra caerse.
- **REST:** `loginLimiter` (10 fallos / 15 min por IP, con `skipSuccessfulRequests` — quien acierta no gasta cupo, así que a un usuario normal le resulta invisible), `registerLimiter` (5 altas / hora) y `apiLimiter` (600 / 15 min, red de contención para el resto de `/api`).
- **Socket:** ventana deslizante por socket, igual patrón que las cuotas de `uploads.js`. `allowMessage` (10 mensajes / 10 s, cubre `chatMessage` y `privateMessage`), `allowQuery` (20 / 10 s para `join` y `dm:history`, que tocan la DB) y `allowConnection` (60 handshakes / min por IP, chequeado **antes** de verificar el token: si no, cada intento del bucle nos costaría trabajo real).
- **El aviso de "vas muy rápido" está limitado a uno cada 5 s** (`shouldWarn`). Responder a cada mensaje bloqueado convertiría un flood de entrada en un flood de salida.
- **`allowConnection` limita el ritmo, no las sesiones simultáneas.** Una oficina o un colegio comparten IP; un tope de conexiones abiertas los dejaría afuera. Lo que se frena es el bucle que abre cientos por minuto.
- **`TRUST_PROXY`** decide de dónde sale la IP. Está **apagado por defecto a propósito**: si confiáramos siempre en `X-Forwarded-For`, un servidor sin proxy delante creería la cabecera que le mande cualquiera y todos los límites por IP se saltarían con una IP inventada por intento. En el VPS hay que poner `TRUST_PROXY=1` (ver DEPLOY.md) o los límites contarían todo el tráfico como una sola IP. El arranque imprime cuál de los dos modos está activo. Se lee el **último** valor de `X-Forwarded-For` porque nginx usa `$proxy_add_x_forwarded_for`, que agrega la IP real al final; lo anterior lo puede haber escrito el cliente.

**El destinatario de un privado no es texto libre** (`server/socket.js`): tiene que ser una cuenta registrada o un invitado conectado ahora mismo, y como mucho `MAX_NICK_LENGTH` (20) caracteres. Antes un nombre inventado se guardaba igual, así que cada emit escribía una fila que nadie iba a leer nunca, con un `to` tan largo como el cliente quisiera (el tope de Socket.IO es 1 MB) y sin nada que la podara después.

## Cabeceras de seguridad (`server/index.js`, `helmet`) — IMPORTANTE

`helmet` va antes de todas las rutas, así que cubre la app, la API y `/uploads`.

- **CSP: el navegador solo ejecuta código servido por este mismo sitio.** Aunque alguien lograra meter un `<script>` o un `onerror="..."` en la página (por un bug al mostrar un mensaje, por ejemplo), no corre y no puede robar la sesión del `localStorage`. Por eso `script-src 'self'` **sin `'unsafe-inline'`**: nada de `<script>` inline en `index.html` (el del tema vive en `client/public/theme-init.js`) ni atributos `on*=`.
- Todo es `'self'` porque el cliente no carga nada de terceros (sin CDN, fuentes externas ni analítica). **Si algún día se suma un tercero, hay que agregarlo a la directiva que corresponda o el navegador lo bloquea en silencio** — y además la política de privacidad tiene que mencionarlo.
- Las excepciones, cada una con su motivo: `style-src 'unsafe-inline'` (`emoji-picker-react` inyecta su CSS con un `<style>`; un estilo no ejecuta código), `img-src data:` (el QR del 2FA) y `img-src blob:` (la vista previa de la foto antes de mandarla). `connect-src 'self'` cubre también el WebSocket de Socket.IO.
- **HSTS** 180 días, **sin `includeSubDomains` ni `preload`** a propósito: obligarían a cualquier subdominio futuro a tener HTTPS, y el preload no se deshace rápido. Sobre http (local) el navegador la ignora.
- En desarrollo (`npm run dev:client`, :5173) el HTML lo sirve Vite y **no lleva CSP**: un bloqueo solo aparece con `npm run build && npm start`. Probar ahí cualquier cambio que cargue algo nuevo.

## SEO, homepage y prerender (`server/seo.js`) — IMPORTANTE

`/` es una **homepage pública** (`HomePage`, textos en `client/src/lib/home.js`) y la entrada al chat vive en **`/entrar`**. Todo lo que antes mandaba a `/` al salir, por una expulsión o por "Crear una cuenta" manda a `/entrar`, que es donde se leen `disconnect_reason` y `register_prefill`.

- **`server/seo.js` arma todo el HTML de la SPA** (`renderPage()`, lo llama el fallback de `server/index.js`; `express.static` va con `index: false` para que `/` también pase por acá). Hace dos cosas:
  - **`<head>` por ruta**: reemplaza el bloque `<!--seo-->…<!--/seo-->` de `client/index.html` (lo de adentro es lo que se ve en desarrollo). Pone título, descripción, `canonical`, Open Graph (`og:*`, vista previa en WhatsApp/redes) y, en `/`, los datos estructurados `WebSite` (el nombre del sitio que muestra Google). **Los títulos y descripciones viven en `client/src/lib/seo.js` (`PAGE_META`)** y le llegan al servidor por el build SSR: una sola fuente, y `App.jsx` cambia el título de la pestaña con `usePageTitle()` al navegar sin recargar. **El `noindex` (`NOINDEX_PATHS`: `/chat`, `/entrar`) y la etiqueta adulta (`ADULT_PATHS`, ver *Legales*) los decide `server/seo.js` solo**, para que no dependan de que el build SSR cargue. Todo lo interpolado pasa por `escapeHtml()`.
  - **404 de verdad**: una ruta que no está en `APP_PATHS` (`lib/seo.js`) responde **404** con `noindex` (el navegador igual redirige a la homepage); con 200, Google la indexaba como una copia de la homepage. También lo que no existe dentro de `/assets/`. `/terminos/` (con barra final) es la misma página y su canonical va sin barra. **Una ruta nueva en `App.jsx` tiene que sumarse a `PAGE_META`**, o el servidor la contesta con 404.
  - **`/robots.txt` y `/sitemap.xml`** los genera `seo.js` (las páginas por sala se van a sumar al sitemap). `robots.txt` bloquea solo `/api/`, `/uploads/` (las fotos de los privados) y `/socket.io/`. **`/chat` y `/entrar` NO van en el `Disallow`**: si Google no puede entrar, no ve su `noindex`, y una URL bloqueada pero enlazada puede aparecer igual en los resultados. El dominio de canonical, OG y sitemap sale de `PUBLIC_URL` (por defecto `https://chatnopolis.com`).
  - **Prerender de las páginas públicas** (`PUBLIC_ROUTES` en `client/src/publicRoutes.jsx`: homepage y legales). `client/src/entry-server.jsx` se compila aparte (`vite build --ssr`, lo hace solo el `npm run build` del cliente) a `client/dist-server/entry-server.js`, y `seo.js` lo carga con `import()` (es ESM y el servidor CommonJS). El HTML llega con el texto adentro, así lo leen Google en la primera pasada, Bing y los buscadores con IA, que no ejecutan JS. En el navegador `main.jsx` usa `hydrateRoot` si `#root` trae contenido y `createRoot` si no.
- **Se renderiza en cada pedido, no al compilar**, porque la lista de salas sale de la base: una sala nueva del admin aparece en la homepage sin recompilar. Las salas viajan además en `<script type="application/json" id="initial-data">` (un bloque de datos: la CSP no lo bloquea) y `initialData()` (`client/src/lib/initialData.js`) se las da al primer render del navegador. **Para hidratar, servidor y navegador tienen que armar exactamente el mismo árbol**: lo que dependa del navegador (localStorage, `window`, la hora) va en efectos, nunca en el render. Por eso `theme.js` no toca `window` al cargarse sin DOM, y su `getServerSnapshot` devuelve `'light'`. `/entrar` no se prerenderiza: el `AgeGate` lee localStorage al montar.
- **El prerender mejora, nunca rompe.** Sin `dist-server`, mientras carga el módulo (los primeros milisegundos tras arrancar) o si el render tira un error, la página sale vacía y React la arma en el navegador como antes. Los errores se loguean con el prefijo `SEO:`.
- **`index.html` y `entry-server.js` se releen si cambian en disco** (por `mtime`): un `npm run build` sin reiniciar no deja al servidor entregando HTML que apunta a assets borrados.
- **Escapes**: lo que pinta React ya sale escapado. Los datos del bloque JSON escapan `<` (un `</script>` en el nombre de una sala no cierra el bloque), y los reemplazos sobre la plantilla van con función, no con texto, porque con texto un `$&` en un nombre se interpretaría como patrón.
- **Lo que dice la homepage tiene que ser cierto hoy** (fotos de 24 h, moderación, entrar sin registro): si cambia el sistema, cambia `home.js` en el mismo commit, igual que la política de privacidad. La descripción de cada sala vive en `home.js` (`ROOM_DESCRIPTIONS`, por id) hasta que existan las páginas por sala.
- En desarrollo (`npm run dev:client`) el HTML lo sirve Vite: **no hay prerender ni `<head>` por ruta**, igual que no hay CSP. Se prueba con `npm run build && npm start`.

## Verificación en dos pasos (`server/totp.js`) — IMPORTANTE

Código de 6 dígitos de una app (Google Authenticator, Authy…) además de la contraseña. Es para **cualquier cuenta registrada**: la pantalla (`TwoFactorSection`) vive en *Mi perfil*, debajo de la contraseña (antes estaba solo en el `AdminModal`, y un usuario común no tenía forma de activarla).

- **TOTP propio, sin dependencia**: ~30 líneas sobre `node:crypto`, probado contra los vectores del RFC 6238. Acepta ±1 paso de 30 s por el desfase de reloj del celular. El QR lo genera el servidor con `qrcode` (data URL): **nunca un servicio externo de QR**, que vería el secreto.
- **Login: mismo patrón que `termsOutdated`.** Con la contraseña bien, `POST /api/login` devuelve **200 con `needsCode: true` y sin token**; `AuthPage` muestra el campo y reenvía con `code`. Orden: contraseña → ban → términos (sin escribir) → código → recién ahí se guarda la aceptación de términos y se firma el token. Así **la contraseña sola no escribe nada** en la cuenta, y el código se consume en el único pedido que firma.
- **Un código no sirve dos veces**: `users.totp_last_step` guarda el paso del último aceptado y `verify()` solo acepta posteriores. Sin esto, quien lo ve por encima del hombro lo reusa en los 30 s que le quedan.
- **Tope por cuenta** (`secondFactorBlocked`, 5 fallos / 15 min, en `ratelimit.js`): `loginLimiter` cuenta por IP, y quien llega a este paso ya tiene la contraseña — repartiendo intentos entre IPs podría barrer los códigos. Va por canónica, como todo.
- **Activar pide contraseña + código, y desactivar también.** Con un token robado solo, nadie le saca la protección a la cuenta ni la activa con *su* celular para dejar afuera al dueño. El secreto queda en `totp_pending` hasta que se confirma: un QR abandonado no protege nada ni deja la cuenta a medias.
- **Códigos de recuperación**: 10, de un solo uso, se muestran **una única vez** al activar. Se guardan con SHA-256 (no bcrypt: tienen 40 bits al azar, y bcrypt bloquearía el hilo una vez por código). Sirven en el login y para desactivar.
- **Activarla o desactivarla cierra las demás sesiones** de la cuenta (ver *Sesiones*): la pestaña desde la que se hizo recibe un token nuevo y sigue conectada.
- Si alguien pierde el celular **y** los códigos, se apaga desde el servidor (DEPLOY.md, *Verificación en dos pasos*). Restablecerle la contraseña desde el panel **no** alcanza: el 2FA sigue activo.
- La política de privacidad menciona la clave y los hashes que se guardan: si cambia lo que se persiste, se actualiza el texto.

## Sesiones (`server/auth.js`) — IMPORTANTE

Un JWT firmado vale hasta que vence, y antes no había forma de cortarlo: quien copiara la "llave" del navegador del admin entraba días enteros, con 2FA o sin él. Ahora cada token se revalida contra la base.

- **Versión de sesión**: `users.session_version` viaja dentro del token como `sv`. **`sessionAccount(token)`** es el único camino para pasar de token a cuenta (lo usan `requireAuth` y el handshake): firma válida + cuenta existente + `sv` igual a la de la base. `users.bumpSessionVersion()` invalida todos los tokens de la cuenta en el acto. Los tokens anteriores a esta columna no traen `sv` y vuelven al login una vez.
- **El rol se lee de la fila, nunca del token.** `requireAuth` deja en `req.user` el rol de la base y rechaza con 403 a una cuenta baneada; `isAdmin()` (`server/socket.js`) vuelve a mirar rol y versión en cada acción de moderación, porque un socket puede seguir abierto después de que cambiaron.
- **Duración**: admin **12 h**, resto **7 días** (`TOKEN_TTL`). El handshake es el único momento en que se mira el token, así que cada socket registrado tiene un timer que lo **corta cuando el token vence** — si no, una conexión abierta sobreviviría días a su token.
- **`revokeSessions()`** (`server/socket.js`) sube la versión y desconecta **todos** los sockets de la cuenta (recorre `io.sockets.sockets`, no solo `usersOnline`: uno que no hizo `join` también tiene el token viejo). Con `keepSocketId` deja viva la pestaña que pidió el cambio, actualizándole la versión.
- **Cuándo se cierran**: botón *Cerrar sesión en todos los dispositivos* del `AdminModal` (`POST /api/sessions/revoke`, incluye la propia; no pide contraseña: con un token robado lo único que se logra es echarse a uno mismo también), y al **activar o desactivar el 2FA** (devuelven un token nuevo; el cliente manda `X-Socket-Id` para que su pestaña siga). **Cualquier cambio en cómo se entra a la cuenta** tiene que pasar por `revokeSessions()` igual — hoy lo hacen también los dos de contraseña (abajo).
- **Contraseña** (`server/routes.js`, ambos con `loginLimiter`): las reglas viven en **`passwordProblem()`**, que usa también el registro (mínimo 6; máximo **72 bytes**, porque bcrypt ignora en silencio lo que sigue). `POST /api/password` (*Mi perfil → Contraseña*, `PasswordSection`) pide la actual, y el código si la cuenta tiene 2FA (si no, token + contraseña robados dejarían afuera al dueño); devuelve token nuevo, como el 2FA (`replaceToken()` en `client/src/lib/session.js`). `POST /api/users/:u/password` (*Panel → Contraseña*) es el restablecimiento por el admin: pide **su** contraseña y su código —con un token de admin robado solo nadie se adueña de cuentas ajenas—, nunca sobre un admin ni sobre sí mismo, y echa a todas las sesiones de esa cuenta. No hay recuperación por email: la nueva se pasa por fuera del chat.
- **Cliente**: el `auth` del socket en `ChatPage` es una **función** que lee `getSession()` en cada reconexión; con un objeto fijo, la reconexión usaría el token anterior al cambio y nos sacaría.

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

**Marca.** El logo es `client/src/components/Logo.jsx`: dos trazados SVG (emblema y texto) vectorizados del original `docs/brand/logo-original.png`, que es morado. Por decisión de producto la forma se mantiene y el color es el de la app: va en **`currentColor`** (se usa con `text-accent-ink`), así que cambia solo con el modo oscuro. **No le pongas un color fijo.** `Logo` (emblema + texto) va en `AgeGate` y `AuthPage`; el encabezado del sidebar lleva **solo `LogoMark`**, sin el texto (decisión del usuario). Siempre con el nombre en `sr-only` dentro del h1/h2. **Favicon e íconos del celular** (`client/public/`: `favicon.svg`/`.ico`, `apple-touch-icon.png`, `icon-192/512.png`, `site.webmanifest`) son otro dibujo: un **fantasmita** blanco cuya cola termina en la punta de un globo de mensaje, sobre un cuadrado verde petróleo. Está hecho a mano en `favicon.svg` (cuadrícula 32×32) y los PNG/ICO se generan desde ahí: el `.ico` de 16 px va sin sonrisa ni mejillas y el `apple-touch-icon` sin esquinas redondeadas (iOS las redondea solo). Antes se probó el emblema reducido como favicon y en la pestaña no se distinguía nada: **no vuelvas a achicar el logo para íconos**.

**Modo nocturno:** clase `dark` en `<html>`, no media query — `@custom-variant dark` en el CSS. `client/src/lib/theme.js` es la fuente de verdad (store mínimo con `useSyncExternalStore` + `localStorage` bajo `chatnopolis-theme`); `ThemeToggle.jsx` lo dispara y está en el header del sidebar, en la homepage y en `AuthPage`. Sin preferencia guardada **se sigue al sistema** y se reacciona a sus cambios en vivo; el toggle la fija y pasa a mandar. `client/public/theme-init.js` (script clásico, cargado en el `<head>` de `index.html`) aplica la clase antes del primer pintado para que no haya flash blanco — **si cambiás la clave de localStorage hay que cambiarla en los dos lados**. Es un archivo y no un script inline por la CSP (ver *Cabeceras de seguridad*). `emoji-picker-react` no ve el CSS: recibe el tema por prop desde `useTheme()`.

## Convenciones / notas

- **Una sala a la vez, y cualquiera puede cambiar.** La sala inicial se elige **antes de entrar** (el `<select>` de `AuthPage`, que se llena con `GET /api/rooms`); `/entrar?sala=<id>` la trae preseleccionada (los botones "Entrar a esta sala" de la homepage), y un id que no existe cae en la primera sala. En el sidebar de `ChatPage` el usuario común ve **"Tu sala"** y un botón **Cambiar** que despliega las demás (`showRoomPicker` → `visibleRooms`); el admin ve siempre la lista entera de `roomsMap`, porque moderar es recorrerlas. Al elegir una, el cliente emite `join` y el servidor sale de la sala anterior, entra a la nueva y reenvía el historial: cada socket está en **una sola** sala (`usersOnline[socket.id].room`). `roomId` es estado con un `roomIdRef` para que el handler `message` (registrado una sola vez) enrute al valor actual. El botón de la sala propia sigue siendo clickeable: estando en un DM es la forma de volver a la sala.
- **Los privados sobreviven al cambio de sala.** El servidor rutea los DM por identidad (`socketIdsFor()`), no por sala, y el cliente no toca `dms`/`chats` al cambiar — solo se reemplaza el historial de la sala nueva. Lo que sí cambia es `UserList`: muestra los conectados **de la sala actual**, así que alguien de otra sala sale de la lista pero su DM abierto sigue en el sidebar.
- **Cerrar un privado** (la X de cada DM en el sidebar, `closeDM()`) solo lo saca de `dms`: **no borra nada**, ni en el servidor ni en `chats`, así que reabrirlo muestra lo hablado. Si el otro vuelve a escribir, el handler `message` lo reabre solo. La X aparece con hover y, como en el celular no hay hover, siempre en la conversación activa.
- **Género** (`hombre` / `mujer` / `otro`, `GENDERS` en `server/profile.js`): obligatorio para entrar como invitado (viaja en el **handshake**, `auth.gender`, validado justo después de `terms`) y para registrarse (`POST /api/register` → 400). Registrados: `users.gender`; las cuentas anteriores quedan en `NULL` — no se les inventa uno. Invitados: solo en `socket.user`. Viaja a todos en `roomUsers` (`gender`, `null` si no hay) y `UserList` lo pinta como etiqueta al lado del nombre, con un color por género (`tag` en `client/src/lib/gender.js`: azul / rosa / violeta; `picked` es el mismo color en el `GenderPicker`), y filtra con píldoras en una sola fila **Todos / Hombres / Mujeres / Otro** (quien no tiene género solo aparece en Todos; en su propia fila ve "+ Género", que abre Mi perfil). El filtro es estado de `UserList`, compartido por la columna y el drawer móvil. La política de privacidad lo menciona: si cambia lo que se guarda, se actualiza el texto.
- **Usuarios en línea en móvil:** `UserList.jsx` renderiza el mismo contenido dos veces — columna fija (`hidden md:flex`) y drawer overlay a la derecha (`md:hidden`) controlado por las props `open`/`onClose` desde `ChatPage`. Se abre con el icono 👥 del header móvil, que muestra el contador de conectados.
- **Emojis:** botón 😊 en `MessageInput.jsx` abre un popover con `emoji-picker-react`; el emoji se inserta en la posición del cursor y viaja como texto normal (sin cambios en servidor ni base de datos).
- **`JWT_SECRET` es obligatoria y el modo estricto es el default** (`server/auth.js`): sin ella el proceso aborta con instrucciones, y también rechaza los valores de ejemplo (el de `DEPLOY.md`, el viejo default del repo). El chequeo **no** pregunta por `NODE_ENV === 'production'` porque nadie la setea en el VPS — pm2 arranca sin ella y el chequeo no protegería nada. Se relaja solo con `NODE_ENV=development`, que lo pone `nodemon.json`, así que `npm run dev` sigue andando sin `.env` (con aviso). Si agregás otro script de arranque para desarrollo, tiene que setear esa variable.
- El rol de admin se valida **en el servidor** tanto en REST (`requireAdmin`) como en socket — nunca confiar en el flag del cliente.
- El fetch wrapper (`client/src/lib/api.js`) adjunta `Authorization: Bearer <token>` y serializa JSON salvo cuando el body es `FormData` (upload).
- Deploy en VPS (nginx + pm2 + HTTPS + backups): ver **DEPLOY.md**.

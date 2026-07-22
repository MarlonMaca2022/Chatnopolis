# Chatnopolis

Chat web en tiempo real con salas, mensajes privados, envío de fotos y panel de administración.

**Stack:** React (Vite + Tailwind) · Node.js + Express + Socket.IO · SQLite (`node:sqlite`)

## Requisitos

- Node.js **22.5 o superior** (usa el módulo SQLite nativo de Node)

## Desarrollo

```bash
npm install                  # dependencias del backend
npm --prefix client install  # dependencias del frontend

npm run dev          # backend en http://localhost:3000 (con nodemon)
npm run dev:client   # frontend Vite en http://localhost:5173 (proxy al backend)
```

Abre `http://localhost:5173`. Usuario admin inicial: `admin` / `admin123` (cámbialo en producción con la variable `ADMIN_PASSWORD`, ver [DEPLOY.md](DEPLOY.md)).

## Producción

```bash
npm run build   # compila React a client/dist
npm start       # el backend sirve la app compilada en :3000
```

Guía completa de despliegue en VPS (nginx, pm2, HTTPS, backups): **[DEPLOY.md](DEPLOY.md)**.

## Estructura

```
server/          Backend Express + Socket.IO
  index.js       Arranque, estáticos y SPA fallback
  db.js          SQLite: usuarios, salas, mensajes, bans
  auth.js        Tokens JWT
  routes.js      API REST (login, registro, salas, subida de fotos)
  socket.js      Chat en tiempo real (rol verificado server-side)
client/          Frontend React (Vite + Tailwind v4)
  src/pages/     AuthPage (invitado/login/registro), ChatPage
  src/components/  Mensajes, input con fotos, usuarios, panel admin
data/chat.db     Base de datos (se crea sola, no va al repo)
uploads/         Fotos compartidas (no va al repo)
```

## Funcionalidades

- Entrar como invitado o con cuenta registrada (contraseñas con bcrypt, sesión JWT)
- Salas de chat con historial persistente
- Mensajes privados (DM) con historial
- Envío de fotos (jpg/png/gif/webp, máx. 5 MB) con vista previa
- Admin: crear/eliminar salas, silenciar, expulsar y banear usuarios

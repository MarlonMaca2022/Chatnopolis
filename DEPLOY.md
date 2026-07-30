# Despliegue de Chatnopolis en un VPS

Guía para un VPS con Ubuntu 22.04/24.04 (DigitalOcean, Hetzner, Vultr, etc.).
El stack en producción: **Node 22+ · SQLite · pm2 · nginx · Let's Encrypt**.

## 1. Preparar el servidor

```bash
# Conéctate por SSH
ssh root@TU_IP

# Actualiza e instala Node 22 LTS
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx

# Crea un usuario sin privilegios para la app
adduser --disabled-password chatnopolis
```

## 2. Subir el código

```bash
su - chatnopolis
git clone https://github.com/TU_USUARIO/Chatnopolis.git
cd Chatnopolis

npm install                 # backend
npm --prefix client install # frontend
npm run build               # compila React a client/dist
```

## 3. Variables de entorno

Crea `/home/chatnopolis/Chatnopolis/.env`:

```env
PORT=3000
JWT_SECRET=                                        # OBLIGATORIA. Generala con: openssl rand -hex 32
ADMIN_PASSWORD=una-contraseña-fuerte-para-admin    # solo se usa al crear la DB por primera vez

# Opcionales (estos son los valores por defecto)
ROOM_HISTORY_LIMIT=500     # mensajes que se conservan por sala; los viejos se borran solos
PHOTO_TTL_MINUTES=1440     # vida de una foto en disco (24 h). 0 = sin vencimiento por tiempo
```

> **`JWT_SECRET` es obligatoria: sin ella el servidor no arranca** y te imprime cómo generarla.
> Es a propósito — con ese secreto se firman las sesiones, y si el servidor usara uno de
> ejemplo cualquiera podría fabricarse un token de administrador. También rechaza los
> valores de ejemplo copiados tal cual y avisa si tiene menos de 32 caracteres.
> Cambiarla más adelante es seguro: solo obliga a todos a volver a iniciar sesión.

> **Importante:** `ADMIN_PASSWORD` solo aplica la primera vez que se crea `data/chat.db`.
> Si ya arrancaste el servidor sin ella, borra `data/chat.db` y reinicia (perderás datos)
> o cambia el hash manualmente.

## 4. Mantener la app corriendo con pm2

```bash
sudo npm install -g pm2
pm2 start server/index.js --name chatnopolis
pm2 save
pm2 startup    # sigue las instrucciones que imprime para arrancar al reiniciar el VPS
```

## 5. nginx como reverse proxy (con WebSockets)

Como root, crea `/etc/nginx/sites-available/chatnopolis`:

```nginx
server {
    listen 80;
    server_name tudominio.com;

    # Las fotos pueden pesar hasta 5 MB
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        # Necesario para Socket.IO (WebSockets)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/chatnopolis /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 6. HTTPS con Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d tudominio.com
```

Certbot renueva automáticamente. Verifica con `certbot renew --dry-run`.

## 7. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

El puerto 3000 queda inaccesible desde fuera: solo nginx habla con la app.

## 8. Backups

Todo el estado vive en dos lugares — respáldalos juntos:

| Qué | Dónde |
|---|---|
| Usuarios, salas y mensajes | `data/chat.db` |
| Fotos | `uploads/` |

Backup diario con cron (`crontab -e` como usuario chatnopolis):

```bash
0 3 * * * sqlite3 ~/Chatnopolis/data/chat.db ".backup ~/backups/chat-$(date +\%F).db" && tar czf ~/backups/uploads-$(date +\%F).tar.gz -C ~/Chatnopolis uploads
```

(Instala la CLI con `apt install sqlite3`. Usa `.backup` y no `cp` — es seguro con la DB en uso.)

## 9. Actualizar la app

```bash
cd ~/Chatnopolis
git pull
npm install && npm --prefix client install
npm run build
pm2 restart chatnopolis
```

## ¿Por qué SQLite y no Postgres/MongoDB?

- **Cero administración**: no hay servicio extra que configurar, asegurar ni actualizar en el VPS.
- **Un archivo = backup trivial** (`data/chat.db`).
- **Rendimiento sobrado**: SQLite en modo WAL maneja miles de escrituras/segundo; un chat personal no se le acerca.
- **Menos RAM**: Postgres ocioso consume ~100 MB; en un VPS de 1 GB eso importa.
- Las **fotos van al disco** (`uploads/`) y la DB guarda solo la ruta — meter blobs en cualquier base de datos es un antipatrón.

**Cuándo migrar a Postgres:** si algún día necesitas varios servidores detrás de un balanceador o decenas de miles de usuarios concurrentes. El esquema (tablas `users`, `rooms`, `messages`) se traslada casi sin cambios.

## Endurecimiento pendiente (ideas futuras)

- Rate limiting en `/api/login`, `/api/register` y `/api/upload` (p. ej. `express-rate-limit`).
- **Exigir sesión para subir fotos** — hoy `POST /api/upload` es público: cualquiera puede
  subir 5 MB por pedido sin estar en el chat y llenar el disco. Los invitados no tienen
  cuenta, así que el arreglo necesita darles un pase temporal al entrar.
- Verificar que el admin de producción **no** haya quedado con la contraseña por defecto
  (pasa si el primer arranque fue sin `ADMIN_PASSWORD`): probá `admin` / `admin123` en el
  login; si entra, hay que cambiarla.
- Servir `uploads/` desde nginx directamente para quitarle carga a Node.

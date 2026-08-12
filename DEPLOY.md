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
TRUST_PROXY=1                                      # PONELA si hay nginx delante (este manual lo pone)

# Opcionales (estos son los valores por defecto)
ROOM_HISTORY_LIMIT=500     # mensajes que se conservan por sala; los viejos se borran solos
DM_RETENTION_DAYS=90       # vida de un mensaje privado. 0 = sin vencimiento
DM_PAIR_LIMIT=500          # máximo de privados guardados por conversación
PHOTO_TTL_MINUTES=1440     # vida de una foto en disco (24 h). 0 = sin vencimiento por tiempo
PHOTO_DISK_LIMIT_MB=500    # techo de la carpeta uploads/. Al llegar, se rechazan subidas nuevas
```

> **`TRUST_PROXY=1` es importante y es fácil de olvidar.** Con nginx delante, todas las peticiones
> le llegan a Node desde `127.0.0.1`: sin esta variable, los límites por IP (intentos de login,
> altas de cuentas, conexiones) verían **una sola IP** y se aplicarían al tráfico entero — el
> primer abusivo dejaría afuera a todos los demás. No está encendida por defecto porque hacerlo
> sería peor: un servidor **sin** proxy delante creería la cabecera `X-Forwarded-For` que le mande
> cualquiera, y los límites se saltarían mandando una IP inventada en cada intento. El arranque
> imprime cuál de los dos modos está activo — miralo en `pm2 logs`.

> **`DM_RETENTION_DAYS` es el techo de la base de datos.** Las salas ya se recortan solas a 500
> mensajes y las fotos vencen por TTL, pero los privados no tenían ningún límite: eran el único
> lugar donde se podía escribir para siempre. Ahora se borran a los 90 días y se guardan como
> mucho 500 por conversación. Si tu chat es de uso personal y querés conservar todo, poné
> `DM_RETENTION_DAYS=0` — pero entonces vigilá el tamaño de `data/chat.db`.

> **`PHOTO_DISK_LIMIT_MB` es el freno de mano contra el disco lleno.** Ponelo en función de lo
> que tenga el VPS: si el disco es de 25 GB, 500 MB es holgado. Cuando la carpeta llega al
> techo, las subidas responden 507 con un mensaje claro y el chat sigue funcionando; el
> espacio se recupera solo cuando el TTL vence las fotos viejas. Mirá el arranque del log:
> imprime `disco X MB de Y MB`. Un disco lleno sí frena a SQLite y ahí se cae todo.

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

Ya hecho: rate limiting en `/api/login` y `/api/register`, límite de ritmo de conexiones y de
mensajes por socket, techo de retención para los privados y `nosniff` en `/uploads`.
Ver la sección *Límites de frecuencia* de CLAUDE.md. Queda:

- **`requireAuth` no revalida contra la base**: confía en lo que dice el token. Un admin baneado
  conserva el panel por REST hasta que el token expira (7 días). El socket sí lo chequea. Se
  arregla consultando `users.findByNick()` + `banStatus()` dentro del middleware.
- `helmet` para el resto de las cabeceras de seguridad (CSP, HSTS, referrer-policy).
- Validar las fotos por **magic bytes**, no solo por el `Content-Type` que declara quien sube.
- `multer` 1.x está EOL: subir a 2.x.
- Tokens de sesión más cortos con renovación, y una forma de invalidarlos al banear.
- Verificar que el admin de producción **no** haya quedado con la contraseña por defecto
  (pasa si el primer arranque fue sin `ADMIN_PASSWORD`): probá `admin` / `admin123` en el
  login; si entra, hay que cambiarla.
- Servir `uploads/` desde nginx directamente para quitarle carga a Node.
- Si aparece spam de bots pese a los límites: un desafío tipo "no soy un robot" en el registro
  y en la entrada como invitado (Cloudflare Turnstile es la opción sin costo ni tracking).

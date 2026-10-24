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
ADMIN_USERNAME=un-nombre-propio                    # idem; sin ella el admin se llama "admin"
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

> **Importante:** `ADMIN_PASSWORD` y `ADMIN_USERNAME` solo aplican la primera vez que se crea
> `data/chat.db`. Si ya arrancaste el servidor sin la contraseña, borra `data/chat.db` y
> reinicia (perderás datos) o cambia el hash manualmente. Para el nombre, ver la sección 11.
>
> **Conviene no dejarlo en `admin`:** es el primer nombre que prueba un bot, y en el chat le
> dice a todos qué cuenta atacar. `admin`, `moderador`, `soporte`, `staff` y parecidos quedan
> reservados (nadie los puede tomar como invitado ni registrar), así que nadie se hace pasar
> por la moderación con ellos.

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

> **Los logs de nginx guardan IPs, y la política de privacidad lo declara.** La app no
> registra direcciones IP en la base (solo las usa en memoria para los límites de
> frecuencia), pero `access.log` sí las escribe, como cualquier servidor web. El texto de
> `/privacidad` dice exactamente eso, así que **la afirmación es cierta solo si la
> retención de esos logs es acotada**. Debian y Ubuntu ya rotan `/var/log/nginx` a 14 días
> vía `logrotate`; si lo cambiás a algo mucho más largo, o si activás un log adicional,
> corresponde actualizar el texto en `client/src/lib/legal.js`. Si preferís no guardarlas,
> `access_log off;` en el bloque `server` alcanza — perdés diagnóstico a cambio.

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

## 10. Verificación en dos pasos del admin

Se activa desde la app: **Panel de Administración → Verificación en dos pasos → Activar**,
escaneando el QR con Google Authenticator, Authy o similar. Al confirmar se muestran **10
códigos de recuperación una sola vez**: guardalos fuera del celular (gestor de contraseñas,
papel). Cada uno reemplaza al código de la app en un login.

**Si se perdió el celular y también los códigos**, se apaga desde el servidor (como el
usuario de la app; es seguro con la app corriendo, igual que `.backup`):

```bash
sqlite3 ~/Chatnopolis/data/chat.db \
  "UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = -1, totp_recovery = NULL
   WHERE role = 'admin';"
```

Va por rol y no por nombre para no tener que escribir acá cómo se llama el admin. Si hay más
de un admin, se los apaga a todos: cada uno la vuelve a activar.

Después entrá con la contraseña sola y volvé a activarla con el celular nuevo. Quien puede
correr eso ya tiene acceso al servidor, así que no abre ninguna puerta nueva: por eso importa
que el SSH entre **solo con llave**.

### Si sospechás que alguien entró con la cuenta del admin

Desde la app: **Panel de Administración → Sesiones → Cerrar sesión en todos los dispositivos**.
Cualquier sesión abierta, incluida la de quien tenga una copia de la llave, deja de valer en
el acto y su conexión se corta. Después entrás de nuevo con contraseña y código.

Si no podés entrar a la app, se hace lo mismo desde el servidor. No hace falta reiniciar: cada
pedido compara la versión contra la base, y una conexión ya abierta pierde los permisos de
admin en su próxima acción y queda afuera en cuanto se corte o venza (12 h como mucho).

```bash
sqlite3 ~/Chatnopolis/data/chat.db \
  "UPDATE users SET session_version = session_version + 1 WHERE role = 'admin';"
```

Si además sospechás que se filtró la contraseña, cambiala (hoy, editando el hash con `sqlite3`;
ver *Endurecimiento pendiente*). Como último recurso, cambiar `JWT_SECRET` en `.env` y
`pm2 restart chatnopolis` cierra las sesiones de **todas** las cuentas.

## 11. Renombrar una cuenta (por ejemplo, el admin)

El nombre aparece en la cuenta, en sus mensajes y en las salas que creó: hay que cambiarlo en
los tres lados a la vez. Hacé un backup antes (`~/bin/backup.sh` o el comando del paso 8) y
reemplazá `viejo` / `Nuevo` (la canónica es el nombre sin tildes ni espacios y en minúsculas):

```bash
sqlite3 ~/Chatnopolis/data/chat.db <<'SQL'
BEGIN;
UPDATE users    SET username = 'Nuevo', username_canon = 'nuevo' WHERE username = 'viejo';
UPDATE messages SET sender    = 'Nuevo' WHERE sender    = 'viejo';
UPDATE messages SET recipient = 'Nuevo' WHERE recipient = 'viejo';
UPDATE rooms    SET created_by = 'Nuevo' WHERE created_by = 'viejo';
COMMIT;
SQL
pm2 restart chatnopolis
```

El `restart` corta las sesiones abiertas con el nombre viejo: el token ya no encuentra la
cuenta y pide volver a entrar. El 2FA sigue funcionando; la app del celular muestra la
etiqueta vieja, que se puede editar ahí mismo.

## ¿Por qué SQLite y no Postgres/MongoDB?

- **Cero administración**: no hay servicio extra que configurar, asegurar ni actualizar en el VPS.
- **Un archivo = backup trivial** (`data/chat.db`).
- **Rendimiento sobrado**: SQLite en modo WAL maneja miles de escrituras/segundo; un chat personal no se le acerca.
- **Menos RAM**: Postgres ocioso consume ~100 MB; en un VPS de 1 GB eso importa.
- Las **fotos van al disco** (`uploads/`) y la DB guarda solo la ruta — meter blobs en cualquier base de datos es un antipatrón.

**Cuándo migrar a Postgres:** si algún día necesitas varios servidores detrás de un balanceador o decenas de miles de usuarios concurrentes. El esquema (tablas `users`, `rooms`, `messages`) se traslada casi sin cambios.

## Endurecimiento pendiente (ideas futuras)

Ya hecho: rate limiting en `/api/login` y `/api/register`, límite de ritmo de conexiones y de
mensajes por socket, techo de retención para los privados, `nosniff` en `/uploads` y sesiones
revocables con tokens de admin de 12 h, y cabeceras de seguridad con `helmet` (CSP, HSTS de
180 días, referrer-policy). Ver las secciones *Límites de frecuencia*, *Sesiones* y *Cabeceras
de seguridad* de CLAUDE.md. Queda:

- Validar las fotos por **magic bytes**, no solo por el `Content-Type` que declara quien sube.
- `multer` 1.x está EOL: subir a 2.x.
- **No existe forma de cambiar una contraseña desde la app** — no hay endpoint ni pantalla.
  De ahí que `ADMIN_PASSWORD` haya que acertarla en el primer arranque: si el admin quedó
  con `admin123` (que es pública), las únicas salidas son borrar `data/chat.db` y empezar
  de nuevo, o editar el hash a mano con `sqlite3`. Falta un `POST /api/password` que pida
  la contraseña actual, y que el admin pueda resetear la de otro.
- Servir `uploads/` desde nginx directamente para quitarle carga a Node.
- Si aparece spam de bots pese a los límites: un desafío tipo "no soy un robot" en el registro
  y en la entrada como invitado (Cloudflare Turnstile es la opción sin costo ni tracking).

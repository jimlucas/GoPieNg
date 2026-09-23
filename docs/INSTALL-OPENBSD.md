# Installing GoPieNg on OpenBSD

This guide installs GoPieNg on OpenBSD with PostgreSQL and the base-system `httpd(8)`. GoPieNg has native OpenBSD support, including `pledge(2)`, privilege separation, FastCGI over a Unix socket, and embedded frontend assets.

The examples use `/var/www/pieng` for the externally served frontend when FastCGI API-only mode is used and `/var/www/run/gopieng.sock` for the FastCGI socket.

## 1. Install packages

Install Git, Go, and PostgreSQL from packages:

```sh
doas pkg_add git go postgresql-server postgresql-client
```

GoPieNg's `go.mod` requires Go 1.22.3 or newer:

```sh
go version
```

## 2. Initialize PostgreSQL

If this is a new PostgreSQL installation, initialize the database cluster using the version-specific instructions printed by the OpenBSD PostgreSQL package. Enable and start PostgreSQL after initialization:

```sh
doas rcctl enable postgresql
doas rcctl start postgresql
```

Create the application role and database. Depending on the PostgreSQL package/version, the administrative account may be `_postgresql`:

```sh
doas -u _postgresql psql postgres
```

At the PostgreSQL prompt:

```sql
CREATE ROLE pieng LOGIN PASSWORD 'CHANGE_ME_DATABASE_PASSWORD';
CREATE DATABASE pieng OWNER pieng;
\q
```

## 3. Obtain and build GoPieNg

```sh
cd /usr/local/src
doas git clone https://github.com/jimlucas/GoPieNg.git
cd GoPieNg
doas go build -o /usr/local/bin/gopieng ./cmd/server
doas chmod 0755 /usr/local/bin/gopieng
```

Initialize the schema:

```sh
psql 'postgres://pieng:CHANGE_ME_DATABASE_PASSWORD@127.0.0.1:5432/pieng?sslmode=disable' \
  -f /usr/local/src/GoPieNg/schema.sql
```

## 4. Create the GoPieNg account

GoPieNg looks for an unprivileged account in this order when started as root: `_gopieng`, `_pieng`, `www`, then `nobody`.

Creating a dedicated account is recommended:

```sh
doas useradd -c "GoPieNg daemon" -d /nonexistent -s /sbin/nologin _gopieng
```

## 5. Prepare the FastCGI socket directory

OpenBSD `httpd(8)` runs chrooted under `/var/www`. Place the FastCGI socket under `/var/www/run`:

```sh
doas mkdir -p /var/www/run
doas chown root:www /var/www/run
doas chmod 0775 /var/www/run
```

When GoPieNg starts as root with `-socket /var/www/run/gopieng.sock`, it creates the socket before dropping privileges. By default it chroots to the socket directory and drops to the first suitable unprivileged account. The socket group defaults to `www`.

## 6. Configure environment variables

Generate a JWT signing secret:

```sh
openssl rand -hex 32
```

GoPieNg requires:

```text
PIENG_DSN=postgres://pieng:CHANGE_ME_DATABASE_PASSWORD@127.0.0.1:5432/pieng?sslmode=disable
PIENG_JWT_SECRET=REPLACE_WITH_THE_GENERATED_SECRET
```

Optional variables include:

```text
PIENG_USER=_gopieng
PIENG_SOCKET_GROUP=www
PIENG_CHROOT=/var/www/run
PIENG_TRUSTED_PROXIES=127.0.0.1/32
```

For an `rc.d(8)` service, set these variables in the service command environment rather than placing secrets in `httpd.conf`.

## 7. Install frontend files for httpd

When using GoPieNg with `-no-static`, copy the frontend into the httpd chroot:

```sh
doas mkdir -p /var/www/pieng
doas cp -R /usr/local/src/GoPieNg/web/* /var/www/pieng/
doas chown -R root:wheel /var/www/pieng
doas chmod -R a+rX /var/www/pieng
```

The frontend is vanilla JavaScript and requires no Node.js build.

## 8. Create an rc.d service

Create `/etc/rc.d/gopieng`:

```sh
#!/bin/ksh

daemon="/usr/local/bin/gopieng"
daemon_flags="-d -no-static -socket /var/www/run/gopieng.sock"

. /etc/rc.d/rc.subr

rc_reload=NO
rc_bg=NO

rc_cmd $1
```

Make it executable:

```sh
doas chmod 0555 /etc/rc.d/gopieng
```

Because GoPieNg needs its database DSN and JWT secret in its environment, configure the service with an environment wrapper or an appropriately protected local rc.d customization. Do not put secrets in world-readable files.

One straightforward approach is to create `/etc/gopieng.env` mode `0600` and a root-owned wrapper that exports the values before executing GoPieNg. Ensure the environment is available to the daemon before enabling it.

The `-d` flag is intentional under `rc.d`: it keeps GoPieNg in the foreground so `rc.d` supervises the actual daemon process.

Enable and start the service after its environment is configured:

```sh
doas rcctl enable gopieng
doas rcctl start gopieng
```

Check the process and logs:

```sh
doas rcctl check gopieng
tail -f /var/log/daemon
```

## 9. Configure httpd

Add a server to `/etc/httpd.conf`:

```text
server "ipam.example.com" {
    listen on * port 80
    root "/pieng"

    location "/api/pieng/*" {
        fastcgi socket "/run/gopieng.sock"
    }

    location "/health" {
        fastcgi socket "/run/gopieng.sock"
    }

    location "/*.css" {
        pass
    }

    location "/*.js" {
        pass
    }

    location "/*" {
        request rewrite "/index.html"
    }
}
```

Paths in `httpd.conf` are interpreted inside httpd's `/var/www` chroot. Therefore `/run/gopieng.sock` corresponds to the host path `/var/www/run/gopieng.sock`, and `root "/pieng"` corresponds to `/var/www/pieng`.

Check and start httpd:

```sh
doas httpd -n
doas rcctl enable httpd
doas rcctl start httpd
```

Configure TLS before exposing the application to untrusted networks. OpenBSD's `acme-client(1)` and `httpd(8)` can be used for certificate issuance and TLS termination.

## 10. Verify the installation

From the server:

```sh
ftp -o - http://127.0.0.1/health
```

A healthy installation returns:

```text
ok
```

Then open the configured hostname in a browser and verify that the GoPieNg login page loads.

## 11. Create the first administrator

The schema creates the roles but does not create a default administrator account. Create or migrate a user with a GoPieNg-compatible password hash, then grant the administrator role:

```sql
INSERT INTO user_roles ("user", role)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = 'admin'
  AND r.name = 'administrator'
ON CONFLICT DO NOTHING;
```

Do not store a plaintext password in `users.password`. Current GoPieNg passwords use Argon2id PHC strings; supported legacy hashes can be upgraded after a successful login.

## 12. Updating GoPieNg

Back up PostgreSQL first:

```sh
doas -u _postgresql pg_dump -Fc pieng > /var/backups/pieng-$(date +%F).dump
```

Then update and rebuild:

```sh
cd /usr/local/src/GoPieNg
doas git pull --ff-only
doas go build -o /usr/local/bin/gopieng ./cmd/server
doas cp -R web/* /var/www/pieng/
doas rcctl restart gopieng
```

Review `schema.sql`, `README.md`, and files under `docs/` for migration notes before upgrading an existing installation.

## Alternative: standalone HTTP mode

GoPieNg can instead run its embedded frontend and HTTP server directly:

```sh
PIENG_DSN='postgres://pieng:password@127.0.0.1:5432/pieng?sslmode=disable' \
PIENG_JWT_SECRET='a-secret-at-least-32-characters-long' \
/usr/local/bin/gopieng -web -addr 127.0.0.1:8080
```

A reverse proxy can then forward requests to `127.0.0.1:8080`. FastCGI is documented above because it integrates naturally with OpenBSD `httpd(8)`.

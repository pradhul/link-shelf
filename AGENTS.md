<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local development environment (Cloud Agents)

The `.cursor/` environment provisions a fully local stack so the app runs without a
cloud Neon database. It changes **no application code**:

- The app uses the Neon serverless HTTP driver, which sends queries to
  `https://<db-host>/sql`. `.cursor/neon-proxy/proxy.mjs` implements that same
  wire protocol on `:443` and forwards to a local Postgres via `node-postgres`.
- `DATABASE_URL` host is `db.link-shelf.local` (in `/etc/hosts` → `127.0.0.1`);
  the driver rewrites it to `api.link-shelf.local` for the `/sql` endpoint. Both
  names are covered by the self-signed cert in `/etc/neon-local-proxy/`, trusted
  via `NODE_EXTRA_CA_CERTS`.
- `.cursor/setup/install.sh` installs Postgres, applies `drizzle/*.sql`, generates
  the cert, and writes `.env.local`. `.cursor/setup/start.sh` starts Postgres.
- The `neon-db-proxy` and `next-dev` terminals run the proxy and dev server.
- Dev household login password: `shelf-dev`. App runs at http://localhost:3000.

Telegram and Gemini keys are optional; the app degrades gracefully when unset.

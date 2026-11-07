# OIDC with Cloudflare Access (solo operator)

Compass does not use Cloudflare Workers as an IdP. Use **Zero Trust → Access → SaaS application → OIDC**.

## 1. Access application

1. Create a SaaS OIDC app.
2. Redirect URL: `https://<your-compass-origin>/api/auth/callback` (local: `http://localhost:3000/api/auth/callback`).
3. Scopes: `openid`, `email`, `profile`. Enable PKCE.
4. Access policy: **Include → Emails →** your address only.
5. Copy **Issuer**, **Client ID**, **Client secret** (exact issuer from discovery).

Issuer shape:

`https://<team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>`

## 2. Compass config

```sh
cp config/auth/oidc-entitlements.example.yaml config/auth/oidc-entitlements.yaml
# set principals[0].email to the same address as the Access policy
```

`.env.local`:

```sh
AUTH_MODE=oidc
APP_MODE=local   # or demo once OIDC works; production needs provider model + DATABASE_URL
OIDC_ISSUER=https://<team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>
OIDC_CLIENT_ID=<client-id>
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
OIDC_ENTITLEMENTS_FILE=./config/auth/oidc-entitlements.yaml
```

Restart `pnpm dev:node`. The UI shows **Sign in** → Access → callback → session only if your email is in both Access and `oidc-entitlements.yaml`.

## Notes

- Login PKCE state is a short-lived signed HttpOnly cookie (`compass_oidc_login`), not process memory.
- Entitlements are an email allowlist; Access custom claims are not required.
- Local persona login is disabled while `AUTH_MODE=oidc`.

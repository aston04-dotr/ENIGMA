# Enigma Web (PWA)

Next.js App Router, mobile-first PWA. Supabase (auth, DB, Realtime) — та же схема, что и у нативного клиента.

## Запуск

```bash
cd web
cp .env.example .env.local
# заполните NEXT_PUBLIC_SUPABASE_* из Supabase Dashboard → Settings → API
# для production используйте .env.production.example
# для локальной разработки используйте .env.development.example

npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## PWA

- `public/manifest.json` — добавьте `public/icons/icon-192.png` и `icon-512.png` (или обновите пути).
- Magic link Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://enigma-app.online/auth/callback`
- Supabase Site URL: `https://enigma-app.online`
- Service Worker: `public/sw.js` (кэш статики + оболочка).

## Env (production)

- `NEXT_PUBLIC_SITE_URL=https://enigma-app.online`
- `NEXT_PUBLIC_API_BASE_URL=https://api.enigma-app.online`
- `NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY`
- `NEXT_PUBLIC_LISTINGS_PAGE_SIZE=40` (для Pro/Large можно 40..80, предел в коде 10..200)
- `NEXT_PUBLIC_MAX_LISTING_PHOTOS=12` (для Pro/Large можно 12..20, предел в коде 1..30)
- `SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY` (только сервер)

## Pro / Large notes

- В `web` используется `@supabase/supabase-js` (browser/server clients), отдельного app-side connection pool здесь нет.
- Для роста трафика масштабирование connection pooling делается в Supabase Dashboard (Supavisor / Postgres settings).
- В коде web-auth нет искусственного throttling для `signInWithOtp`; ограничения остаются только на стороне Supabase Auth.

## Скрипты

- `npm run dev` — dev (Turbopack)
- `npm run build` / `npm run start` — продакшен

## Production sync (`/root/enigma/web`)

- Remote app path: `/root/enigma/web`
- PM2 process: `enigma-frontend`
- Never overwrite/delete remote `.env` during sync

Recommended flow:

```bash
# 1) Pull remote env once (safe sync of keys to local reference)
scp root@YOUR_SERVER:/root/enigma/web/.env ./web/.env.remote.backup

# 2) Sync code WITHOUT env files
rsync -avz --delete \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.*' \
  --exclude 'node_modules' \
  --exclude '.next' \
  ./web/ root@YOUR_SERVER:/root/enigma/web/

# 3) Build and restart on server
ssh root@YOUR_SERVER 'cd /root/enigma/web && npm run build && pm2 restart enigma-frontend'
```

If nginx is used as reverse proxy to `localhost:3000`, reload it after app restart:

```bash
ssh root@YOUR_SERVER 'sudo systemctl restart nginx && sudo systemctl status nginx --no-pager -l'
```

## Нативное приложение (Expo)

Код в корне репозитория (`app/`, `expo-router`) сохранён; веб живёт в `web/` отдельным приложением.

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
- `SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY` (только сервер)

## Скрипты

- `npm run dev` — dev (Turbopack)
- `npm run build` / `npm run start` — продакшен

## Нативное приложение (Expo)

Код в корне репозитория (`app/`, `expo-router`) сохранён; веб живёт в `web/` отдельным приложением.

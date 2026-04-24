# CHAT SYSTEM — FINAL LOCK (DO NOT BREAK)

## CRITICAL: THIS CHAT IS STABLE — DO NOT MODIFY CORE BEHAVIOR

Любые изменения ниже — только через явное согласование.

---

## 1. SCROLL SYSTEM (LOCKED)

- `scheduleScrollToBottom` (debounce 70ms)
- `runScrollToBottom` (inFlight + pending queue)
- `scrollToBottomImmediate` → только initial load

**Нельзя:**

- убирать debounce
- убирать inFlight защиту
- вызывать прямой `scrollIntoView` из других мест

---

## 2. STICK LOGIC (CORE)

- `stickBottomRef` — единственный источник истины
- определяет:
  - авто-скролл
  - поведение кнопки ↓

**Нельзя:**

- заменять на `useState`
- дублировать логику в других местах

---

## 3. SCROLL DOWN BUTTON

- всегда присутствует в DOM
- скрывается через:
  - opacity
  - translateY
  - `pointer-events-none`

**Нельзя:**

- удалять из DOM (layout shift)
- делать условный render

---

## 4. MESSAGE ANIMATION

- максимум 5 одновременно (`MAX_MESSAGE_ENTER_ANIM`)
- остальные сообщения без animation

**Нельзя:**

- убирать лимит
- анимировать всю пачку сообщений

---

## 5. RECEIPTS (✓ ✓✓)

- `receiptPop`:
  - scale 0.97 → 1
  - opacity 0.85 → 1
  - ease-out

**Нельзя:**

- добавлять дополнительные transition поверх keyframes
- менять тайминги без причины

---

## 6. SEND SCROLL BEHAVIOR

- если пользователь близко к низу → `behavior: "auto"`
- если далеко → `behavior: "smooth"`

**Нельзя:**

- всегда использовать `smooth`
- всегда использовать `auto`

---

## 7. BACKEND / REALTIME (HARD LOCK)

**Строго не трогать:**

- `mark_chat_read`
- `patchMessageFromRealtime`
- `delivered_at` / `read_at`
- realtime subscriptions
- `postgres_changes` UPDATE handling

Любые изменения там ломают: галочки, unread, синхронизацию.

---

## ПРИНЦИП

Этот чат уже: не дёргается, правильно скроллится, корректно синхронизируется, ощущается как production-мессенджер. Любая «оптимизация» без понимания системы = регрессия.

---

## РАЗРЕШЕНО

- визуальные улучшения (цвета, тени, отступы)
- новые фичи (реакции, медиа, звук)
- но **не** изменение текущей зафиксированной логики

---

END OF LOCK

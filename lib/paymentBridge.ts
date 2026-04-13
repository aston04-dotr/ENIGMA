/** После успешной оплаты слота публикации — экран «Создать» завершает вставку при фокусе. */
let publishSlotPaid = false;

export function markPublishSlotPaid() {
  publishSlotPaid = true;
}

export function isPublishSlotPaid() {
  return publishSlotPaid;
}

export function clearPublishSlotPaid() {
  publishSlotPaid = false;
}

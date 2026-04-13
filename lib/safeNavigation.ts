import type { Router } from "expo-router";

/** Не диспатчит GO_BACK без истории — убирает warning и «срыв» навигации в Expo Go / Android. */
export function safeGoBack(router: Router) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}

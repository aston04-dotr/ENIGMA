export const trackEvent = (event: string, data?: any) => {
  try {
    // Лёгкий трекер: позже можно заменить транспортом в backend/SDK.
    console.log("EVENT:", event, data);
  } catch {
    // no-op
  }
};

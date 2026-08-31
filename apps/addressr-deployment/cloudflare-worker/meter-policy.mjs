export const MAX_METER_ATTEMPTS = 12;

export function reconciliationWindow(now) {
  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() - 1);
  const start = new Date(end);
  start.setUTCHours(start.getUTCHours() - 1);
  return { start, end };
}

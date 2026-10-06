export const FOCUS_KEY = 'northstar.focus.v1';
export const REMINDER_SECONDS = 30 * 60;
export const REFLECTION_SECONDS = 60 * 60;

export function elapsedSeconds(session, now = Date.now()) {
  if (!session || !Number.isFinite(session.startedAt)) return 0;
  const end = Number.isFinite(session.stoppedAt) ? session.stoppedAt : now;
  return Math.max(0, Math.floor((end - session.startedAt) / 1000));
}

export function focusStage(seconds) {
  return seconds >= REFLECTION_SECONDS ? 'reflect' : seconds >= REMINDER_SECONDS ? 'reminder' : 'active';
}

export function formatTimer(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function normalizeSession(value) {
  if (!value || !Number.isFinite(value.startedAt) || value.startedAt < 0 || value.startedAt > Date.now() + 1000) return null;
  if (typeof value.app !== 'string' || !['TikTok', 'Instagram', 'Snapchat', 'Other'].includes(value.app)) return null;
  return { startedAt: value.startedAt, app: value.app, ...(Number.isFinite(value.stoppedAt) && value.stoppedAt >= value.startedAt ? {stoppedAt:value.stoppedAt} : {}) };
}

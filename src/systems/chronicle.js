import { SEASONS, SEASON_HOURS } from '../data/seasons.js';
import { log } from './log.js';

// Calendrier du royaume (dérivé du temps écoulé depuis la fondation)
export function calendar(state, now = Date.now()) {
  const h = Math.max(0, (now - (state.meta.created || now)) / 3600000);
  const idx = Math.floor(h / SEASON_HOURS);
  return { year: 1 + Math.floor(idx / 4), seasonIdx: idx % 4, season: SEASONS[idx % 4], progress: (h % SEASON_HOURS) / SEASON_HOURS, nextAt: (state.meta.created || now) + (idx + 1) * SEASON_HOURS * 3600000 };
}

export const dateLabel = (state, t) => { const c = calendar(state, t); return `An ${c.year}, ${c.season.name.toLowerCase()}`; };

// Ajoute un fait marquant à l'histoire du royaume
export function chronicle(state, text, now = Date.now(), kind = 'story') {
  const c = calendar(state, now);
  (state.history ||= []).push({ t: now, year: c.year, season: c.season.key, text, kind });
  if (state.history.length > 500) state.history.splice(0, state.history.length - 500);
  log(state, 'story', `📜 ${text}`, now);
}

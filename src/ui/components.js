import { RESOURCES } from '../data/resources.js';
import { RARITIES } from '../data/heroes.js';
import { fmt, fmtTime } from '../core/util.js';
import { fmtAffix, itemMods, itemScore } from '../systems/items.js';
import { SLOTS } from '../data/items.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Liste de coûts ; rouge si insuffisant
export function costList(cost, state, mult = 1) {
  return `<span class="cost">${Object.entries(cost || {}).map(([r, v]) => {
    const need = Math.ceil(v * mult);
    const ok = !state || (state.resources[r] || 0) >= need;
    return `<span class="res-chip ${ok ? '' : 'lack'}" title="${esc(RESOURCES[r]?.name || r)}">${RESOURCES[r]?.icon || r} ${fmt(need)}</span>`;
  }).join('')}</span>`;
}

export function resChips(res, signed = false) {
  return Object.entries(res || {}).filter(([, v]) => Math.abs(v) >= 0.5).map(([r, v]) =>
    `<span class="res-chip ${signed && v < 0 ? 'neg' : ''}" title="${esc(RESOURCES[r]?.name || r)}">${RESOURCES[r]?.icon || r} ${signed && v > 0 ? '+' : ''}${fmt(v)}</span>`).join('');
}

export const countdown = (end, start) => `<span class="countdown" data-end="${end}"${start ? ` data-start="${start}"` : ''}>${fmtTime(end - Date.now())}</span>`;
export const progress = (start, end) => `<div class="progress"><div class="progress-fill" data-pstart="${start}" data-pend="${end}" style="width:${Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100))}%"></div></div>`;

export function bar(cur, max, cls = '') {
  const p = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
  return `<div class="progress ${cls}"><div class="progress-fill" style="width:${p}%"></div></div>`;
}

export const rarityTag = (r) => `<span class="rarity" style="--rc:${RARITIES[r].color}">${RARITIES[r].name}</span>`;

export function itemCard(item, opts = {}) {
  const mods = itemMods(item);
  return `<div class="item-card ${opts.selected ? 'selected' : ''} ${opts.compact ? 'compact' : ''}" style="--rc:${RARITIES[item.rarity].color}" ${opts.action ? `data-action="${opts.action}" data-id="${item.id}"` : ''}>
    <div class="item-head"><span class="item-slot">${SLOTS[item.slot].icon}</span>
      <span class="item-name">${esc(item.name)}${item.plus ? ` <b>+${item.plus}</b>` : ''}</span>
      ${item.locked ? '<span title="Verrouillé">🔒</span>' : ''}${item.equippedBy ? '<span class="equipped-dot" title="Équipé">●</span>' : ''}</div>
    ${opts.compact ? '' : `<div class="item-affixes">${Object.entries(mods).map(([k, v]) => `<div>${esc(fmtAffix(k, v))}</div>`).join('')}</div>
    <div class="item-foot">${rarityTag(item.rarity)} <span class="muted">niv. ${item.ilvl} · score ${itemScore(item)}</span></div>`}
  </div>`;
}

export const empty = (text) => `<div class="empty">${esc(text)}</div>`;
export const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`;

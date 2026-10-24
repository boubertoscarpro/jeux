// v22 « Le Livre des quêtes » — Toutes les quêtes dans un livre relié de cuir : à gauche les chapitres et la liste
// (histoire, annexes, chroniques, missions du royaume, missions royales, grands desseins), à droite la page de la
// quête choisie (récit, objectif et progression, récompenses), avec « Montre-moi » qui accompagne le joueur pas à pas
// (ui/questGuide.js) et « Réclamer ». Ne fait que lire l'état ; les réclamations sont celles des Objectifs.
import { objectives, missionProgress } from '../../systems/campaign.js';
import { questlineList } from '../../systems/questlines.js';
import { missionList } from '../../systems/missions.js';
import { BUILDINGS } from '../../data/buildings.js';
import { esc, bar, resChips, countdown } from '../components.js';
import { rewardText as rwText } from '../../systems/rewards.js';
import { fmt, fmtTime } from '../../core/util.js';
import { paintedThumb } from '../paint/thumbs.js';
import { sigilByKey } from '../sigils.js';
import { startGuide, buildingInText, questKind } from '../questGuide.js';
import goalsView from './goals.js';

const CATS = [
  { k: 'story', name: 'Histoire', sig: 'bookOpen' },
  { k: 'chron', name: 'Chroniques', sig: 'scroll' },
  { k: 'mission', name: 'Missions du royaume', sig: 'compass' },
  { k: 'side', name: 'Quêtes annexes', sig: 'feather' },
  { k: 'royal', name: 'Ordres du jour', sig: 'calendar' },
  { k: 'grand', name: 'Grands desseins', sig: 'mountain' },
];
const resOf = (r) => (r && typeof r === 'object' && !Array.isArray(r) ? (r.res ? r.res : Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number'))) : {});

// Toutes les quêtes, sous une même forme
export function bookEntries(s) {
  const o = objectives(s);
  const out = [];
  const camp = (m, cat) => out.push({ uid: `c:${m.id}`, cat, title: m.title, desc: m.desc, cur: m.cur, target: m.target, done: m.done, claimed: m.claimed, reward: m.reward, view: m.view, action: m.action, chapter: m.chapter, claim: m.done && !m.claimed ? `data-action="claim-quest" data-id="${esc(String(m.id))}"` : null, raw: m });
  for (const m of o.main) camp(m, 'story');
  for (const m of o.secondary) camp(m, 'side');
  for (const m of o.long) camp(m, 'grand');
  for (const m of o.daily) out.push({ uid: `d:${m.id}`, cat: 'royal', title: m.title, desc: m.desc, cur: m.cur, target: m.target, done: m.done, claimed: m.claimed, reward: m.reward, view: m.view, claim: m.done && !m.claimed ? `data-action="claim-royal" data-id="${esc(String(m.id))}"` : null, raw: m });
  for (const l of questlineList(s)) {
    if (!l.unlocked || l.finished && l.finalClaimed) continue;
    const st = l.steps.find((x) => x.current && !x.choice) || l.steps.find((x) => x.done && !x.claimed);
    if (!st) continue;
    out.push({ uid: `q:${l.id}:${st.i}`, cat: 'chron', title: `${l.title} — ${st.title}`, story: l.intro, desc: st.desc, cur: st.cur, target: st.target, done: st.done, claimed: st.claimed, reward: st.reward, view: st.view, claim: st.done && !st.claimed ? `data-action="ql-claim" data-id="${l.id}" data-i="${st.i}"` : null, raw: { ...st, title: st.title } });
  }
  let ms = [];
  try { ms = missionList(s); } catch { ms = []; }
  for (const m of ms) out.push({ uid: `m:${m.id}`, cat: 'mission', title: m.title, desc: m.desc, cur: m.cur, target: m.target, done: m.done, claimed: false, reward: m.reward, view: m.view, until: m.left ? Date.now() + m.left : null, claim: m.done ? `data-action="dm-claim" data-id="${m.id}"` : null, raw: m });
  return { o, list: out };
}

function entryRow(e, sel) {
  const st = e.claim ? 'ready' : e.done ? 'done' : 'open';
  return `<button class="qb-row ${st} ${sel ? 'sel' : ''}" data-action="qb-sel" data-uid="${esc(e.uid)}" aria-pressed="${sel}">
    <span class="qb-seal" aria-hidden="true">${sigilByKey(st === 'ready' ? 'gift' : st === 'done' ? 'check' : 'feather')}</span>
    <span class="qb-rt">${esc(e.title)}</span>${e.target ? `<span class="qb-rp">${fmt(Math.min(e.cur || 0, e.target))}/${fmt(e.target)}</span>` : ''}</button>`;
}

function page(app, e, o) {
  if (!e) return '<div class="qb-empty"><p>Aucune quête dans ce chapitre du livre pour l’instant.</p></div>';
  const type = buildingInText(`${e.title} ${e.desc}`);
  const k = questKind(e.raw || e);
  const art = type ? paintedThumb(type, k.kind === 'upgrade' ? Math.max(1, e.target || 1) : 1, 120, '') : '';
  const rw = resOf(e.reward);
  const rtext = Object.keys(rw).length ? resChips(rw) : `<span class="small">${esc(rwText(e.reward) || '')}</span>`;
  const canShow = !e.done && k.kind !== 'none';
  return `<article class="qb-page-in">
    <header class="qb-title"><h3>${esc(e.title)}</h3>${e.chapter ? `<div class="small muted">Chapitre ${e.chapter}${o.chapter?.n === e.chapter ? ` — ${esc(o.chapter.title)}` : ''}</div>` : ''}</header>
    ${art ? `<div class="qb-art">${art}</div>` : ''}
    ${e.story ? `<p class="qb-story">${esc(e.story)}</p>` : ''}
    <p class="qb-desc">${esc(e.desc || '')}</p>
    ${e.target ? `<div class="qb-goal"><div class="row between small"><b>Objectif</b><span>${fmt(Math.min(e.cur || 0, e.target))} / ${fmt(e.target)}</span></div>${bar(e.cur || 0, e.target)}</div>` : ''}
    ${e.until && !e.done && e.until > Date.now() + 1000 ? `<div class="small muted">Expire dans ${countdown(e.until)}</div>` : ''}
    <div class="qb-reward"><b>Récompense</b><div>${rtext}</div></div>
    <div class="qb-actions">
      ${e.claim ? `<button class="btn primary qb-claim" ${e.claim}>Réclamer la récompense</button>` : ''}
      ${canShow ? `<button class="btn primary qb-show" data-action="qb-show" data-uid="${esc(e.uid)}">Montre-moi</button>` : ''}
      ${!e.done && e.view ? `<button class="btn ghost" data-action="go-place" data-view="${esc(e.view)}">Y aller</button>` : ''}
    </div>
    ${canShow ? '<p class="small muted qb-hint">« Montre-moi » vous accompagne étape par étape : la carte se centre, un gantelet d’or montre où toucher, et le conseiller explique chaque geste.</p>' : ''}
  </article>`;
}

export default {
  id: 'questbook', title: 'Livre des quêtes', icon: '📖',
  render(app) {
    const s = app.state;
    const { o, list } = bookEntries(s);
    const count = (k) => list.filter((e) => e.cat === k && !e.claimed).length;
    const ready = (k) => list.filter((e) => e.cat === k && e.claim).length;
    let cat = app.ui.qbCat || (list.some((e) => e.claim) ? list.find((e) => e.claim).cat : 'story');
    if (!list.some((e) => e.cat === cat) && list.length) cat = list[0].cat;
    const items = list.filter((e) => e.cat === cat).sort((a, b) => (b.claim ? 1 : 0) - (a.claim ? 1 : 0) || (a.done ? 1 : 0) - (b.done ? 1 : 0));
    const sel = items.find((e) => e.uid === app.ui.qbSel) || items[0] || null;
    const ch = o.chapter;
    return `<div class="qbook">
      <nav class="qb-ribbons" role="tablist" aria-label="Chapitres du livre">${CATS.map((c) => `<button class="qb-ribbon ${cat === c.k ? 'on' : ''}" role="tab" aria-selected="${cat === c.k}" data-action="qb-cat" data-k="${c.k}">${sigilByKey(c.sig)}<span>${esc(c.name)}</span>${ready(c.k) ? `<b class="qb-badge">${ready(c.k)}</b>` : count(c.k) ? `<i class="qb-n">${count(c.k)}</i>` : ''}</button>`).join('')}</nav>
      <div class="qb-pages">
        <section class="qb-page left" aria-label="Liste des quêtes">
          ${cat === 'story' ? `<div class="qb-chapter"><div class="small muted">Chapitre ${ch.n}</div><h3>${esc(ch.title)}</h3><p class="qb-story">${esc(ch.intro || '')}</p>${bar(ch.mainDone, ch.mainTotal)}<div class="small">${ch.mainDone}/${ch.mainTotal} missions principales${ch.complete && !ch.rewardClaimed ? ` · <button class="mini primary" data-action="claim-chapter" data-n="${ch.n}">Récompense du chapitre</button>` : ''}</div></div>` : ''}
          <div class="qb-list">${items.map((e) => entryRow(e, e === sel)).join('') || '<p class="small muted">Rien ici pour l’instant.</p>'}</div>
        </section>
        <section class="qb-page right" aria-label="Quête choisie">${page(app, sel, o)}</section>
      </div>
    </div>`;
  },
  actions: {
    ...goalsView.actions,
    'qb-cat': (app, el) => { app.ui.qbCat = el.dataset.k; app.ui.qbSel = null; app.render(); },
    'qb-sel': (app, el) => { app.ui.qbSel = el.dataset.uid; app.render(); },
    'qb-show': (app, el) => {
      const { list } = bookEntries(app.state);
      const e = list.find((x) => x.uid === el.dataset.uid);
      if (!e) return;
      startGuide(app, { ...(e.raw || {}), title: e.title, desc: e.desc, view: e.view, target: e.target });
    },
  },
};
void missionProgress; void fmtTime; void BUILDINGS;

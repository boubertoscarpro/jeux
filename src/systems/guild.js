import { GUILDS, GUILD_OBJECTIVES, guildXpForLevel } from '../data/social.js';
import { RESOURCES } from '../data/resources.js';
import { HERO_NAMES } from '../data/heroes.js';
import { rng } from '../core/rng.js';
import { levelOf } from './city.js';
import { pay, gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { log } from './log.js';

const MEMBER_LINES = [
  'a livré une caravane de fer à la guilde.', 'a repoussé un camp de bandits.', 'cherche des alliés pour le boss.',
  'a trouvé une grotte de cristaux à l’est !', 'a terminé « Échafaudages ».', 'a forgé une épée épique.',
  'a établi un avant-poste dans les collines.', 'propose du bois contre de l’acier.', 'a été pillé par Corbeval… vengeance !',
];

function makeObjectives(round = 0) {
  return GUILD_OBJECTIVES.map((o) => ({ id: o.id, progress: 0, target: Math.round(o.target * Math.pow(1.5, round)), done: false, claimed: false }));
}

export function joinGuild(state, gkey, now = Date.now()) {
  if (!levelOf(state, 'guildhall')) return { ok: false, reason: 'Maison de guilde requise' };
  if (state.guild) return { ok: false, reason: 'Déjà membre d’une guilde' };
  if (!GUILDS[gkey]) return { ok: false };
  state.guild = { key: gkey, level: 1, xp: 0, contributed: 0, round: 0, objectives: makeObjectives(0), feed: [], joined: now };
  log(state, 'good', `🛡️ Vous rejoignez ${GUILDS[gkey].name} !`, now);
  return { ok: true };
}

export function leaveGuild(state) {
  state.guild = null;
  return { ok: true };
}

export function donate(state, res, amount, now = Date.now()) {
  const g = state.guild;
  if (!g) return { ok: false, reason: 'Aucune guilde' };
  amount = Math.floor(amount);
  if (!(amount > 0) || !pay(state, { [res]: amount })) return { ok: false, reason: 'Ressources insuffisantes' };
  const value = res === 'gold' ? amount : amount * (RESOURCES[res].price || 1);
  const xp = Math.round(value * (1 + levelOf(state, 'guildhall') * 0.05));
  addGuildXp(state, xp, now);
  g.contributed += xp;
  guildProgress(state, res, amount);
  return { ok: true, xp };
}

function addGuildXp(state, xp, now) {
  const g = state.guild;
  g.xp += xp;
  while (g.xp >= guildXpForLevel(g.level)) {
    g.xp -= guildXpForLevel(g.level);
    g.level++;
    log(state, 'good', `🛡️ La guilde passe au niveau ${g.level} !`, now);
  }
}

// Progression d'un objectif de guilde par le joueur
export function guildProgress(state, stat, amount) {
  const g = state.guild;
  if (!g) return;
  for (const o of g.objectives) {
    const def = GUILD_OBJECTIVES.find((d) => d.id === o.id);
    if (def.stat === stat && !o.done) {
      o.progress = Math.min(o.target, o.progress + amount);
      if (o.progress >= o.target) o.done = true;
    }
  }
}

export function claimObjective(state, oid, now = Date.now()) {
  const g = state.guild;
  const o = g?.objectives.find((x) => x.id === oid);
  if (!o || !o.done || o.claimed) return { ok: false };
  o.claimed = true;
  const def = GUILD_OBJECTIVES.find((d) => d.id === oid);
  const k = Math.pow(1.5, g.round);
  const reward = Object.fromEntries(Object.entries(def.reward).map(([r, v]) => [r, Math.round(v * k)]));
  gain(state, reward, computeMods(state, now));
  addGuildXp(state, 500 * (g.round + 1), now);
  if (g.objectives.every((x) => x.claimed)) {
    g.round++;
    g.objectives = makeObjectives(g.round);
    log(state, 'event', '🛡️ Nouveaux objectifs de guilde disponibles !', now);
  }
  return { ok: true, reward };
}

// Simulation des autres membres (appelée par le tick du monde)
export function simulateGuild(state, dtSec, now) {
  const g = state.guild;
  if (!g) return;
  const def = GUILDS[g.key];
  const h = dtSec / 3600;
  for (const o of g.objectives) {
    if (o.done) continue;
    const od = GUILD_OBJECTIVES.find((d) => d.id === o.id);
    // Les membres avancent d'environ 4 à 8 % de l'objectif par heure
    const rate = od.target * Math.pow(1.5, g.round) * rng.float(0.04, 0.08) * (def.members / 20);
    if (od.stat === 'outposts') o.progress = Math.min(o.target, o.progress + (rng.chance(0.12 * h * 10) ? 1 : 0));
    else o.progress = Math.min(o.target, o.progress + rate * h);
    if (o.progress >= o.target) o.done = true;
  }
  addGuildXp(state, Math.round(def.members * 30 * h), now);
  if (rng.chance(Math.min(1, h * 4))) {
    g.feed.unshift({ t: now, text: `${rng.pick(HERO_NAMES)} ${rng.pick(MEMBER_LINES)}` });
    if (g.feed.length > 20) g.feed.length = 20;
  }
}

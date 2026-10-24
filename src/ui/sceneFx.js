// v15 — Couches d'état posées sur les cartes : lumière du jour selon l'heure réelle, teinte du ciel selon la météo,
// signes des présages, et une légende écrite de ce que la carte montre (l'information ne passe jamais par la couleur
// seule). Tout est piloté par sceneState (systems/scene.js) : rien n'est décoratif.
// v23 : plus de pluie, de neige ni de brume dessinées par-dessus le jeu (une couche générique qui brouillait la scène) ;
// la météo se lit dans la légende et dans la teinte du ciel (skyLight), intégrée à la lumière de la scène.
import { SIGNS } from '../data/crises.js';
import { esc } from './components.js';

const WX_NAME = { rain: 'Pluie', storm: 'Orage', snow: 'Neige', fog: 'Brume', heat: 'Canicule' };

export function sceneLegend(scene, kind = 'city') {
  const items = [];
  if (scene.weather) items.push(`<span class="sl wx-${scene.weather}">${WX_NAME[scene.weather]}</span>`);
  if (scene.light.phase !== 'day') items.push(`<span class="sl">${scene.light.name}</span>`);
  if (kind === 'city') {
    if (scene.fireSpreading) items.push('<span class="sl sl-bad">🔥 Incendie en cours</span>');
    if (scene.flood) items.push('<span class="sl sl-water">🌊 Crue : zone inondable sous l’eau</span>');
    if (scene.drought) items.push('<span class="sl sl-dry">🌾 Sécheresse : champs grillés</span>');
  }
  for (const g of scene.signs) items.push(`<span class="sl sl-sign" title="${esc(SIGNS[g.key].text)}">${SIGNS[g.key].icon} Signe : ${esc(SIGNS[g.key].name)} · ${Math.round(g.est * 100)} %</span>`);
  return items.length ? `<div class="scene-legend" aria-live="polite">${items.join('')}</div>` : '';
}

// Classes de la scène (sur l'élément .stage) : météo, lumière, signes
export function sceneClasses(scene) {
  const c = [];
  if (scene.weather) c.push('wx-' + scene.weather);
  c.push('light-' + scene.light.phase);
  for (const g of scene.signs) c.push('sign-' + g.key);
  if (scene.winter) c.push('is-winter');
  return c.join(' ');
}

export function sceneLayersHtml(scene, kind = 'city') {
  const [r, g, b] = scene.light.tint;
  return `<div class="scene-fx" aria-hidden="true"><div class="fx-light" style="--lt: rgba(${r},${g},${b},${scene.light.a.toFixed(3)})"></div><div class="fx-sign"></div></div>${sceneLegend(scene, kind)}`;
}

// Mise à jour légère (chaque seconde) sans redessiner l'écran
export function updateSceneFx(stage, scene, kind = 'city') {
  if (!stage) return;
  const keep = [...stage.classList].filter((k) => !/^(wx-|light-|sign-|is-winter)/.test(k));
  const next = [...keep, ...sceneClasses(scene).split(' ').filter(Boolean)].join(' ');
  if (stage.className !== next) stage.className = next;
  // v17 : la lumière existe aussi dans la carte du royaume (sous les marques) : on met à jour toutes les couches
  for (const lt of stage.querySelectorAll('.fx-light')) { const [r, g, b] = scene.light.tint; lt.style.setProperty('--lt', `rgba(${r},${g},${b},${scene.light.a.toFixed(3)})`); }
  const old = stage.querySelector('.scene-legend');
  const html = sceneLegend(scene, kind);
  if ((old?.outerHTML || '') !== html) { if (old) old.remove(); if (html) stage.insertAdjacentHTML('beforeend', html); }
}

export const localHour = (now = Date.now()) => { const d = new Date(now); return d.getHours() + d.getMinutes() / 60; };

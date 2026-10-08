import { RESOURCES } from '../data/resources.js';
import { fmt, fmtTime } from '../core/util.js';
import { analyze, answer, interpret, QUESTIONS } from '../systems/advisor.js';
import { esc } from './components.js';

const SEV = { bad: '🔴', warn: '🟠', info: '🔵', good: '🟢' };
const GOTO = { production: 'g-prod', city: 'city', market: 'market', trade: 'convoys', army: 'army', world: 'factions', research: 'research' };

export function openAdvisor(app, qa = null) {
  const s = app.state;
  const a = analyze(s);
  const keyRes = ['food', 'wood', 'stone', 'iron', 'gold', 'steel', 'planks', 'bread', 'weapons', 'rations'];
  const html = `<h2>🧙‍♂️ Maître Anselin, conseiller du royaume</h2>
    <p class="muted small">« Sire, voici l’état de votre économie, établi d’après les registres du jour. »</p>
    <div class="cols-2">
      <div><h4>Votre économie</h4><table class="adv-eco"><tbody>${keyRes.map((r) => {
        const v = a.net[r] || 0;
        const f = a.forecasts.find((x) => x.res === r);
        return `<tr><td>${RESOURCES[r].icon} ${esc(RESOURCES[r].name)}</td><td class="num ${v < 0 ? 'bad' : 'ok'}">${v >= 0 ? '+' : ''}${fmt(v)}/h</td><td class="small muted">${f ? `épuisé dans ${fmtTime(f.hours * 3600000)}` : ''}</td></tr>`;
      }).join('')}</tbody></table>
      <div class="small">Équilibre alimentaire : <b class="${a.foodRatio >= 1 ? 'ok' : 'bad'}">${Math.round(Math.min(9, a.foodRatio) * 100)}%</b> des besoins</div></div>
      <div><h4>Recommandations</h4><div class="adv-recs">${a.recs.slice(0, 9).map((r) => `<div class="adv-rec">${SEV[r.sev]} ${esc(r.text)}${r.goto ? ` <button class="mini ghost" data-action="adv-goto" data-v="${GOTO[r.goto] || r.goto}">→</button>` : ''}</div>`).join('') || '<div class="small ok">Rien à signaler, Sire. Tout va pour le mieux.</div>'}</div></div>
    </div>
    <h4>Posez une question</h4>
    <div class="row gap wrap">${Object.entries(QUESTIONS).filter(([k]) => k !== 'resource').map(([k, q]) => `<button class="mini" data-action="adv-q" data-q="${k}">${esc(q.label)}</button>`).join('')}
      <select id="adv-res">${keyRes.map((r) => `<option value="${r}">${RESOURCES[r].icon} ${RESOURCES[r].name}</option>`).join('')}</select><button class="mini" data-action="adv-res">Pourquoi je manque de… ?</button></div>
    <div class="row gap"><input id="adv-text" placeholder="Ex. : Comment gagner plus d’or ? Quelle région conquérir ?" style="flex:1"><button class="btn small primary" data-action="adv-ask">Demander</button></div>
    ${qa ? `<div class="adv-answer"><div class="muted small">« ${esc(qa.q)} »</div>${qa.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}`;
  const ask = (label, q, res) => openAdvisor(app, { q: label, lines: answer(s, q, res) });
  app.modal(html, {
    'adv-q': (ap, el) => ask(QUESTIONS[el.dataset.q].label, el.dataset.q),
    'adv-res': () => { const r = document.getElementById('adv-res').value; ask(`Pourquoi je manque de ${RESOURCES[r].name.toLowerCase()} ?`, 'resource', r); },
    'adv-ask': () => { const t = document.getElementById('adv-text').value.trim(); if (!t) return; const i = interpret(t); ask(t, i.q, i.res); },
    'adv-goto': (ap, el) => { ap.closeModal(); ap.go(el.dataset.v); },
  }, 'wide');
  const input = document.getElementById('adv-text');
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const t = input.value.trim(); if (t) { const i = interpret(t); ask(t, i.q, i.res); } } });
}

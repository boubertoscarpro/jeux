// v22 « Sceaux de Cendrelande » — La langue d'icônes du jeu. Aucun emoji n'est affiché : chaque symbole des textes est
// remplacé par un sceau dessiné pour Cendrelande (trait d'encre de la couleur du texte, aplat léger). Les sceaux sont
// décrits une seule fois (tracés SVG) et servent partout :
//  - dans le DOM : une passe après chaque changement remplace les emojis des textes par leur sceau, et retire ceux des
//    attributs (infobulles, libellés, options), lus tels quels ;
//  - sur les canvas (carte du monde) : le même tracé est dessiné avec Path2D ;
//  - le test v22 vérifie que chaque symbole présent dans le code a son sceau.
// Écriture compacte : « s » trait, « f » aplat plein, « h » aplat léger (35 %). Grille de 24 × 24.
const c = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const S = (d) => ['s', d], F = (d) => ['f', d], Hf = (d) => ['h', d];

export const SIGILS = {
  // ───── Guerre et défense
  swords: [S('M5 5l9 9M19 5l-9 9M3 17l4 4M21 17l-4 4M8 18l-2-2M16 18l2-2')],
  shield: [S('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6Z'), Hf('M12 3l8 3v6c0 5-4 8-8 9Z')],
  dagger: [S('M4 20l3-3M7 17l11-11 2-2-1 3-11 11ZM5 15l4 4')],
  bow: [S('M6 3c8 3 12 9 12 18M6 3l12 18M3 12h10M10 9l3 3-3 3')],
  hammers: [S('M4 20l9-9M20 20l-9-9M8 4l5 5-3 3-5-5ZM16 4l-5 5 3 3 5-5Z')],
  pick: [S('M4 20l10-10M5 7c4-4 9-4 12 0 2 2 3 5 2 7-3-4-8-6-14-7Z')],
  axe: [S('M5 20L15 10M13 4c4 0 7 3 7 7l-4 1-4-4Z'), Hf('M13 4c4 0 7 3 7 7l-4 1-4-4Z')],
  hammer: [S('M14 3l7 7-3 3-7-7ZM11 6l-8 8 3 3 8-8')],
  saw: [S('M3 15l14-8 4 3-14 8ZM6 16l1 2M9 14l1 2M12 12l1 2M15 10l1 2')],
  wrench: [S('M14 4a4 4 0 0 0-3 6l-7 7 3 3 7-7a4 4 0 0 0 6-3l-3 1-2-2 1-3Z')],
  gear: [S(c(12, 12, 3) + 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'), S(c(12, 12, 6.5))],
  tools: [S('M14 6l4-2 2 2-2 4-3 0-8 8-2-2 8-8ZM5 5l4 4M15 15l4 4-2 2-4-4')],
  toolbox: [S('M3 9h18v10H3ZM8 9V6h8v3M3 13h18M11 12v2h2v-2')],
  target: [S(c(12, 12, 9) + c(12, 12, 5)), F(c(12, 12, 1.6))],
  burst: [S('M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3Z'), Hf('M12 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z')],
  trident: [S('M12 21V6M7 4v4a5 5 0 0 0 10 0V4M12 3v3M9 21h6')],
  helm: [S('M5 15a7 7 0 0 1 14 0v3H5ZM12 8V5M9 15v-2M15 15v-2M5 18h14')],
  vest: [S('M8 3l4 4 4-4 4 3-2 5v10H6V11L4 6ZM12 7v14')],
  medal: [S('M8 3l4 6 4-6M12 9' + 'a6 6 0 1 0 0.1 0Z'), S('M12 12l1 2h2l-1.5 1.5.5 2-2-1-2 1 .5-2L9 14h2Z')],
  trophy: [S('M7 4h10v5a5 5 0 0 1-10 0ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6'), Hf('M7 4h10v5a5 5 0 0 1-10 0Z')],
  siege: [S('M3 19h18M6 19l5-12 7 12M11 7l-2-3M5 17a2 2 0 1 0 0.1 0M17 17a2 2 0 1 0 0.1 0')],
  bomb: [S(c(10, 14, 6) + 'M14 9l3-3M17 6l2-1M17 4l1-1'), Hf(c(10, 14, 6))],
  // ───── Couronne, noblesse, écrits
  crown: [S('M3 8l4 4 5-7 5 7 4-4-2 11H5Z'), F('M5 19h14v2H5Z')],
  fleur: [S('M12 3c-2 3-2 6 0 9 2-3 2-6 0-9ZM12 12c-3-3-7-2-7 1 0 2 3 3 5 1M12 12c3-3 7-2 7 1 0 2-3 3-5 1M8 15h8M12 12v9M10 21h4')],
  tophat: [S('M8 4h8v11H8ZM4 17c0-1 2-2 8-2s8 1 8 2-2 2-8 2-8-1-8-2ZM8 12h8')],
  seal: [S(c(12, 13, 6) + 'M12 7V3M9 4h6M10 13h4M12 11v4'), Hf(c(12, 13, 6))],
  scroll: [S('M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4Zm0 0a2 2 0 0 0-2 2v2h2M9 9h7M9 12h7M9 15h5')],
  book: [S('M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2ZM5 18a2 2 0 0 1 2-2h11')],
  bookOpen: [S('M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1ZM12 6v14')],
  books: [S('M4 4h4v16H4ZM9 6h4v14H9ZM14 5l4-1 3 15-4 1ZM4 8h4M9 10h4')],
  clipboard: [S('M7 5h10v16H7ZM9 3h6v4H9ZM10 11h4M10 15h4')],
  pin: [S('M12 21v-7M8 3h8l-1 5 3 3v2H6v-2l3-3Z')],
  mapPin: [S('M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11Z' + c(12, 10, 2))],
  folder: [S('M3 6h6l2 2h10v11H3Z')],
  page: [S('M6 3h9l4 4v14H6ZM15 3v4h4M9 11h7M9 14h7M9 17h5')],
  letter: [S('M3 6h18v12H3ZM3 6l9 7 9-7')],
  horn: [S('M3 10v4h3l9 5V5l-9 5ZM18 9c1 1 1 5 0 6M20 7c2 2 2 8 0 10')],
  bell: [S('M6 17V11a6 6 0 0 1 12 0v6l2 2H4ZM10 21h4')],
  bellOff: [S('M6 17V11a6 6 0 0 1 9-5M18 11v6l2 2H4M10 21h4M3 3l18 18')],
  sound: [S('M4 9h4l5-4v14l-5-4H4ZM16 9c1 1 1 5 0 6M18 7c2 2 2 8 0 10')],
  mute: [S('M4 9h4l5-4v14l-5-4H4ZM16 9l5 6M21 9l-5 6')],
  save: [S('M5 4h11l3 3v13H5ZM8 4v5h7V4M8 20v-6h8v6')],
  screen: [S('M3 4h18v12H3ZM8 21h8M12 16v5')],
  outbox: [S('M4 14h4l1 3h6l1-3h4v6H4ZM12 4v10M8 8l4-4 4 4')],
  inbox: [S('M4 14h4l1 3h6l1-3h4v6H4ZM12 4v9M8 9l4 4 4-4')],
  camera: [S('M3 8h4l2-3h6l2 3h4v11H3Z' + c(12, 13, 3.5))],
  film: [S('M4 4h16v16H4ZM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4')],
  search: [S(c(10, 10, 6) + 'M15 15l6 6')],
  telescope: [S('M3 15l12-6 2 4-12 6ZM15 9l4-2 2 4-4 2M9 17l-2 4M11 16l2 5')],
  lens: [S('M9 3h6M10 3v6l-4 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-9V3M8 15h8')],
  ruler: [S('M3 17L17 3l4 4L7 21ZM7 13l2 2M10 10l2 2M13 7l2 2')],
  scales: [S('M12 4v16M7 20h10M5 7h14M5 7l-3 6h6ZM19 7l-3 6h6Z')],
  moneybag: [S('M9 3h6l-2 4c4 1 7 5 7 9 0 3-3 5-8 5s-8-2-8-5c0-4 3-8 7-9ZM10 11h3a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h3M12 10v1M12 17v1')],
  coin: [S('M12 4c5 0 8 2 8 4s-3 4-8 4-8-2-8-4 3-4 8-4ZM4 8v8c0 2 3 4 8 4s8-2 8-4V8'), Hf('M12 4c5 0 8 2 8 4s-3 4-8 4-8-2-8-4 3-4 8-4Z')],
  gem: [S('M6 8l3-4h6l3 4-6 12ZM6 8h12M9 4l3 4 3-4M12 8v12'), Hf('M6 8l6 12 6-12Z')],
  ring: [S(c(12, 15, 6) + 'M9 6l3-3 3 3-3 3Z'), Hf('M9 6l3-3 3 3-3 3Z')],
  beads: [S(c(12, 5, 2) + c(17, 8, 2) + c(17, 14, 2) + c(12, 17, 2) + c(7, 14, 2) + c(7, 8, 2) + 'M12 19v3')],
  orb: [S('M12 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM7 21h10M9 17l-1 4M15 17l1 4'), Hf('M12 3a7 7 0 1 0 0 14Z')],
  flask: [S('M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3'), Hf('M7 15h10l2 3a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3Z')],
  alembic: [S(c(9, 15, 5) + 'M9 10V5h4M13 5l7 6v3M18 14h4')],
  salt: [S('M8 8h8l1 13H7ZM9 8V5h6v3M10 4h1M13 4h1')],
  bread: [S('M3 15c0-5 4-8 9-8s9 3 9 8v2H3ZM8 10l1.5 3M12 9v3.5M16 10l-1.5 3'), Hf('M3 15c0-5 4-8 9-8s9 3 9 8v2H3Z')],
  meat: [S('M14 4c4 0 6 3 6 6 0 4-4 7-8 7l-4 3-2-2 3-4c0-5 1-10 5-10Z' + c(5.5, 19, 1.8)), Hf('M14 4c4 0 6 3 6 6 0 4-4 7-8 7Z')],
  mug: [S('M5 6h10v14H5ZM15 9h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3M5 9h10M8 12v5M12 12v5')],
  goblet: [S('M7 3h10c0 6-2 9-5 9s-5-3-5-9ZM12 12v7M8 21h8'), Hf('M7 6h10c0 3-2 6-5 6s-5-3-5-6Z')],
  can: [S('M6 5h12v15H6ZM6 8h12M6 17h12'), Hf('M6 8h12v9H6Z')],
  bowl: [S('M3 11h18c0 5-4 9-9 9s-9-4-9-9ZM8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4')],
  plate: [S(c(12, 13, 7) + c(12, 13, 4) + 'M3 4v6M5 4v6M3 7h2M4 10v11M21 4c-2 1-2 5 0 6v11')],
  basket: [S('M3 10h18l-2 10H5ZM7 10l3-6M17 10l-3-6M8 14v3M12 14v3M16 14v3')],
  bucket: [S('M5 7h14l-2 14H7ZM5 7a7 3 0 0 1 14 0M4 7c0-3 16-3 16 0')],
  crate: [S('M3 8l9-4 9 4v9l-9 4-9-4ZM3 8l9 4 9-4M12 12v9'), Hf('M3 8l9 4v9l-9-4Z')],
  bag: [S('M7 8a5 5 0 0 1 10 0v12H7ZM9 4V3h6v1M7 13h10M10 13v3h4v-3')],
  thread: [S('M7 4h10M7 20h10M8 4v16M16 4v16M8 8l8 3M8 12l8 3M8 16l8 3')],
  yarn: [S(c(12, 12, 8) + 'M5 9c4 0 9 3 12 9M8 5c2 4 6 10 12 12M4 14c5-1 9 1 11 6')],
  glove: [S('M7 21v-8L5 9a1.5 1.5 0 0 1 3-1l1 3V4a1.5 1.5 0 0 1 3 0v6V3a1.5 1.5 0 0 1 3 0v7V5a1.5 1.5 0 0 1 3 0v10l-2 6Z')],
  boot: [S('M7 3h6v11l6 3c1 1 1 3 0 4H5V14l2-1Z')],
  coat: [S('M8 3l4 3 4-3 4 3-2 4v11H6V10L4 6ZM12 6v15M10 12h0M10 16h0')],
  feather: [S('M5 19c5-1 12-7 14-15-6 1-12 6-14 15ZM5 19l9-9M9 15h4M11 12h3')],
  pen: [S('M4 20l4-1 11-11-3-3L5 16ZM14 6l3 3')],
  log: [S('M3 12h14a3 4 0 0 1 0 8H3ZM17 12a3 4 0 0 0 0 8M3 12a3 4 0 0 0 0 8M17 15a1 1 0 0 0 0 2'), Hf('M3 12h14v8H3Z')],
  rock: [S('M3 17l3-8 6-3 7 2 2 9-6 3H7ZM6 9l6-3 7 2-4 4-7-1Z'), Hf('M6 9l6-3 7 2-4 4-7-1Z')],
  chain: [S('M10 14l4-4M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2')],
  candle: [S('M9 10h6v11H9ZM12 10V8M12 3c2 2 2 4 0 5-2-1-2-3 0-5Z'), Hf('M12 3c2 2 2 4 0 5-2-1-2-3 0-5Z')],
  lantern: [S('M8 7h8v11H8ZM10 4h4v3M12 2v2M7 18h10M10 21h4M12 10c1.5 1.5 1.5 3 0 4-1.5-1-1.5-2.5 0-4Z'), Hf('M8 7h8v11H8Z')],
  bulb: [S('M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10Z')],
  statue: [S('M7 21h10M8 18h8M10 18V9a2 2 0 0 1 4 0v9M12 7a2 2 0 1 0 0.1 0M10 11l-3-3M14 11l3-4')],
  urn: [S('M9 3h6M10 3v3c-3 1-5 4-5 7 0 4 3 8 7 8s7-4 7-8c0-3-2-6-5-7V3M7 12h10')],
  tomb: [S('M6 21V9a6 6 0 0 1 12 0v12ZM4 21h16M12 9v6M10 11h4')],
  coffin: [S('M9 3h6l3 5-2 13H8L6 8ZM12 8v7M10 10h4')],
  tent: [S('M3 20l9-15 9 15ZM12 5v15M7 20l5-8 5 8'), Hf('M12 12l5 8H7Z')],
  fountain: [S('M4 15h16v3H4ZM6 18v3h12v-3M12 15V7M12 7c-3 0-5 2-5 5M12 7c3 0 5 2 5 5M12 7V4')],
  wheel: [S(c(12, 12, 8) + c(12, 12, 2) + 'M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7')],
  die: [S('M5 5h14v14H5Z'), F(c(9, 9, 1.4) + c(15, 15, 1.4) + c(12, 12, 1.4))],
  ticket: [S('M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4ZM14 7v10')],
  gift: [S('M4 10h16v10H4ZM3 7h18v3H3ZM12 7v13M12 7c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1')],
  party: [S('M4 20l5-13 8 8ZM9 7l8 8M14 4l1 2M18 6l2-1M19 10h2M12 3l-1 1')],
  masks: [S('M3 5h8v6a4 4 0 0 1-8 0ZM13 9h8v6a4 4 0 0 1-8 0ZM5 8h1M8 8h1M15 12h1M18 12h1M5 12c1 1 3 1 4 0M15 17c1-1 3-1 4 0')],
  palette: [S('M12 3a9 9 0 0 0 0 18c2 0 2-2 1-3s0-3 2-3h3a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z'), F(c(8, 10, 1.3) + c(12, 7, 1.3) + c(16, 10, 1.3))],
  flag: [S('M5 21V4M5 4h11l-2 4 2 4H5'), Hf('M5 4h11l-2 4 2 4H5Z')],
  flagWhite: [S('M5 21V4M5 4h12v8H5')],
  flagBlack: [S('M5 21V4'), F('M5 4h12l-2 4 2 4H5Z')],
  flags: [S('M4 21V4M4 4h8v6H4M12 21V8M12 8h8v6h-8')],
  pirate: [S('M5 21V4'), F('M5 4h14v9H5Z'), S('M10 7h4v3h-4ZM9 11l6 0', ), ['k', c(12, 8.5, 2)]],
  barrier: [S('M3 9h18v5H3ZM6 14v6M18 14v6M7 9l-3 5M13 9l-3 5M19 9l-3 5')],
  forbidden: [S(c(12, 12, 9) + 'M5.6 5.6l12.8 12.8')],
  alarm: [S('M6 18a6 6 0 0 1 12 0ZM4 21h16M12 4v3M5 7l2 2M19 7l-2 2'), Hf('M6 18a6 6 0 0 1 12 0Z')],
  warning: [S('M12 3l10 18H2ZM12 10v5M12 18v.5')],
  question: [S('M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 2.2M12 18v.5')],
  info: [S(c(12, 12, 9) + 'M12 11v6M12 7.5v.5')],
  check: [S('M4 12l5 5 11-11')],
  cross: [S('M6 6l12 12M18 6L6 18')],
  arrowRight: [S('M4 12h15M13 6l6 6-6 6')],
  play: [S('M7 4l12 8-12 8Z'), Hf('M7 4l12 8-12 8Z')],
  ff: [S('M3 5l9 7-9 7ZM12 5l9 7-9 7Z')],
  up: [S('M12 19V5M6 11l6-6 6 6')],
  down: [S('M12 5v14M6 13l6 6 6-6')],
  back: [S('M9 7L4 12l5 5M4 12h11a5 5 0 0 0 0-10h-2')],
  lr: [S('M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4')],
  repeat: [S('M4 10V9a4 4 0 0 1 4-4h11l-3-3M20 14v1a4 4 0 0 1-4 4H5l3 3')],
  shuffle: [S('M3 7h4l10 10h4M3 17h4l10-10h4M18 4l3 3-3 3M18 14l3 3-3 3')],
  undo: [S('M5 9a8 8 0 1 1 1 7M5 4v5h5')],
  pause: [S('M8 5v14M16 5v14')],
  stop: [S('M7 7h10v10H7Z')],
  hourglass: [S('M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9'), Hf('M9 19c0-2 6-2 6 0Z')],
  stopwatch: [S(c(12, 13, 8) + 'M12 13V9M10 3h4M12 3v2M19 6l-1.5 1.5')],
  clock: [S(c(12, 12, 9) + 'M12 7v5l3 2')],
  alarmClock: [S('M12 7v5l3 2M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4 4l3-2M20 4l-3-2')],
  calendar: [S('M4 6h16v14H4ZM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2')],
  chart: [S('M4 20h16M7 20v-6M12 20V8M17 20v-10')],
  chartUp: [S('M4 20h16M4 16l5-5 4 3 7-8M15 6h5v5')],
  chartDown: [S('M4 20h16M4 6l5 5 4-3 7 8M15 16h5v-5')],
  cart: [S('M3 4h3l3 11h9l2-8H7M9 19a1.5 1.5 0 1 0 0.1 0M17 19a1.5 1.5 0 1 0 0.1 0')],
  wagon: [S('M3 7h12v9H3ZM15 10h4l2 3v3h-6M7 19a2 2 0 1 0 0.1 0M17 19a2 2 0 1 0 0.1 0')],
  road: [S('M8 3L4 21M16 3l4 18M12 4v3M12 10v4M12 17v3')],
  bridge: [S('M2 9h20M2 17c3-6 7-8 10-8s7 2 10 8M6 9v4M10 9v1M14 9v1M18 9v4')],
  anchor: [S('M12 6v15M8 9h8M5 14c0 4 3 7 7 7s7-3 7-7M3 14h4M17 14h4' + c(12, 4.5, 1.5))],
  ship: [S('M3 16h18l-3 4H6ZM12 3v13M12 4l7 9h-7M12 6l-5 7h5'), Hf('M12 4l7 9h-7Z')],
  sled: [S('M4 15h14c2 0 3-1 3-3M6 15v-4h10v4M3 18h16c2 0 2-2 2-2')],
  satellite: [S('M7 11l6-6 6 6-6 6ZM5 13l-2 2 6 6 2-2M15 9l4-4M12 12l-3 3'), Hf('M7 11l6-6 6 6-6 6Z')],
  compass: [S('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'), F('M15.5 8.5l-2 5-5 2 2-5Z')],
  map: [S('M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2ZM9 4v14M15 6v14')],
  globe: [S(c(12, 12, 9) + 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18')],
  puzzle: [S('M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4v-4a2 2 0 1 0 0-4Z')],
  broom: [S('M18 3L11 12M8 12l5 2-2 7c-3 0-6-2-7-5ZM6 17l3-3')],
  ladder: [S('M7 3v18M17 3v18M7 7h10M7 11h10M7 15h10M7 19h10')],
  hook: [S('M12 3v10a4 4 0 1 1-6 0M12 3h-2')],
  trap: [S('M3 18h18M5 18l2-6h10l2 6M8 12l1-4M12 12V7M16 12l-1-4')],
  sign: [S('M12 21V10M4 4h16v6H4ZM8 7h8')],
  ice: [S('M5 9l7-5 7 5v7l-7 5-7-5ZM5 9l7 4 7-4M12 13v8'), Hf('M5 9l7 4v8l-7-5Z')],
  zzz: [S('M4 6h6l-6 7h6M13 4h4l-4 5h4M15 13h5l-5 6h5')],
  rod: [S('M4 20L18 4M18 4l2 0M18 4v12M18 16a2 2 0 1 0 0.1 0')],
  bandage: [S('M5 15L15 5a3 3 0 0 1 4 4L9 19a3 3 0 0 1-4-4ZM10 10l4 4M11 9h0M13 11h0')],
  medic: [S('M5 15a7 7 0 0 1 14 0v3H5ZM5 18h14M12 9v4M10 11h4')],
  access: [S(c(12, 5, 1.6) + 'M12 7v6h5l2 6M8 10a6 6 0 1 0 8 8')],
  scissors: [S(c(6, 7, 2.5) + c(6, 17, 2.5) + 'M8 8l12 9M8 16L20 7')],
  frame: [S('M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4')],
  asterisk: [S('M12 4v16M5 8l14 8M19 8L5 16')],
  loop: [S('M3 12c0-4 4-6 7-3l4 6c3 3 7 1 7-3s-4-6-7-3l-4 6c-3 3-7 1-7-3Z')],
  handshake: [S('M2 11l4-4 4 2 3-2 4 1 5 4-5 5-3-2-2 2-3-2-3 1Z')],
  pointer: [S('M4 12h11M10 7l5 5-5 5M16 6l4 6-4 6')],
  hands: [S('M8 21v-6L4 10a1.5 1.5 0 0 1 2-2l3 3V4a1.5 1.5 0 0 1 3 0v8M16 21v-6l4-5a1.5 1.5 0 0 0-2-2l-3 3V4a1.5 1.5 0 0 0-3 0')],
  fist: [S('M7 21v-5H5V9a2 2 0 0 1 4 0V7a2 2 0 0 1 4 0 2 2 0 0 1 4 0v1a2 2 0 0 1 3 2v4c0 4-3 7-7 7ZM9 9v3M13 7v5M17 8v4')],
  palm: [S('M7 21v-6L5 10V5a1.5 1.5 0 0 1 3 0v5V3a1.5 1.5 0 0 1 3 0v7V4a1.5 1.5 0 0 1 3 0v7V6a1.5 1.5 0 0 1 3 0v9c0 4-3 6-6 6Z')],
  muscle: [S('M4 18c3-6 6-8 8-8l1-4c1-2 4-2 4 0l-1 3c3 0 5 3 4 6-2 4-10 5-16 3Z')],
  walker: [S(c(13, 4, 2) + 'M12 8l-2 6 3 3 1 5M11 11l-4 2M13 9l4 3M10 14l-3 7')],
  // ───── Personnes et créatures
  person: [S(c(12, 7, 4) + 'M4 21c1-5 4-7 8-7s7 2 8 7')],
  worker: [S('M6 13a6 6 0 0 1 12 0ZM4 13h16M9 13v-3M15 13v-3M8 17a4 4 0 0 0 8 0')],
  mage: [S('M12 2l4 9H8ZM6 11h12M8 14a4 4 0 0 0 8 0M10 18l2 4 2-4'), Hf('M12 2l4 9H8Z')],
  spy: [S('M4 10h16M7 10l1-5h8l1 5M8 15a2 2 0 1 0 0.1 0M16 15a2 2 0 1 0 0.1 0M10 15h4')],
  hero: [S(c(12, 6, 3) + 'M12 9v6M8 21l4-6 4 6M6 12l6-2 6 2M12 9L6 20M12 9l6 11')],
  ghost: [S('M5 21V10a7 7 0 0 1 14 0v11l-2-2-2 2-3-2-3 2-2-2ZM9 10h0M15 10h0'), F(c(9, 10, 1.2) + c(15, 10, 1.2))],
  skull: [S('M5 11a7 7 0 0 1 14 0c0 3-2 4-2 5v3H7v-3c0-1-2-2-2-5ZM10 19v2M14 19v2'), F(c(9, 11, 1.6) + c(15, 11, 1.6))],
  demon: [S('M6 3l2 5M18 3l-2 5M5 12a7 7 0 0 1 14 0c0 5-3 9-7 9s-7-4-7-9ZM9 16c2 1 4 1 6 0'), F('M8 11l3 1-3 1ZM16 11l-3 1 3 1Z')],
  zombie: [S(c(12, 8, 5) + 'M4 21c1-4 4-6 8-6s7 2 8 6M10 8h0M14 8h1M10 11l4 0'), F(c(10, 7.5, 1))],
  farmer: [S('M4 9c0-1 3-2 8-2s8 1 8 2H4ZM8 7l1-4h6l1 4M7 11a5 5 0 0 0 10 0M5 21c1-4 4-6 7-6s6 2 7 6')],
  merchant: [S(c(12, 7, 4) + 'M4 21c1-5 4-7 8-7s7 2 8 7M12 14l-2 3 2 4 2-4Z')],
  scholar: [S('M2 9l10-5 10 5-10 5ZM6 11v5c3 2 9 2 12 0v-5M22 9v6')],
  mind: [S('M9 4a4 4 0 0 0-4 4c-2 1-2 5 0 6 0 3 2 5 5 5h1V4ZM15 4a4 4 0 0 1 4 4c2 1 2 5 0 6 0 3-2 5-5 5h-1V4Z')],
  heart: [S('M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11Z'), Hf('M12 20s-8-5-8-11a4 4 0 0 1 8-1Z')],
  blood: [S('M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z'), Hf('M12 3s6 7 6 11a6 6 0 0 1-6 6Z')],
  eye: [S('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z'), F(c(12, 12, 3))],
  face: [S(c(12, 12, 9) + 'M8.5 14.5c1 1.5 2 2 3.5 2s2.5-.5 3.5-2'), F(c(9, 10, 1.2) + c(15, 10, 1.2))],
  faceFlat: [S(c(12, 12, 9) + 'M8.5 15h7'), F(c(9, 10, 1.2) + c(15, 10, 1.2))],
  faceAngry: [S(c(12, 12, 9) + 'M8.5 16c1-1.5 2-2 3.5-2s2.5.5 3.5 2M7 8l3 1.5M17 8l-3 1.5'), F(c(9, 11, 1.2) + c(15, 11, 1.2))],
  faceCold: [S(c(12, 12, 9) + 'M8 15h8M9 15v2M12 15v2M15 15v2'), F(c(9, 10, 1.2) + c(15, 10, 1.2))],
  // ───── Bâtiments et lieux
  castle: [S('M4 21V9l3-2V4h2v3l3-2 3 2V4h2v3l3 2v12ZM10 21v-4a2 2 0 0 1 4 0v4')],
  keep: [S('M7 21V8h10v13ZM5 8h14M6 8V5h2v2h3V5h2v2h3V5h2v3M10 21v-4h4v4M10 11h1M13 11h1')],
  hall: [S('M3 9l9-5 9 5ZM5 9v9M9 9v9M15 9v9M19 9v9M3 20h18')],
  tower: [S('M8 21L9 7h6l1 14ZM7 7h10M7 7V4h2v2h2V4h2v2h2V4h2v3M11 21v-3h2v3M11 11h2')],
  gate: [S('M3 7h18M5 4h14M6 7v14M18 7v14M3 10h18')],
  chapel: [S('M12 2v4M10 4h4M6 21V12l6-5 6 5v9ZM10 21v-4a2 2 0 0 1 4 0v4')],
  stall: [S('M3 10l2-6h14l2 6ZM3 10c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0M5 12v9h14v-9M9 21v-5h6v5')],
  arena: [S('M3 9c0-3 4-5 9-5s9 2 9 5v8c0 3-4 4-9 4s-9-1-9-4ZM3 9c0 3 4 4 9 4s9-1 9-4M7 13v7M12 14v7M17 13v7')],
  houses: [S('M2 12l5-5 5 5v9H2ZM12 12l5-5 5 5v9h-10M5 21v-4h4v4M15 21v-4h4v4')],
  house: [S('M3 11l9-7 9 7M5 9v12h14V9M10 21v-6h4v6')],
  ruin: [S('M3 11l9-7 9 7M5 9v12h14V9M10 21v-5h4v5M14 9l2 3')],
  hut: [S('M3 13l9-9 9 9M5 11c0 3 0 7 1 10h12c1-3 1-7 1-10M10 21v-5h4v5')],
  construction: [S('M4 21V5h14M4 5l4 4M18 5v4M15 9h6l-3 4ZM2 21h8')],
  workshop: [S('M3 21V10l5 3V10l5 3V10l5 3V4h3v17ZM7 17h2M12 17h2')],
  bricks: [S('M3 6h18v4H3ZM3 10h18v4H3ZM3 14h18v4H3ZM9 6v4M15 10v4M9 14v4')],
  door: [S('M6 21V4h12v17M3 21h18M14 13h0'), F(c(14.5, 13, 1))],
  key: [S(c(7, 15, 4) + 'M10 12l9-9M15 7l2 2M17 5l2 2')],
  lock: [S('M6 11h12v9H6ZM8 11V8a4 4 0 0 1 8 0v3')],
  unlock: [S('M6 11h12v9H6ZM8 11V8a4 4 0 0 1 7.5-2')],
  // ───── Nature, saisons, éléments
  pine: [S('M12 3l6 8h-3l4 6H5l4-6H6ZM12 17v4'), Hf('M12 3l6 8h-3l4 6H5l4-6H6Z')],
  tree: [S(c(12, 9, 6) + 'M12 15v6M9 21h6'), Hf(c(12, 9, 6))],
  sprout: [S('M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6ZM12 14c0-4 3-6 7-6 0 4-3 6-7 6Z')],
  herb: [S('M12 21V9M12 12C6 12 4 7 5 4c4 0 7 3 7 8ZM12 15c5 0 8-3 8-7-4 0-8 2-8 7Z'), Hf('M12 12C6 12 4 7 5 4c4 0 7 3 7 8Z')],
  clover: [S(c(9, 9, 3) + c(15, 9, 3) + c(12, 14, 3) + 'M12 15v6')],
  wheat: [S('M12 21V8M12 8c-2-1-2-4 0-5 2 1 2 4 0 5ZM12 13c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3ZM12 18c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3Z')],
  flower: [S(c(12, 9, 2.2) + 'M12 6.8c-1-3 2-4 2-1.5M14.2 9c3-1 4 2 1.5 2M12 11.2c1 3-2 4-2 1.5M9.8 9c-3 1-4-2-1.5-2M12 12v9M12 17c2-2 4-2 5-1'), Hf(c(12, 9, 2.2))],
  leaf: [S('M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l8-8')],
  nut: [S('M6 10h12c0 6-3 11-6 11s-6-5-6-11ZM5 10c0-3 3-5 7-5s7 2 7 5M12 5V3')],
  fruit: [S('M12 7c-4-2-8 1-8 6s4 8 8 7c4 1 8-2 8-7s-4-8-8-6ZM12 7c0-2 1-3 2-4M12 7c2-2 5-2 6 0'), Hf('M12 7c-4-2-8 1-8 6s4 8 8 7Z')],
  grapes: [S(c(12, 8, 2) + c(9, 11, 2) + c(15, 11, 2) + c(12, 14, 2) + c(9, 17, 2) + c(15, 17, 2) + 'M12 6V3l2-1')],
  wave: [S('M2 9c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2M2 15c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2')],
  drop: [S('M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z')],
  fire: [S('M12 21c-4 0-7-3-7-7 0-4 4-6 4-11 3 2 5 5 5 8 1-1 2-2 2-4 2 2 3 4 3 7 0 4-3 7-7 7Z'), Hf('M12 21c-2 0-3-2-3-4 0-2 2-3 3-5 1 2 3 3 3 5s-1 4-3 4Z')],
  snow: [S('M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9 4l3 2 3-2M9 20l3-2 3 2')],
  sun: [S(c(12, 12, 4) + 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1'), Hf(c(12, 12, 4))],
  moon: [S('M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3Z'), Hf('M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3Z')],
  darkMoon: [S(c(12, 12, 8)), F(c(12, 12, 8))],
  star: [S('M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7Z'), Hf('M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7Z')],
  starFull: [F('M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7Z')],
  sparkle: [S('M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M6 18l3-3')],
  comet: [S(c(16, 8, 4) + 'M13 11L3 21M12 8L4 16M16 12l-8 8'), Hf(c(16, 8, 4))],
  volcano: [S('M3 21l6-11h6l6 11ZM9 10l1-2M15 10l-1-2M12 3v4M8 4l2 3M16 4l-2 3'), Hf('M9 10h6l1 3H8Z')],
  mountain: [S('M2 20l7-12 4 6 3-4 6 10ZM7 11l2 1 2-1')],
  desert: [S('M2 19c4-3 8-3 12 0s6 1 8 0M3 15c3-2 6-2 8 0M17 4v9M17 7l-3 2M17 9l3-2'), S(c(7, 6, 2))],
  valley: [S('M2 20l6-9 4 5 3-3 7 7ZM2 20h20M10 20c1-2 3-3 5-3')],
  vortex: [S('M12 12a2 2 0 1 1 2 2c-3 0-5-2-5-5a5 5 0 0 1 10 0c0 4-3 8-8 8a8 8 0 0 1-8-8')],
  tornado: [S('M3 4h18M5 8h14M7 12h10M9 16h6M11 20h2')],
  wind: [S('M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8')],
  fog: [S('M3 8h18M5 12h14M3 16h18M7 20h10')],
  rain: [S('M6 14a4 4 0 0 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 0 6ZM8 17l-1 3M12 17l-1 3M16 17l-1 3')],
  snowcloud: [S('M6 14a4 4 0 0 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 0 6ZM8 18h0M12 19h0M16 18h0M10 21h0M14 21h0')],
  storm: [S('M6 14a4 4 0 0 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 0 6ZM13 14l-3 4h4l-3 4')],
  bolt: [S('M13 2L5 14h6l-2 8 8-12h-6Z'), Hf('M13 2L5 14h6l-2 8 8-12h-6Z')],
  sunrise: [S('M2 18h20M6 18a6 6 0 0 1 12 0M12 4v4M5 9l2 2M19 9l-2 2M3 21h18')],
  // ───── Animaux
  dragon: [S('M3 18c4 0 6-3 6-6 0-4 4-7 8-7l3-2-1 4c1 2 0 5-3 6l3 3-4-1c-1 3-4 5-7 5ZM9 12l-5-4 1 5M14 7h0')],
  horse: [S('M6 21v-6c0-4 2-7 5-8l1-4 2 3c3 1 5 3 5 6l-2 1-2-2-1 4v6M9 21v-4M6 13l-2 2')],
  rider: [S(c(13, 3.5, 1.5) + 'M13 5v4l-3 1M5 21v-5c0-3 2-5 5-5h5c2 0 4 1 5 3l-2 1M8 21v-4M16 21v-5')],
  camel: [S('M3 21v-7c0-2 2-3 3-5s2-3 4-1c1 2 2 3 4 1s3-3 4-1l1 3h3l-2 3v7M7 21v-5M17 21v-5')],
  wolf: [S('M4 4l4 6M20 4l-4 6M6 10c0-2 3-3 6-3s6 1 6 3l1 4-7 7-7-7ZM9 13h0M15 13h0M10 17h4'), F(c(9, 13, 1) + c(15, 13, 1))],
  deer: [S('M8 3v4l-3 2M8 7l3 2M16 3v4l3 2M16 7l-3 2M9 9h6l1 6-4 6-4-6Z')],
  sheep: [S('M6 10a3 3 0 0 1 4-3 3 3 0 0 1 5 0 3 3 0 0 1 4 4 3 3 0 0 1-2 5H7a3 3 0 0 1-1-6ZM8 16v4M16 16v4M5 10l-2-1')],
  ox: [S('M3 5c1 3 3 4 5 4M21 5c-1 3-3 4-5 4M8 9h8l1 7-3 4h-4l-3-4ZM10 17h0M14 17h0')],
  boar: [S('M4 13c0-4 4-7 9-7s7 3 7 6l2 2-2 2h-3l-2 3H9l-2-3H5ZM18 13l2-2')],
  eagle: [S('M2 9c4 0 7 2 10 5 3-3 6-5 10-5-2 3-5 4-7 5l1 3-4-1-4 1 1-3c-2-1-5-2-7-5ZM12 14V9l2-2')],
  bird: [S('M4 14c3-1 5-3 6-6 2-3 6-3 8 0l3 1-3 1c0 5-4 8-9 8H5ZM15 8h0')],
  dove: [S('M3 12c5 0 7-2 9-6 1 3 0 6-2 8 4-1 7-3 11-2-3 5-8 8-14 7Z')],
  lizard: [S('M4 20c4 0 6-3 8-6s3-6 7-7l2-3M12 14l-3-2M13 12l3 2M10 17l-2 1M15 9l3 0')],
  paws: [S(c(12, 16, 3.5) + c(7, 10, 1.6) + c(10, 6, 1.6) + c(14, 6, 1.6) + c(17, 10, 1.6))],
  spider: [S(c(12, 13, 3) + c(12, 8, 2) + 'M9 12L3 9M9 14l-6 1M9 15l-5 4M15 12l6-3M15 14l6 1M15 15l5 4')],
  bug: [S('M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0ZM8 12H4M16 12h4M8 9L5 6M16 9l3-3M8 15l-3 3M16 15l3 3M12 8v12')],
  crab: [S('M6 13c0-3 3-5 6-5s6 2 6 5-3 5-6 5-6-2-6-5ZM6 13l-3-2V7M18 13l3-2V7M8 17l-2 3M16 17l2 3M10 8V6M14 8V6')],
  fish: [S('M3 12c4-5 10-5 14 0-4 5-10 5-14 0ZM17 12l4-3v6ZM7 11h0')],
  lion: [S(c(12, 12, 5) + 'M12 3l2 3 3-1 0 3 3 2-2 2 2 3-3 1v3l-3-1-2 3-2-3-3 1v-3l-3-1 2-3-2-2 3-2 0-3 3 1Z')],
  germ: [S(c(12, 12, 5) + 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M6 18l3-3')],
  // ───── Ressources (les principales ont leur icône en couleur, voir RES_EMOJI)
  grain: [S('M12 21V6M12 6c-2-1-2-3 0-4 2 1 2 3 0 4ZM12 10c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3ZM12 14c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3Z')],
  hide: [S('M6 5c2 1 4 1 6 0 2 1 4 1 6 0l1 5-2 3 1 6c-3 1-9 1-12 0l1-6-2-3Z')],
  // ───── Formes et couleurs (pastilles)
  dot: [F(c(12, 12, 6))],
  crystal: [S('M12 3l7 9-7 9-7-9Z'), Hf('M12 7l4 5-4 5-4-5Z')],
  pit: [S('M3 14c0-2 4-4 9-4s9 2 9 4-4 4-9 4-9-2-9-4Z'), F('M7 14c0-1 2-2 5-2s5 1 5 2-2 2-5 2-5-1-5-2Z')],
  bin: [S('M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6')],
  gender: [S(c(12, 9, 5) + 'M12 14v7M9 18h6')],
  square: [S('M6 6h12v12H6Z')],
};

// Emojis → sceaux. Les variantes (sélecteur U+FE0F) sont ignorées ; les séquences liées (ZWJ) sont listées telles quelles.
const MAP = {
  swords: '⚔ 🤺 ⛨', shield: '🛡', dagger: '🗡 🥷', bow: '🏹', hammers: '⚒', pick: '⛏', axe: '🪓', hammer: '🔨', saw: '🪚', wrench: '🔧 🔩',
  gear: '⚙', tools: '🛠', toolbox: '🧰', target: '🎯', burst: '💥 🧨', trident: '🔱', helm: '💂', vest: '🦺', medal: '🎖 🏅 🥇 🥈 🥉', trophy: '🏆', bomb: '💣',
  crown: '👑 🤴 👸', fleur: '⚜', tophat: '🎩', seal: '🔏', scroll: '📜', book: '📘 📕', bookOpen: '📖', books: '📚', clipboard: '📋 🗒', pin: '📌', mapPin: '📍',
  folder: '📂 🗂 🗃 📁', page: '🧾 📃 📰 📄', letter: '✉ 📩 📨', horn: '📯', bell: '🔔', bellOff: '🔕', sound: '🔊', mute: '🔇', save: '💾', screen: '🖥', outbox: '📤', inbox: '📥',
  camera: '📷 📸', film: '🎞', search: '🔍 🔎', telescope: '🔭', lens: '🔬', ruler: '📐 📏', scales: '⚖', moneybag: '💰 💸', coin: '🪙', gem: '💎', ring: '💍', beads: '📿',
  orb: '🔮', flask: '🧪', alembic: '⚗', salt: '🧂', bread: '🍞 🥖', meat: '🍖', mug: '🍺', goblet: '🍷', can: '🥫', bowl: '🥣 🫕', plate: '🍽', basket: '🧺', bucket: '🪣',
  crate: '📦', bag: '🎒 🧳', thread: '🧵 🪢', yarn: '🧶', glove: '🧤', boot: '🥾', coat: '🧥 🥋 👔', feather: '🪶', pen: '✎ ✏', log: '🪵', rock: '🪨', chain: '⛓ 🔗',
  candle: '🕯', lantern: '🏮', bulb: '💡', statue: '🗿 🗽', urn: '🏺 ⚱', tomb: '🪦', coffin: '⚰', tent: '🎪 ⛺ 🏕', fountain: '⛲', wheel: '🎡 ☸', die: '🎲',
  ticket: '🎟 🎫', gift: '🎁', party: '🎉 🎊', masks: '🎭', palette: '🎨', flag: '🚩 ⚑', flagWhite: '🏳', flagBlack: '🏴', flags: '🎌', pirate: '🏴‍☠',
  barrier: '🚧', forbidden: '⛔ 🚫', alarm: '🚨', warning: '⚠', question: '❓ ❔', info: 'ℹ', check: '✔ ✅ ☑', cross: '❌ ✖ ✕', arrowRight: '➡', play: '▶',
  ff: '⏩', up: '⬆', down: '⬇', back: '↩', lr: '↔', repeat: '🔁 🔄', shuffle: '🔀', undo: '↺', pause: '⏸', stop: '⏹', hourglass: '⏳ ⌛', stopwatch: '⏱',
  clock: '🕐 🕰', alarmClock: '⏰', calendar: '🗓 📅 📆', chart: '📊', chartUp: '📈', chartDown: '📉', cart: '🛒', wagon: '🚚 🛻', road: '🛤 🛣', bridge: '🌉',
  anchor: '⚓', ship: '⛵ 🚢', sled: '🛷', satellite: '🛰', compass: '🧭', map: '🗺', globe: '🌍 🌎 🌏', puzzle: '🧩', broom: '🧹', ladder: '🪜', hook: '🪝', trap: '🪤',
  sign: '🪧', ice: '🧊', zzz: '💤', rod: '🎣', bandage: '🩹', medic: '⛑', access: '♿', scissors: '✀ ✂', frame: '⛶', asterisk: '✳', loop: '➿', handshake: '🤝',
  pointer: '👉', hands: '🤲 🙏', fist: '✊', palm: '✋', muscle: '💪', walker: '🚶',
  person: '🧑 🧔 👤', worker: '👷', mage: '🧙 🧙‍♂', spy: '🕵', hero: '🦸', ghost: '👻', skull: '💀 ☠', demon: '👹', zombie: '🧟', farmer: '🧑‍🌾', merchant: '🤵',
  scholar: '🎓', mind: '🧠', heart: '❤ 🫀', blood: '🩸', eye: '👁 👁‍🗨', face: '🙂 😊', faceFlat: '😐', faceAngry: '😠', faceCold: '🥶',
  castle: '🏰', keep: '🏯', hall: '🏛 🕍', tower: '🗼', gate: '⛩', chapel: '⛪', stall: '🏪', arena: '🏟', houses: '🏘', house: '🏠 🏡', ruin: '🏚',
  hut: '🛖', construction: '🏗', workshop: '🏭', bricks: '🧱', door: '🚪', key: '🗝 🔑', lock: '🔒', unlock: '🔓',
  pine: '🌲', tree: '🌳', sprout: '🌱', herb: '🌿', clover: '🍀', wheat: '🌾', flower: '🌷 🌸 🌺 🌼', leaf: '🍂 🍁', nut: '🌰', fruit: '🍎', grapes: '🍇',
  wave: '🌊', drop: '💧', fire: '🔥', snow: '❄', sun: '☀', moon: '🌙', darkMoon: '🌑', star: '⭐ ★ ☆', starFull: '🌟', sparkle: '✨ 🌠', comet: '☄',
  volcano: '🌋', mountain: '🏔 ⛰ 🗻', desert: '🏜', valley: '🏞', vortex: '🌀', tornado: '🌪', wind: '🌬 💨', fog: '🌫', rain: '🌧', snowcloud: '🌨',
  storm: '⛈ 🌩', bolt: '⚡', sunrise: '🌅',
  dragon: '🐉 🐲', horse: '🐎 🐴', rider: '🏇', camel: '🐪 🐫', wolf: '🐺 🦊', deer: '🦌', sheep: '🐑 🐏', ox: '🐂', boar: '🐗', eagle: '🦅', bird: '🦜',
  dove: '🕊', lizard: '🦎', paws: '🐾', spider: '🕷', bug: '🦟 🐜', crab: '🦀', fish: '🐟', lion: '🦁', germ: '🦠',
  grain: '🌽', hide: '🦬',
  crystal: '💠', pit: '🕳', bin: '🗑', gender: '♀ ♂',
  dot: '🟠 🟢 🔴 🔵 🟡 ⚪ ⚫ 🟣', square: '◻ ⬜ 🟫 ⬛',
};
// Couleur propre de certaines pastilles et de quelques sceaux (le reste prend la couleur du texte)
const TINT = { '🟠': '#e0913a', '🟢': '#5fae5a', '🔴': '#d9604f', '🔵': '#5b8fd6', '🟡': '#e2c04a', '⚪': '#e8e2d2', '⚫': '#2a2420', '🟣': '#9a6ad6', '🟫': '#8a5a30', '⬛': '#2a2420' };
// Ressources principales : leur icône en couleur (symboles #r-… de icons.js)
const RES_EMOJI = { '🪵': 'wood', '🪨': 'stone', '⛓': 'iron', '🍖': 'food', '🪙': 'gold', '🍞': 'bread', '🌿': 'herbs', '💎': 'gems', '🥈': 'silver', '🌑': 'coal', '🌾': 'grain' };

const norm = (e) => e.replace(/️/g, '');
export const SIGIL_OF = {};
for (const [k, list] of Object.entries(MAP)) for (const e of list.split(' ')) SIGIL_OF[norm(e)] = k;
// Expression des symboles à remplacer (pictogrammes, drapeaux, séquences liées, variantes de teinte de peau)
export const EMOJI_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}|[♀♂])️?|[\u{1F3FB}-\u{1F3FF}])*️?/gu;
const HAS = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
export const hasEmoji = (t) => !!t && HAS.test(t);
// Sceau d'un emoji (séquence liée inconnue : sa première partie)
export function sigilKey(e) {
  const n = norm(e);
  if (SIGIL_OF[n]) return SIGIL_OF[n];
  const first = n.split('‍')[0].replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
  return SIGIL_OF[first] || null;
}
const OPS = (key) => SIGILS[key] || SIGILS.star;
function inner(key, tint) {
  return OPS(key).map(([m, d]) => (m === 's' ? `<path d="${d}" fill="none" stroke="${tint || 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : m === 'k' ? `<path d="${d}" fill="#f3e6c4"/>` : `<path d="${d}" fill="${tint || 'currentColor'}"${m === 'h' ? ' opacity=".3"' : ''}/>`)).join('');
}
export function sigilSvg(e, cls = 'sg') {
  const n = norm(e);
  if (RES_EMOJI[n]) return `<svg class="${cls} sg-res" viewBox="2 2 20 20" width="1.1em" height="1.1em" aria-hidden="true"><use href="#r-${RES_EMOJI[n]}"/></svg>`;
  const key = sigilKey(e);
  return `<svg class="${cls}" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${inner(key || 'star', TINT[n])}</svg>`;
}
export const sigilByKey = (key, cls = 'sg') => `<svg class="${cls}" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${inner(key)}</svg>`;
// Texte sans emoji (attributs, options, canvas, titre de la page) ; espaces doublés resserrés
export const stripEmoji = (t) => (hasEmoji(t) ? String(t).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '') : t);
// Texte → HTML avec sceaux (texte déjà échappé)
export const sigilizeHtml = (html) => (hasEmoji(html) ? html.replace(EMOJI_RE, (m) => sigilSvg(m)) : html);

// ───────── Canvas ─────────
const P2D = new Map();
const path2d = (d) => { let p = P2D.get(d); if (!p && typeof Path2D !== 'undefined') { p = new Path2D(d); P2D.set(d, p); } return p; };
// Dessine le sceau d'un emoji centré en (x, y), de taille size (px), à la couleur color
export function drawSigil(ctx, e, x, y, size, color = '#f6ecd2') {
  const key = sigilKey(e) || 'star', n = norm(e);
  const col = TINT[n] || color;
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2;
  for (const [m, d] of OPS(key)) {
    const p = path2d(d); if (!p) continue;
    if (m === 's') { ctx.strokeStyle = col; ctx.stroke(p); } else if (m === 'k') { ctx.fillStyle = '#f3e6c4'; ctx.fill(p); } else { ctx.globalAlpha = m === 'h' ? 0.3 : 1; ctx.fillStyle = col; ctx.fill(p); ctx.globalAlpha = 1; }
  }
  ctx.restore();
}
// Écrit un texte sur un canvas en remplaçant ses emojis par des sceaux (police et alignement de ctx)
export function fillTextSigils(ctx, text, x, y) {
  if (!hasEmoji(text)) { ctx.fillText(text, x, y); return; }
  const parts = String(text).split(EMOJI_RE), emos = String(text).match(EMOJI_RE) || [];
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || 12);
  const widths = parts.map((p) => ctx.measureText(p).width);
  const total = widths.reduce((a, b) => a + b, 0) + emos.length * size * 1.1;
  const align = ctx.textAlign; let cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  const base = ctx.textBaseline;
  const midY = base === 'middle' ? y : base === 'top' ? y + size / 2 : y - size * 0.35;
  ctx.textAlign = 'left';
  parts.forEach((p, i) => { if (p) { ctx.fillText(p, cx, y); cx += widths[i]; } if (emos[i]) { drawSigil(ctx, emos[i], cx + size * 0.55, midY, size, ctx.fillStyle); cx += size * 1.1; } });
  ctx.textAlign = align;
}

// ───────── DOM : passe sur les textes et les attributs ─────────
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
function fixText(n) {
  const t = n.nodeValue;
  if (!hasEmoji(t)) return;
  const parent = n.parentNode;
  if (!parent || SKIP.has(parent.nodeName)) return;
  // Options de liste, titre de la page : le texte seul
  if (parent.nodeName === 'OPTION' || parent.nodeName === 'TITLE' || parent.closest?.('select')) { n.nodeValue = stripEmoji(t); return; }
  // Texte SVG : un sceau dessiné à la place du texte
  if (parent.namespaceURI === 'http://www.w3.org/2000/svg') {
    if (parent.nodeName !== 'text' && parent.nodeName !== 'tspan') return;
    const txt = parent.nodeName === 'tspan' ? parent.closest('text') : parent;
    const rest = stripEmoji(t), emo = t.match(EMOJI_RE)[0];
    const fs = parseFloat(txt.getAttribute('font-size') || getComputedStyle(txt).fontSize) || 12;
    const x = parseFloat(txt.getAttribute('x') || 0), y = parseFloat(txt.getAttribute('y') || 0);
    const anchor = txt.getAttribute('text-anchor') || 'start';
    const gx = anchor === 'middle' ? x - fs / 2 : anchor === 'end' ? x - fs : x;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${gx} ${y - fs * 0.85}) scale(${fs / 24})`);
    g.setAttribute('class', 'sg-in-svg');
    g.innerHTML = inner(sigilKey(emo) || 'star', TINT[norm(emo)]);
    if (rest) n.nodeValue = rest; else n.nodeValue = '';
    txt.parentNode.insertBefore(g, txt);
    return;
  }
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of t.matchAll(EMOJI_RE)) {
    if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'sg-wrap'; span.setAttribute('aria-hidden', 'true');
    span.innerHTML = sigilSvg(m[0]);
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
  parent.replaceChild(frag, n);
}
function fixAttrs(el) {
  for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v && hasEmoji(v)) el.setAttribute(a, stripEmoji(v)); }
}
export function sigilize(root) {
  if (!root) return;
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (SKIP.has(root.nodeName)) return; fixAttrs(root); }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const texts = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 1) fixAttrs(n);
    else if (hasEmoji(n.nodeValue)) texts.push(n);
  }
  for (const n of texts) fixText(n);
}
// Surveille le document : tout ce qui est ajouté ou modifié est passé au crible
export function watchSigils(root = document.body) {
  if (typeof MutationObserver === 'undefined' || !root || root._sg) return;
  root._sg = true;
  sigilize(root);
  if (hasEmoji(document.title)) document.title = stripEmoji(document.title);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') for (const n of m.addedNodes) sigilize(n);
      else if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes' && m.target.nodeType === 1) fixAttrs(m.target);
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Monument dynastique : un édifice unique bâti en 5 étapes sur la carte du royaume (bâtiment « monument »).
// Le joueur choisit une orientation qui décide de son utilité ; le dessin change à chaque étape. Distinct des grands
// projets (sur la carte du monde, bonus économiques) : le monument raconte la dynastie et compte pour l'héritage
// (points d'héritage à la fondation d'une dynastie, vestige retrouvé par la dynastie suivante).
export const MONUMENT_STAGES = ['Fondations', 'Murs et parvis', 'Tour maîtresse', 'Flèche et ornements', 'Couronnement'];
export const ORIENTS = {
  citadel: { name: 'Citadelle ancestrale', icon: '🏰', color: '#8fa2b6', desc: 'Un bastion à la gloire des défenseurs du royaume.', per: { 'city.def': 0.04, 'garrison.def': 0.02 }, text: 'Défense de la ville +4 %, garnisons +2 % par étape' },
  archives: { name: 'Archives royales', icon: '📚', color: '#6f9fc7', desc: 'La mémoire écrite de la dynastie, ouverte aux savants.', per: { 'research.speed': 0.02, 'hero.xp': 0.03 }, text: 'Recherche +2 %, expérience des héros +3 % par étape' },
  garden: { name: 'Jardin royal', icon: '🌳', color: '#6fa35a', desc: 'Des jardins suspendus où le peuple vient se promener.', per: { 'prod.food': 0.02, 'prod.all': 0.008 }, text: 'Nourriture +2 %, toute production +0,8 % par étape' },
  memorial: { name: 'Mémorial des guerres', icon: '⚔️', color: '#cc5a4c', desc: 'Les noms des héros tombés, gravés dans la pierre.', per: { 'combat.morale': 2, 'combat.atk': 0.015 }, text: 'Moral +2, attaque +1,5 % par étape' },
};
// Points d'héritage apportés par le monument à la fondation d'une dynastie (un par étape achevée)
export const MONUMENT_HERITAGE_PER_STAGE = 1;

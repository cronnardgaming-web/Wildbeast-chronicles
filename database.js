/**
 * ============================================================
 * DATABASE.JS — Base de données centrale du jeu
 * Contient toutes les données de jeu, personnages, types, etc.
 * Architecture prévue pour migration vers serveur (REST/WebSocket)
 * ============================================================
 */

'use strict';

const GameDatabase = (() => {

  // ─── CONFIGURATION GLOBALE ───────────────────────────────────────────────────

  const DEFAULT_CONFIG = {
    game: {
      name: "WildBeast Chronicles",
      version: "1.0.0",
      maxTeamSize: 3,
      enemyTeamSize: { mode: "fixed", value: 3, min: 1, max: 5 },
    },
    combat: {
      damageFormula: "atk² / (atk + def)",  // Formule textuelle (documentaire)
      minDamage: 1,                           // Dégâts minimum
      captureBaseRate: 0.15,                  // Taux de capture de base
      rewardXpPerEnemy: 20,                   // XP gagnée par ennemi vaincu (× son niveau)
      rewardGoldPerEnemy: 5,                  // Pièces d'or gagnées par ennemi vaincu
      rewardDiamondsPerEnemy: 10,             // Diamants (cristaux) gagnés par ennemi vaincu
      speedEvasionCap: 0.10,                  // Max 10% d'écart sur esquive via vitesse
      speedAccuracyCap: 0.10,
      // ── Coups critiques ────────────────────────────────────────────────────
      critDivisor:    200,   // Diviseur pour le taux de crit : spd / (spd + critDivisor)
                              // ex: spd=200 → 50% crit, spd=50 → ~20%, spd=20 → ~9%
      critMultiplier: 1.5,   // Multiplicateur de dégâts sur un coup critique
      // ── Équilibrage joueur / ennemi ────────────────────────────────────────
      playerDmgBonus:  1.15, // Multiplicateur de dégâts joueur → ennemi (+15%)
      enemyDmgPenalty: 0.80, // Multiplicateur de dégâts ennemi → joueur (−20%)
      enemyStatRatio:  0.85, // Ratio de stats appliqué aux ennemis générés (−15%)
      // ── Équilibrage adaptatif (anti-snowball) ───────────────────────────────
      // 0 = désactivé. 1 = les ennemis absorbent l'intégralité de l'avantage du joueur.
      adaptiveScalingFactor: 0.6,
      // ── Mode Odyssée (histoire) ────────────────────────────────────────────
      story: {
        subLevelsPerWorld:   25,    // Nombre d'épreuves par sanctuaire
        eliteSubLevels:      [10, 20], // Épreuves élite (boost 10%)
        bossSubLevel:        25,    // Épreuve boss (boost 25%)
        eliteStatBoost:      0.10,  // +10% stats et niveau pour les élites
        bossStatBoost:       0.25,  // +25% stats et niveau pour les boss
        worldStatBoost:      0.10,  // +10% stats par sanctuaire supplémentaire accompli
      },
      // ── Fréquence d'apparition des ennemis par rareté (combat aléatoire) ────
      // Poids relatifs : plus la valeur est haute, plus cette rareté apparaît souvent.
      enemyRarityWeights: {
        common: 50, uncommon: 30, rare: 12, epic: 5, legendary: 2, mythic: 0.5,
      },
      // ── Bonus d'XP en % selon la rareté de l'ennemi vaincu ──────────────────
      // S'ajoute à l'XP de base (niveau × rewardXpPerEnemy) : ex. 50 = +50%.
      enemyXpBonusByRarity: {
        common: 0, uncommon: 10, rare: 25, epic: 50, legendary: 100, mythic: 200,
      },
    },
    level: {
      xpFormula: "base * (level ** expo)",  // Formule XP
      xpBase: 100,
      xpExponent: 1.8,
      statGrowthPerLevel: {
        hp:  0.05,   // +5% PV par niveau
        atk: 0.04,
        def: 0.04,
        spd: 0.03,
      },
    },
    // ── Niveau du JOUEUR (distinct du niveau des créatures) ───────────────────
    playerLevel: {
      xpFormula:    "base * (level ** expo)",  // Formule XP requise pour le niveau suivant
      xpBase:       80,
      xpExponent:   1.6,
      energyPerLevel: 5,    // Énergie maximum gagnée à chaque niveau joueur
      xpPerEnemyKill: 5,    // XP joueur gagnée par ennemi vaincu en combat
      xpPerCapture:   15,   // XP joueur gagnée par créature capturée (combat OU gacha)
    },
    energy: {
      enabled: true,
      max: 100,
      regenPerMinute: 1,
      combatCost: 10,           // conservé pour compatibilité (= coût du combat aléatoire)
      costs: {
        random:     10,   // Combat aléatoire
        story:      10,   // Mode Odyssée (histoire)
        line:       20,   // Combat par lignée
        fullRandom: 10,   // Combat Full Aléatoire
        arena:      15,   // Arènes
      },
    },
    audio: {
      enabled: true,
      globalMusicName: "",     // Nom du fichier importé pour la musique de fond globale
      combatMusicName: "",     // Nom du fichier importé pour la musique de combat
      sfxHitNormalName: "",    // Bruitage : coup normal
      sfxHitResistName: "",    // Bruitage : coup sur résistance (peu efficace)
      sfxHitWeakName:   "",    // Bruitage : coup sur faiblesse (super efficace)
      sfxVictoryName:   "",    // Bruitage : fin de combat — victoire
      sfxDefeatName:    "",    // Bruitage : fin de combat — défaite
      sfxLevelUpName:   "",    // Bruitage : montée de niveau
      sfxEvolutionName: "",    // Bruitage : évolution
      sfxGachaPullName: "",    // Bruitage : tirage Gacha (et révélation de capture)
    },
    gacha: {
      currencyName: "Gemmes",
      singlePullCost: 100,
      tenPullCost: 900,
      guaranteedRareAfter: 10,
      guaranteedEpicAfter: 50,
      guaranteedLegendaryAfter: 100,
      dropRates: {
        common:    50,
        uncommon:  30,
        rare:      12,
        epic:       5,
        legendary:  2,
        mythic:     0.5,
      },
    },
    awakening: {
      maxLevel: 12,
      bonusPerLevel: {
        // Bonus % par niveau d'Awakening, indexé par rareté
        common:    { hp: 2,  atk: 2,  def: 2,  spd: 1  },
        uncommon:  { hp: 3,  atk: 3,  def: 3,  spd: 2  },
        rare:      { hp: 4,  atk: 4,  def: 4,  spd: 3  },
        epic:      { hp: 5,  atk: 5,  def: 5,  spd: 4  },
        legendary: { hp: 7,  atk: 7,  def: 7,  spd: 5  },
        mythic:    { hp: 10, atk: 10, def: 10, spd: 7  },
      },
    },
  };

  // ─── TYPES ───────────────────────────────────────────────────────────────────

  const DEFAULT_TYPES = [
    { id: "fire",      name: "Prédateur", color: "#FF4500", icon: "🦁" },
    { id: "nature",    name: "Herbivore", color: "#32CD32", icon: "🐮" },
    { id: "water",     name: "Aquatique", color: "#1E90FF", icon: "🐟" },
    { id: "ice",       name: "Rapace",    color: "#87CEEB", icon: "🐦" },
    { id: "metal",     name: "Reptile",   color: "#A8A9AD", icon: "🐍" },
    { id: "electric",  name: "Insecte",   color: "#FFE000", icon: "🪲" },
    { id: "chaos",     name: "Venimeux",  color: "#FF0000", icon: "🦂" },
    { id: "shadow",    name: "Nocturne",  color: "#6A0DAD", icon: "🌓" },
    { id: "magic",     name: "Rusé",      color: "#FF69B4", icon: "🦊" },
    { id: "light",     name: "Colosse",   color: "#FFD700", icon: "🦍" },
    { id: "Cryptide",  name: "Cryptide",  color: "#36063C", icon: "🐉" },
  ];

  // ─── MATRICE DES TYPES ────────────────────────────────────────────────────────
  // Format : typeMatrix[attacker][defender] = multiplicateur
  // 2.0 = super efficace, 0.5 = peu efficace, 0 = immunité, 1.0 = normal

  const DEFAULT_TYPE_MATRIX = {
    fire:     { fire:1.0, nature:2.0, water:1.0, ice:1.0, metal:0.5, electric:1.0, chaos:1.0, shadow:1.0, magic:2.0, light:0.5, Cryptide:1.0 },
    nature:   { fire:0.5, nature:1.0, water:1.0, ice:0.5, metal:2.0, electric:1.0, chaos:2.0, shadow:1.0, magic:1.0, light:1.0, Cryptide:1.0 },
    water:    { fire:1.0, nature:1.0, water:1.0, ice:2.0, metal:0.5, electric:1.0, chaos:0.5, shadow:1.0, magic:1.0, light:2.0, Cryptide:1.0 },
    ice:      { fire:1.0, nature:1.0, water:0.5, ice:1.0, metal:2.0, electric:2.0, chaos:1.0, shadow:1.0, magic:1.0, light:0.5, Cryptide:1.0 },
    metal:    { fire:1.0, nature:2.0, water:1.0, ice:0.5, metal:0.5, electric:1.0, chaos:2.0, shadow:1.0, magic:1.0, light:2.0, Cryptide:1.0 },
    electric: { fire:1.0, nature:2.0, water:1.0, ice:0.5, metal:2.0, electric:1.0, chaos:1.0, shadow:0.5, magic:2.0, light:1.0, Cryptide:1.0 },
    chaos:    { fire:1.0, nature:0.5, water:2.0, ice:1.0, metal:0.5, electric:1.0, chaos:1.0, shadow:1.0, magic:1.0, light:2.0, Cryptide:1.0 },
    shadow:   { fire:2.0, nature:1.0, water:1.0, ice:2.0, metal:1.0, electric:0.5, chaos:1.0, shadow:1.0, magic:1.0, light:1.0, Cryptide:0.5 },
    magic:    { fire:0.5, nature:1.0, water:1.0, ice:1.0, metal:1.0, electric:0.5, chaos:1.0, shadow:1.0, magic:0.5, light:2.0, Cryptide:2.0 },
    light:    { fire:2.0, nature:1.0, water:1.0, ice:2.0, metal:1.0, electric:2.0, chaos:0.5, shadow:1.0, magic:1.0, light:0.5, Cryptide:1.0 },
    Cryptide: { fire:1.0, nature:2.0, water:1.0, ice:1.0, metal:1.0, electric:2.0, chaos:1.0, shadow:2.0, magic:0.5, light:1.0, Cryptide:0.5 },
  };

  // ─── PERSONNAGES ──────────────────────────────────────────────────────────────

  const DEFAULT_CHARACTERS = [
    // ── LIGNÉE 1 : Ignis → Pyria → Inferna ──
    {
      id: "char_001", name: "Renardeau", description: "Un petit renard des plaines dont la fourrure rousse brûle comme des braises.",
      portrait: null, rarity: "common", evolutionLine: "line_001", evolutionStage: 0,
      type1: "fire", type2: null,
      baseStats: { hp: 350, atk: 65, def: 40, spd: 55 },
      evolutionCondition: { type: "level", value: 15 },
      evolvesTo: "char_002",
    },
    {
      id: "char_002", name: "Fennec", description: "Ses grandes oreilles captent la chaleur du désert. Ses pattes laissent des traces enflammées.",
      portrait: null, rarity: "uncommon", evolutionLine: "line_001", evolutionStage: 1,
      type1: "fire", type2: "magic",
      baseStats: { hp: 550, atk: 95, def: 60, spd: 70 },
      evolutionCondition: { type: "level", value: 35 },
      evolvesTo: "char_003",
    },
    {
      id: "char_003", name: "Renard-Feu", description: "Un renard mythique dont la crinière est faite de flammes vivantes. Les volcans s'inclinent.",
      portrait: null, rarity: "epic", evolutionLine: "line_001", evolutionStage: 2,
      type1: "fire", type2: "chaos",
      baseStats: { hp: 850, atk: 145, def: 90, spd: 90 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 2 : Aqua → Marina → Abyssara ──
    {
      id: "char_004", name: "Loutreau", description: "Un louveteau des rivières au regard doux, capable de retenir sa respiration des heures.",
      portrait: null, rarity: "common", evolutionLine: "line_002", evolutionStage: 0,
      type1: "water", type2: null,
      baseStats: { hp: 400, atk: 55, def: 60, spd: 50 },
      evolutionCondition: { type: "level", value: 15 },
      evolvesTo: "char_005",
    },
    {
      id: "char_005", name: "Lontre", description: "Sa queue puissante génère des vagues. Elle nage plus vite que les dauphins.",
      portrait: null, rarity: "rare", evolutionLine: "line_002", evolutionStage: 1,
      type1: "water", type2: "ice",
      baseStats: { hp: 650, atk: 85, def: 90, spd: 65 },
      evolutionCondition: { type: "level", value: 40 },
      evolvesTo: "char_006",
    },
    {
      id: "char_006", name: "Léviasquale", description: "Requin colossal des abysses. Son sillage provoque des tsunamis côtiers.",
      portrait: null, rarity: "legendary", evolutionLine: "line_002", evolutionStage: 2,
      type1: "water", type2: "shadow",
      baseStats: { hp: 1100, atk: 130, def: 150, spd: 80 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 3 : Sylva → Florica → Verdania ──
    {
      id: "char_007", name: "Faon", description: "Un faon timide dont les sabots font pousser des fleurs à chaque pas.",
      portrait: null, rarity: "common", evolutionLine: "line_003", evolutionStage: 0,
      type1: "nature", type2: null,
      baseStats: { hp: 420, atk: 50, def: 55, spd: 60 },
      evolutionCondition: { type: "level", value: 12 },
      evolvesTo: "char_008",
    },
    {
      id: "char_008", name: "Cervidé", description: "Ses bois servent d'antennes pour communiquer avec les arbres anciens.",
      portrait: null, rarity: "uncommon", evolutionLine: "line_003", evolutionStage: 1,
      type1: "nature", type2: "magic",
      baseStats: { hp: 650, atk: 75, def: 80, spd: 75 },
      evolutionCondition: { type: "level", value: 30 },
      evolvesTo: "char_009",
    },
    {
      id: "char_009", name: "Cerf-Sylvain", description: "Un cerf sacré dont la ramure touche les nuages. Les forêts grandissent à son galop.",
      portrait: null, rarity: "epic", evolutionLine: "line_003", evolutionStage: 2,
      type1: "nature", type2: "light",
      baseStats: { hp: 950, atk: 110, def: 130, spd: 95 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 4 : Umbra → Noctis → Voidria ──
    {
      id: "char_010", name: "Chiro", description: "Une petite chauve-souris aux ultrasons si puissants qu'ils fendent le roc.",
      portrait: null, rarity: "uncommon", evolutionLine: "line_004", evolutionStage: 0,
      type1: "shadow", type2: null,
      baseStats: { hp: 330, atk: 80, def: 35, spd: 90 },
      evolutionCondition: { type: "level", value: 20 },
      evolvesTo: "char_011",
    },
    {
      id: "char_011", name: "Vespertaur", description: "Une chauve-souris géante dont les ailes bloquent la lune entière.",
      portrait: null, rarity: "rare", evolutionLine: "line_004", evolutionStage: 1,
      type1: "shadow", type2: "chaos",
      baseStats: { hp: 520, atk: 120, def: 55, spd: 130 },
      evolutionCondition: { type: "level", value: 45 },
      evolvesTo: "char_012",
    },
    {
      id: "char_012", name: "Nycthralis", description: "Prédateur des ombres absolu. Son passage efface la lumière de toute une région.",
      portrait: null, rarity: "mythic", evolutionLine: "line_004", evolutionStage: 2,
      type1: "shadow", type2: "chaos",
      baseStats: { hp: 800, atk: 200, def: 80, spd: 200 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 5 : Luce → Aurea → Solaria ──
    {
      id: "char_013", name: "Colombe", description: "Une colombe dont les plumes rayonnent d'une lumière apaisante.",
      portrait: null, rarity: "common", evolutionLine: "line_005", evolutionStage: 0,
      type1: "light", type2: null,
      baseStats: { hp: 380, atk: 55, def: 65, spd: 55 },
      evolutionCondition: { type: "level", value: 18 },
      evolvesTo: "char_014",
    },
    {
      id: "char_014", name: "Paon-Doré", description: "Chaque plume de sa queue est un miroir solaire capturant des millénaires de lumière.",
      portrait: null, rarity: "rare", evolutionLine: "line_005", evolutionStage: 1,
      type1: "light", type2: "magic",
      baseStats: { hp: 600, atk: 90, def: 100, spd: 70 },
      evolutionCondition: { type: "level", value: 42 },
      evolvesTo: "char_015",
    },
    {
      id: "char_015", name: "Phénix", description: "L'oiseau de feu éternel. Sa renaissance est assez puissante pour illuminer un continent.",
      portrait: null, rarity: "legendary", evolutionLine: "line_005", evolutionStage: 2,
      type1: "light", type2: "fire",
      baseStats: { hp: 1000, atk: 140, def: 140, spd: 90 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 6 : Volt → Strika → Thundara ──
    {
      id: "char_016", name: "Belettron", description: "Une belette électrique dont les décharges laissent des éclairs gravés dans l'air.",
      portrait: null, rarity: "uncommon", evolutionLine: "line_006", evolutionStage: 0,
      type1: "electric", type2: null,
      baseStats: { hp: 310, atk: 75, def: 30, spd: 110 },
      evolutionCondition: { type: "level", value: 22 },
      evolvesTo: "char_017",
    },
    {
      id: "char_017", name: "Visonix", description: "Hybride métal-foudre, ce mustélidé crée de l'électricité en courant.",
      portrait: null, rarity: "rare", evolutionLine: "line_006", evolutionStage: 1,
      type1: "electric", type2: "metal",
      baseStats: { hp: 490, atk: 110, def: 50, spd: 160 },
      evolutionCondition: { type: "level", value: 50 },
      evolvesTo: "char_018",
    },
    {
      id: "char_018", name: "Foudradon", description: "Un dragon-belette tempête. Son rugissement déclenche des orages sur des centaines de kilomètres.",
      portrait: null, rarity: "legendary", evolutionLine: "line_006", evolutionStage: 2,
      type1: "electric", type2: "chaos",
      baseStats: { hp: 750, atk: 175, def: 70, spd: 230 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 7 : Frosta → Crystallia → Glaciara ──
    {
      id: "char_019", name: "Arctifox", description: "Un renard arctique dont la fourrure blanche cristallise tout ce qu'elle touche.",
      portrait: null, rarity: "common", evolutionLine: "line_007", evolutionStage: 0,
      type1: "ice", type2: null,
      baseStats: { hp: 360, atk: 60, def: 50, spd: 65 },
      evolutionCondition: { type: "level", value: 14 },
      evolvesTo: "char_020",
    },
    {
      id: "char_020", name: "Louvopolaire", description: "Un loup polaire dont les crocs sont des stalactites naturels.",
      portrait: null, rarity: "rare", evolutionLine: "line_007", evolutionStage: 1,
      type1: "ice", type2: "magic",
      baseStats: { hp: 570, atk: 90, def: 80, spd: 80 },
      evolutionCondition: { type: "level", value: 38 },
      evolvesTo: "char_021",
    },
    {
      id: "char_021", name: "Ursglacier", description: "Un ours des glaces millénaire. Son souffle peut geler un lac instantanément.",
      portrait: null, rarity: "epic", evolutionLine: "line_007", evolutionStage: 2,
      type1: "ice", type2: "shadow",
      baseStats: { hp: 880, atk: 135, def: 125, spd: 100 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 8 : Ferroa → Titanis → Adamantia ──
    {
      id: "char_022", name: "Scarabot", description: "Un scarabée de métal dont la carapace résiste à n'importe quel impact.",
      portrait: null, rarity: "uncommon", evolutionLine: "line_008", evolutionStage: 0,
      type1: "metal", type2: null,
      baseStats: { hp: 500, atk: 55, def: 90, spd: 35 },
      evolutionCondition: { type: "level", value: 25 },
      evolvesTo: "char_023",
    },
    {
      id: "char_023", name: "Rhinofer", description: "Un rhinocéros dont la corne est faite d'acier pur. Sa charge fait trembler la terre.",
      portrait: null, rarity: "rare", evolutionLine: "line_008", evolutionStage: 1,
      type1: "metal", type2: "light",
      baseStats: { hp: 800, atk: 85, def: 145, spd: 45 },
      evolutionCondition: { type: "level", value: 55 },
      evolvesTo: "char_024",
    },
    {
      id: "char_024", name: "Colosson", description: "Un gorille de métal adamantin. Ses poings peuvent fendre des montagnes.",
      portrait: null, rarity: "legendary", evolutionLine: "line_008", evolutionStage: 2,
      type1: "metal", type2: "light",
      baseStats: { hp: 1300, atk: 130, def: 220, spd: 55 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 9 : Mystara → Arcania → Omnimaga ──
    {
      id: "char_025", name: "Chouard", description: "Une chouette novice dont les yeux perçoivent les flux magiques invisibles.",
      portrait: null, rarity: "common", evolutionLine: "line_009", evolutionStage: 0,
      type1: "magic", type2: null,
      baseStats: { hp: 340, atk: 70, def: 40, spd: 60 },
      evolutionCondition: { type: "level", value: 16 },
      evolvesTo: "char_026",
    },
    {
      id: "char_026", name: "Hibomage", description: "Un hibou-mage maîtrisant 7 des 9 branches de la magie animale.",
      portrait: null, rarity: "epic", evolutionLine: "line_009", evolutionStage: 1,
      type1: "magic", type2: "electric",
      baseStats: { hp: 550, atk: 115, def: 65, spd: 85 },
      evolutionCondition: { type: "level", value: 45 },
      evolvesTo: "char_027",
    },
    {
      id: "char_027", name: "Omniphox", description: "Le Grand-Sage des bêtes. Il peut reconfigurer les lois physiques par son chant.",
      portrait: null, rarity: "mythic", evolutionLine: "line_009", evolutionStage: 2,
      type1: "magic", type2: "chaos",
      baseStats: { hp: 900, atk: 190, def: 100, spd: 120 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 10 : Chaora (Personnage solo sans évolution) ──
    {
      id: "char_028", name: "Chimèra", description: "Une créature composite impossible : lion, dragon, serpent. L'incarnation du chaos.",
      portrait: null, rarity: "mythic", evolutionLine: "line_010", evolutionStage: 0,
      type1: "chaos", type2: "shadow",
      baseStats: { hp: 999, atk: 180, def: 80, spd: 180 },
      evolutionCondition: null, evolvesTo: null,
    },

    // ── LIGNÉE 11 : Zara → Zephyra ──
    {
      id: "char_029", name: "Guéprix", description: "Un guépard électrique dont les spots ressemblent à des éclairs fossilisés.",
      portrait: null, rarity: "rare", evolutionLine: "line_011", evolutionStage: 0,
      type1: "nature", type2: "electric",
      baseStats: { hp: 450, atk: 90, def: 55, spd: 95 },
      evolutionCondition: { type: "level", value: 30 },
      evolvesTo: "char_030",
    },
    {
      id: "char_030", name: "Panthorex", description: "Une panthère-tonnerre qui surfe sur les tornades et dompte les ouragans.",
      portrait: null, rarity: "epic", evolutionLine: "line_011", evolutionStage: 1,
      type1: "nature", type2: "electric",
      baseStats: { hp: 720, atk: 140, def: 85, spd: 145 },
      evolutionCondition: null, evolvesTo: null,
    },
  ];

  // ─── PASSIFS ──────────────────────────────────────────────────────────────────
  // Un passif est lié à un type (typeId). Tout créature possédant ce type sur
  // type1 OU type2 hérite automatiquement du passif correspondant. Un créature
  // bi-type cumule les deux passifs de ses deux types.
  //
  // trigger : moment où le passif tente de se déclencher
  //   'onAttack'      → quand le créature attaque (avant résolution des dégâts)
  //   'onHit'         → quand le créature attaque ET touche (après résolution)
  //   'onDamaged'     → quand le créature subit des dégâts
  //   'onTurnEnd'     → à la fin de chaque tour (après l'action du joueur ET de l'ennemi)
  //   'onBattleStart' → une seule fois, au tout début du combat
  //   'passive'       → toujours actif, pas de jet aléatoire (chance ignorée)
  //
  // chance : probabilité de déclenchement (0 à 1) à chaque occasion du trigger
  // Les valeurs numériques (value, value2…) sont éditables depuis l'admin.

  const DEFAULT_PASSIVES = {
    fire: {
      id: "fire", name: "Meute",
      description: "Augmente l'attaque d'un autre allié aléatoire de 10% pour une attaque (5% de chance).",
      trigger: "onAttack", chance: 0.05,
      value: 10,   // % de bonus ATK
      icon: "🐺",
    },
    nature: {
      id: "nature", name: "Régénération",
      description: "Soigne 10% des PV max sur l'allié possédant le moins de vie (10% de chance).",
      trigger: "onTurnEnd", chance: 0.10,
      value: 10,   // % de PV max soignés
      icon: "🌱",
    },
    ice: {
      id: "ice", name: "Œil Vif",
      description: "Augmente les dégâts critiques de +25%.",
      trigger: "passive", chance: 1.0,  // passif permanent, pas de jet aléatoire
      value: 25,   // % additionnel sur le multiplicateur critique
      icon: "🦅",
    },
    water: {
      id: "water", name: "Tsunami",
      description: "À la fin du tour, 10% de chance d'infliger 5% de dégâts (des PV max) à tous les adversaires.",
      trigger: "onTurnEnd", chance: 0.10,
      value: 5,    // % des PV max infligés
      icon: "🌊",
    },
    metal: {
      id: "metal", name: "Mue",
      description: "Juste avant d'attaquer, retire toutes les altérations d'état sur soi-même (35% de chance).",
      trigger: "onAttack", chance: 0.35,
      value: 0,
      icon: "🐍",
    },
    electric: {
      id: "electric", name: "Paralysie",
      description: "Peut paralyser l'adversaire touché (5% de chance), l'empêchant d'agir pendant 1 attaque.",
      trigger: "onHit", chance: 0.05,
      value: 1,    // durée en tours
      icon: "⚡",
    },
    shadow: {
      id: "shadow", name: "Ombre",
      description: "Augmente l'esquive de 7%.",
      trigger: "passive", chance: 1.0,
      value: 7,    // % d'esquive additionnelle
      icon: "🌓",
    },
    chaos: {
      id: "chaos", name: "Venin",
      description: "Peut empoisonner l'adversaire touché (5% de chance) : -2% PV max par tour pendant 5 tours.",
      trigger: "onHit", chance: 0.05,
      value: 2,    // % des PV max perdus par tour
      value2: 5,   // durée en tours
      icon: "☠️",
    },
    light: {
      id: "light", name: "Contre-Attaque",
      description: "Lorsqu'il subit des dégâts, 5% de chance de lancer une attaque immédiatement sur l'attaquant.",
      trigger: "onDamaged", chance: 0.05,
      value: 0,
      icon: "🦍",
    },
    magic: {
      id: "magic", name: "Hypnose",
      description: "Peut charmer l'adversaire touché (5% de chance) : sa prochaine attaque vise un de ses coéquipiers au hasard.",
      trigger: "onHit", chance: 0.05,
      value: 1,    // durée en tours (nombre d'attaques affectées)
      icon: "🦊",
    },
    Cryptide: {
      id: "Cryptide", name: "Mystère",
      description: "Au début du combat, ce créature reçoit aléatoirement un des autres passifs.",
      trigger: "onBattleStart", chance: 1.0,
      value: 0,
      icon: "🐉",
    },
  };

  // Branché ici (après sa déclaration) car DEFAULT_CONFIG est défini plus haut
  // dans le fichier, avant que DEFAULT_PASSIVES existe.
  DEFAULT_CONFIG.passives = DEFAULT_PASSIVES;

  // ─── RARITÉS ──────────────────────────────────────────────────────────────────

  const RARITIES = {
    common:    { name: "Commune",    color: "#9CA3AF", stars: 1, gachaWeight: 50 },
    uncommon:  { name: "Peu commune",color: "#34D399", stars: 2, gachaWeight: 30 },
    rare:      { name: "Rare",       color: "#60A5FA", stars: 3, gachaWeight: 12 },
    epic:      { name: "Épique",     color: "#A78BFA", stars: 4, gachaWeight: 5  },
    legendary: { name: "Légendaire", color: "#F59E0B", stars: 5, gachaWeight: 2  },
    mythic:    { name: "Mythique",   color: "#F43F5E", stars: 6, gachaWeight: 0.5},
  };

  // ─── BANNIÈRES GACHA ─────────────────────────────────────────────────────────

  const DEFAULT_BANNERS = [
    {
      id: "banner_standard", name: "Invocation Sauvage",
      description: "Toutes les créatures disponibles.", active: true,
      featured: [], pool: "all",
      featuredRateBoost: 0,
    },
    {
      id: "banner_fire", name: "Bannière Volcanique",
      description: "Les créatures de feu ont un taux augmenté.",
      active: true, featured: ["char_003", "char_015"],
      pool: "all", featuredRateBoost: 2.0,
    },
  ];

  // ─── ÉQUIPEMENTS ─────────────────────────────────────────────────────────────

  const DEFAULT_EQUIPMENT = [
    {
      id: "equip_001", name: "Collier de Rubis", slot: "accessory",
      description: "Renforce les griffes de la créature.", rarity: "common",
      level: 1, maxLevel: 10,
      bonuses: { hp: 0, atk: 15, def: 0, spd: 0 },
    },
    {
      id: "equip_002", name: "Carapace Cristalline", slot: "armor",
      description: "Blindage naturel renforcé.", rarity: "rare",
      level: 1, maxLevel: 10,
      bonuses: { hp: 50, atk: 0, def: 30, spd: 0 },
    },
    {
      id: "equip_003", name: "Plumes du Vent", slot: "armor",
      description: "Permet des déplacements foudroyants.", rarity: "uncommon",
      level: 1, maxLevel: 10,
      bonuses: { hp: 0, atk: 0, def: 0, spd: 20 },
    },
    {
      id: "equip_004", name: "Amulette de Vitalité", slot: "accessory",
      description: "Canalise l'énergie vitale animale.", rarity: "epic",
      level: 1, maxLevel: 10,
      bonuses: { hp: 200, atk: 10, def: 10, spd: 5 },
    },
    {
      id: "equip_005", name: "Croc Mythique", slot: "weapon",
      description: "Le croc de l'alpha légendaire.", rarity: "legendary",
      level: 1, maxLevel: 10,
      bonuses: { hp: 100, atk: 80, def: 20, spd: 15 },
    },
  ];

  // ─── DONNÉES JOUEUR PAR DÉFAUT ────────────────────────────────────────────────

  const DEFAULT_PLAYER = {
    id: "player_local",
    name: "Dresseur",
    level: 1,
    experience: 0,
    currency: { crystals: 1000, gold: 500 },
    energy: { current: 100, max: 100, lastRegen: Date.now() },
    team: [],              // IDs des instances dans la collection
    collection: [],        // Tableau d'instances de personnages
    equipment: [],         // Équipements du joueur (instances)
    bestiaire: {},         // { charId: { discovered: true, portrait: null, ... } }
    inventory: {},         // { itemId: quantity }
    equipInventory: [],    // Instances d'équipements obtenus
    story: {               // Progression Mode Odyssée
      world: 1,            // Sanctuaire courant (1-indexé)
      subLevel: 0,         // Dernière épreuve COMPLÉTÉE (0 = aucune)
    },
    equipPity: {           // Pitié gacha équipements
      standard: { pulls: 0, rareGuarantee: 0, epicGuarantee: 0 },
    },
    pity: {                // Système de pitié gacha
      standard: { pulls: 0, rareGuarantee: 0, epicGuarantee: 0, legendaryGuarantee: 0 },
    },
    stats: {
      totalPulls: 0,
      totalBattles: 0,
      totalVictories: 0,
      totalCaptures: 0,
      playtime: 0,
    },
    // ── Récompenses de connexion quotidienne ──────────────────────────────────
    // { [cycleId]: { dayIndex: number (0-indexé, prochain jour à réclamer),
    //                lastClaimDate: 'YYYY-MM-DD' | null } }
    loginCycleState: {},
    // ── Quêtes quotidiennes ───────────────────────────────────────────────────
    dailyQuestState: {
      date: null,           // 'YYYY-MM-DD' du tirage actuel
      questIds: [],         // les 3 IDs de quêtes tirées pour la date courante
      progress: {},         // { questId: number } compteur courant
      claimed: {},          // { questId: true } déjà réclamée aujourd'hui
    },
    // ── Boutique : suivi des achats pour faire respecter les limites ─────────
    // { [shopItemId]: { lifetimeCount: number, dailyCount: number, dailyDate: 'YYYY-MM-DD' } }
    shopPurchaseState: {},
  };

  // ─── ITEMS ────────────────────────────────────────────────────────────────────
  //
  // Système d'effets génériques : chaque objet porte une liste `effects`, où
  // chaque effet a un `type` (cf. ITEM_EFFECT_TYPES ci-dessous) et des
  // paramètres propres à ce type. Un objet peut combiner plusieurs effets
  // (ex: +50 énergie ET +100 or en un seul objet).
  //
  // `targetsCharacter: true` indique que l'objet doit s'appliquer à une
  // créature précise choisie par le joueur au moment de l'utilisation
  // (ex: gainCharLevel, gainCharXp) — l'UI doit alors demander une sélection
  // avant d'autoriser le bouton "Utiliser", exactement comme la Pillule de
  // Puissance aujourd'hui.

  /**
   * Catalogue fermé des types d'effets utilisables sur un objet. L'admin
   * choisit parmi cette liste et remplit les `params` associés ; ItemSystem
   * (à l'exécution) sait appliquer chacun de ces types.
   */
  const ITEM_EFFECT_TYPES = [
    { type: 'gainEnergy',     label: '⚡ Donner de l\'Énergie',         targetsCharacter: false, params: [{ key: 'amount', label: 'Quantité', default: 50 }] },
    { type: 'healEnergyFull', label: '🔋 Régénérer l\'Énergie au max',  targetsCharacter: false, params: [] },
    { type: 'grantCurrency',  label: '💰 Donner Gemmes / Or',           targetsCharacter: false, params: [{ key: 'crystals', label: 'Gemmes', default: 0 }, { key: 'gold', label: 'Or', default: 0 }] },
    { type: 'gainPlayerXp',   label: '🌟 Donner de l\'XP Joueur',       targetsCharacter: false, params: [{ key: 'amount', label: 'Quantité XP', default: 100 }] },
    { type: 'gainCharLevel',  label: '💊 Faire monter une créature de niveau(x)', targetsCharacter: true, params: [{ key: 'levels', label: 'Nombre de niveaux', default: 1 }] },
    { type: 'gainCharXp',     label: '✨ Donner de l\'XP à une créature', targetsCharacter: true, params: [{ key: 'amount', label: 'Quantité XP', default: 100 }] },
  ];

  const DEFAULT_ITEMS = [
    {
      id: 'item_power_pill',
      name: 'Pillule de Puissance',
      icon: '💊',
      description: 'Fait gagner immédiatement 1 niveau à n\'importe quelle créature.',
      stackable: true,
      effects: [{ type: 'gainCharLevel', levels: 1 }],
    },
    {
      id: 'item_energy_potion',
      name: 'Potion d\'Énergie',
      icon: '🧪',
      description: 'Redonne immédiatement 50 points d\'énergie.',
      stackable: true,
      effects: [{ type: 'gainEnergy', amount: 50 }],
    },
  ];

  // ─── BOUTIQUE ─────────────────────────────────────────────────────────────────
  //
  // Catalogue d'articles achetables avec Gemmes ou Or, paramétrable en admin.
  // Chaque article référence un objet existant (equipment/items/characters)
  // par son ID, plus son propre prix/devise/limites — la même créature ou le
  // même équipement peuvent donc avoir un prix différent de leur valeur "native"
  // ailleurs dans le jeu (gacha, etc.), puisque le prix est porté par l'article
  // de boutique lui-même, pas par la définition d'origine.
  //
  // category: 'equipment' | 'item' | 'character'
  // currency: 'crystals' | 'gold'
  // limit: { type: 'none'|'daily'|'lifetime', amount: number } — quota d'achat
  //   - 'none'    : achats illimités
  //   - 'daily'   : max `amount` achats par jour calendaire (reset à minuit)
  //   - 'lifetime': max `amount` achats au total sur le compte, pour toujours

  const DEFAULT_SHOP_ITEMS = [];

  // ─── QUÊTES QUOTIDIENNES ──────────────────────────────────────────────────────
  // Catalogue fixe de 14 types de quêtes (le "type" pilote le tracking automatique
  // en jeu, cf. QuestSystem). L'admin ne peut pas en ajouter de nouvelles (la liste
  // est fermée), seulement activer/désactiver chacune et paramétrer sa récompense.
  // reward: { crystals, gold, items: { itemId: qty } }

  const DEFAULT_DAILY_QUESTS = [
    { id: 'q_capture_1',     type: 'capture',     target: 1,  active: true, label: 'Capturer 1 créature',
      reward: { crystals: 50,  gold: 0,   items: {} } },
    { id: 'q_capture_2',     type: 'capture',     target: 2,  active: true, label: 'Capturer 2 créatures',
      reward: { crystals: 100, gold: 0,   items: {} } },
    { id: 'q_capture_3',     type: 'capture',     target: 3,  active: true, label: 'Capturer 3 créatures',
      reward: { crystals: 150, gold: 0,   items: {} } },
    { id: 'q_defeat_5',      type: 'defeat',      target: 5,  active: true, label: 'Battre 5 ennemis',
      reward: { crystals: 0,   gold: 200, items: {} } },
    { id: 'q_defeat_10',     type: 'defeat',      target: 10, active: true, label: 'Battre 10 ennemis',
      reward: { crystals: 0,   gold: 400, items: {} } },
    { id: 'q_pull_equip_1',  type: 'pullEquip',   target: 1,  active: true, label: 'Invoquer 1 équipement',
      reward: { crystals: 0,   gold: 150, items: {} } },
    { id: 'q_pull_equip_10', type: 'pullEquip',   target: 10, active: true, label: 'Invoquer 10 équipements',
      reward: { crystals: 0,   gold: 800, items: {} } },
    { id: 'q_pull_char_1',   type: 'pullChar',    target: 1,  active: true, label: 'Invoquer 1 personnage',
      reward: { crystals: 80,  gold: 0,   items: {} } },
    { id: 'q_pull_char_10',  type: 'pullChar',    target: 10, active: true, label: 'Invoquer 10 personnages',
      reward: { crystals: 400, gold: 0,   items: {} } },
    { id: 'q_line_1',        type: 'line',        target: 1,  active: true, label: 'Réussir 1 combat de lignée',
      reward: { crystals: 60,  gold: 0,   items: {} } },
    { id: 'q_line_3',        type: 'line',        target: 3,  active: true, label: 'Réussir 3 combats de lignée',
      reward: { crystals: 180, gold: 0,   items: {} } },
    { id: 'q_fullrandom_1',  type: 'fullRandom',  target: 1,  active: true, label: 'Réussir 1 combat Full Aléatoire',
      reward: { crystals: 60,  gold: 0,   items: {} } },
    { id: 'q_fullrandom_3',  type: 'fullRandom',  target: 3,  active: true, label: 'Réussir 3 combats Full Aléatoire',
      reward: { crystals: 180, gold: 0,   items: {} } },
    { id: 'q_story_1',       type: 'story',       target: 1,  active: true, label: "Réussir 1 combat d'Odyssée",
      reward: { crystals: 100, gold: 0,   items: { item_energy_potion: 1 } } },
  ];

  // ─── RÉCOMPENSES DE CONNEXION QUOTIDIENNE ────────────────────────────────────
  // Cycles paramétrables en admin : chaque cycle a une liste ordonnée de jours,
  // chacun avec sa propre récompense. Plusieurs cycles peuvent être actifs en
  // parallèle (ex : un cycle 7 jours de pièces + un cycle 3 jours de potions).
  // La progression de chaque cycle ne se réinitialise jamais sur un jour manqué :
  // elle avance d'un jour à chaque NOUVELLE date calendaire de connexion, et
  // reboucle au jour 1 une fois le dernier jour du cycle réclamé.

  const DEFAULT_LOGIN_CYCLES = [
    {
      id: 'login_cycle_coins',
      name: 'Récompenses Quotidiennes',
      active: true,
      days: [
        { reward: { crystals: 20,  gold: 50,  items: {} } },
        { reward: { crystals: 30,  gold: 75,  items: {} } },
        { reward: { crystals: 40,  gold: 100, items: {} } },
        { reward: { crystals: 60,  gold: 150, items: {} } },
        { reward: { crystals: 80,  gold: 200, items: {} } },
        { reward: { crystals: 100, gold: 250, items: {} } },
        { reward: { crystals: 200, gold: 500, items: {} } },
      ],
    },
    {
      id: 'login_cycle_potions',
      name: 'Cycle Potions',
      active: true,
      days: [
        { reward: { crystals: 0, gold: 0, items: { item_energy_potion: 1 } } },
        { reward: { crystals: 0, gold: 0, items: { item_energy_potion: 1 } } },
        { reward: { crystals: 0, gold: 0, items: { item_power_pill: 1 } } },
      ],
    },
  ];

  // ─── BANNIÈRE GACHA ÉQUIPEMENTS ───────────────────────────────────────────────

  const DEFAULT_EQUIP_BANNERS = [
    {
      id: 'equip_banner_standard',
      name: 'Invocation Équipement',
      description: 'Obtenez des équipements pour renforcer vos personnages.',
      active: true,
      singlePullCost: 80,
      tenPullCost: 720,
      guaranteedRareAfter: 10,
      guaranteedEpicAfter: 30,
      dropRates: {
        common:    45,
        uncommon:  30,
        rare:      16,
        epic:       7,
        legendary:  2,
      },
    },
  ];

  // ─── DONNÉES FUTURES (stubs pour migration) ───────────────────────────────────

  const FUTURE_STUBS = {
    talents: [],
    activeSkills: [],
    passiveSkills: [],
    items: [],
    weapons: [],
    events: [],
    quests: [],
    achievements: [],
    leaderboard: [],
    onlineConfig: { enabled: false, serverUrl: null, wsUrl: null },
  };

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    DEFAULT_CONFIG,
    DEFAULT_TYPES,
    DEFAULT_TYPE_MATRIX,
    DEFAULT_PASSIVES,
    DEFAULT_CHARACTERS,
    RARITIES,
    DEFAULT_BANNERS,
    DEFAULT_EQUIPMENT,
    DEFAULT_ITEMS,
    ITEM_EFFECT_TYPES,
    DEFAULT_SHOP_ITEMS,
    DEFAULT_DAILY_QUESTS,
    DEFAULT_LOGIN_CYCLES,
    DEFAULT_EQUIP_BANNERS,
    DEFAULT_PLAYER,
    FUTURE_STUBS,

    /** Les 3 slots d'équipement valides, dans l'ordre (index 0, 1, 2) */
    EQUIP_SLOTS: ['weapon', 'armor', 'accessory'],

    /**
     * Résout le slot d'un équipement, avec repli sur l'ancien champ "category"
     * pour les équipements créés avant l'introduction du système de slots.
     * @param {object} equipDef
     * @returns {'weapon'|'armor'|'accessory'}
     */
    resolveEquipSlot(equipDef) {
      if (!equipDef) return 'accessory';
      if (['weapon', 'armor', 'accessory'].includes(equipDef.slot)) return equipDef.slot;
      const legacyMap = { ring: 'accessory', boots: 'armor', armor: 'armor', weapon: 'weapon', accessory: 'accessory' };
      return legacyMap[equipDef.category] || 'accessory';
    },

    /**
     * Calcule le total des bonus d'équipement pour un personnage, en résolvant
     * les exemplaires d'inventaire référencés par inst.equipment (IDs d'exemplaire,
     * pas IDs de définition — un exemplaire physique ne peut être équipé qu'une fois).
     * @param {Array<string|null>} equipmentRefs - inst.equipment (3 slots)
     * @param {Array<object>} equipInventory - player.equipInventory
     * @param {Array<object>} equipmentDefs  - état.equipment (définitions)
     * @returns {{hp:number, atk:number, def:number, spd:number}}
     */
    computeEquipBonus(equipmentRefs, equipInventory, equipmentDefs) {
      const bonus = { hp: 0, atk: 0, def: 0, spd: 0 };
      (equipmentRefs || []).forEach(refId => {
        if (!refId) return;
        const invEntry = (equipInventory || []).find(ei => ei.instanceId === refId);
        const def = invEntry ? (equipmentDefs || []).find(e => e.id === invEntry.equipId) : null;
        if (def?.bonuses) {
          bonus.hp  += def.bonuses.hp  || 0;
          bonus.atk += def.bonuses.atk || 0;
          bonus.def += def.bonuses.def || 0;
          bonus.spd += def.bonuses.spd || 0;
        }
      });
      return bonus;
    },

    /**
     * Retourne le multiplicateur de type attaquant → défenseur
     * @param {string} attackType - ID type attaquant
     * @param {string} defType1   - ID type défenseur principal
     * @param {string|null} defType2 - ID type défenseur secondaire
     * @param {object} matrix - Matrice de types actuelle
     * @returns {number} Multiplicateur final
     */
    getTypeEffectiveness(attackType, defType1, defType2, matrix) {
      const m = matrix || DEFAULT_TYPE_MATRIX;
      let mult = (m[attackType]?.[defType1]) ?? 1.0;
      if (defType2 && defType2 !== defType1) {
        mult *= (m[attackType]?.[defType2]) ?? 1.0;
      }
      return mult;
    },

    /**
     * Calcule l'XP requise pour atteindre un niveau donné
     * @param {number} level - Niveau cible
     * @param {object} config - Config de niveau
     * @returns {number} XP requise
     */
    xpForLevel(level, config) {
      const c = config || DEFAULT_CONFIG.level;
      return Math.floor(c.xpBase * Math.pow(level, c.xpExponent));
    },

    // ─── HELPERS RECADRAGE PORTRAITS ──────────────────────────────────────────

    /** Crop par défaut pour la vignette collection (petit carré) */
    defaultPortraitCrop() { return { x: 50, y: 20, zoom: 1 }; },

    /** Crop par défaut pour la fiche personnage (grand rectangle) */
    defaultDetailCrop() { return { x: 50, y: 10, zoom: 1 }; },

    /**
     * Crop par défaut pour le badge combat (cercle).
     * Contrainte impérative : cy >= r pour que le cercle ne sorte pas par le haut.
     */
    defaultCombatCrop() { return { cx: 50, cy: 38, r: 38 }; },

    /** Convertit un crop portrait/detail en valeur CSS object-position */
    cropToObjectPosition(crop) {
      const x = crop?.x ?? 50;
      const y = crop?.y ?? 20;
      return `${x}% ${y}%`;
    },

    /** Convertit un crop combat en valeur CSS object-position */
    combatCropToObjectPosition(crop) {
      const cx = crop?.cx ?? 50;
      const cy = crop?.cy ?? 38;
      return `${cx}% ${cy}%`;
    },

    /**
     * Calcule les stats d'un personnage à un niveau donné
     * @param {object} char - Données du personnage (baseStats)
     * @param {number} level
     * @param {number} awakeningLevel
     * @param {object} awakeningConfig
     * @param {string} rarity
     * @returns {object} Stats calculées
     */
    computeStats(char, level, awakeningLevel, awakeningConfig, rarity, levelConfig) {
      const lc = levelConfig || DEFAULT_CONFIG.level;
      const ac = awakeningConfig || DEFAULT_CONFIG.awakening;
      const awk = ac.bonusPerLevel[rarity] || { hp:0, atk:0, def:0, spd:0 };

      // Croissance par niveau
      const grow = (base, stat) => Math.floor(base * (1 + lc.statGrowthPerLevel[stat] * (level - 1)));
      // Bonus awakening (% par niveau d'awakening)
      const awBonus = (val, stat) => Math.floor(val * (1 + (awk[stat] / 100) * awakeningLevel));

      const grown = {
        hp:  grow(char.baseStats.hp,  'hp'),
        atk: grow(char.baseStats.atk, 'atk'),
        def: grow(char.baseStats.def, 'def'),
        spd: grow(char.baseStats.spd, 'spd'),
      };

      return {
        hp:  Math.min(99999, awBonus(grown.hp,  'hp')),
        atk: Math.min(9999,  awBonus(grown.atk, 'atk')),
        def: Math.min(9999,  awBonus(grown.def, 'def')),
        spd: Math.min(9999,  awBonus(grown.spd, 'spd')),
      };
    },
  };
})();

// Word packs, sorted by how hard each word is to SCULPT IN 3D and RECOGNIZE while spinning.
//
//   1 EASY   – one iconic shape, 1–3 strokes, a single obvious word.
//   2 MEDIUM – a few parts that must sit right in space, or an easy shape with a less obvious word.
//   3 HARD   – many parts or tricky proportions, multi-word answers, or things that look like something else.
//
// Add your own pack by copying one of the blocks below. `aliases` are other answers that also count.

const PACKS = {
  classic: {
    name: 'Classic',
    emoji: '🎨',
    words: {
      1: ['heart', 'star', 'sun', 'moon', 'house', 'tree', 'snake', 'ladder', 'apple', 'ball',
        'donut', 'ring', 'cup', 'fish', 'flower', 'hat', 'egg', 'banana', 'cloud', 'rainbow',
        'mountain', 'umbrella', 'candle', 'kite', 'bone', 'door', 'table', 'pyramid', 'tent', 'cactus',
        'mushroom', 'snowman', 'balloon', 'pencil', 'sword', 'arrow', 'cube', 'lollipop', 'spiral', 'smile',
        'leaf', 'feather', 'envelope', 'dice', 'tooth', 'eye', 'hand', 'bubble', 'cone', 'triangle',
        'lightning bolt', 'music note', 'question mark', 'paper plane', 'raindrop', 'shoe', 'sock', 'book', 'box', 'bottle',
        'bowl', 'wheel', 'button', 'nail', 'crayon', 'cherry', 'carrot', 'worm', 'circle', 'zigzag'],
      2: ['key', 'spoon', 'chair', 'car', 'boat', 'bridge', 'igloo', 'anchor', 'glasses', 'bed',
        'tornado', 'trophy', 'crown', 'sailboat', 'rocket', 'lighthouse', 'palm tree', 'volcano', 'teapot', 'bow',
        'guitar', 'spider', 'octopus', 'whale', 'butterfly', 'airplane', 'windmill', 'skateboard', 'saturn', 'snail',
        'ice cream cone', 'hot air balloon', 'hourglass', 'fork', 'bell', 'flag', 'wave', 'bucket', 'lamp', 'clock',
        'truck', 'bus', 'train', 'hammer', 'shovel', 'axe', 'scarf', 'glove', 'mitten', 'sunglasses',
        'campfire', 'flashlight', 'magnifying glass', 'light bulb', 'battery', 'camera', 'phone', 'tv', 'radio', 'backpack',
        'suitcase', 'mailbox', 'stop sign', 'swing', 'slide', 'fence', 'bench', 'tower', 'castle tower', 'drum',
        'trumpet', 'violin', 'microphone', 'headphones', 'compass', 'magnet', 'pillow', 'toothbrush', 'comb', 'necklace'],
      3: ['bicycle', 'giraffe', 'castle', 'dinosaur', 'roller coaster', 'helicopter', 'ferris wheel', 'spiral staircase', 'eiffel tower', 'penguin',
        'elephant', 'scissors', 'telescope', 'treehouse', 'waterfall', 'slinky', 'skyscraper', 'submarine', 'unicorn', 'dragon',
        'traffic light', 'jellyfish', 'swing set', 'piano', 'solar system', 'atom', 'dna', 'satellite', 'basketball hoop', 'motorcycle',
        'pirate ship', 'shark', 'turtle', 'robot', 'tractor', 'fire truck', 'carousel', 'cannon', 'catapult', 'birdcage'],
    },
  },
  spooky: {
    name: 'Spooky',
    emoji: '🎃',
    words: {
      1: ['pumpkin', 'ghost', 'bat', 'moon', 'candy', 'bone', 'eyeball', 'web', 'candle', 'star',
        'cat', 'owl', 'leaf', 'cloud', 'tooth', 'key', 'apple', 'worm', 'feather', 'mask'],
      2: ['witch hat', 'broom', 'cauldron', 'skull', 'spider', 'coffin', 'tombstone', 'lollipop', 'lantern', 'crow',
        'potion bottle', 'cobweb', 'claw', 'fang', 'tree stump', 'gate', 'chain', 'lock', 'cupcake', 'scarf'],
      3: ['haunted house', 'skeleton', 'black cat', 'scarecrow', 'crystal ball', 'candy corn', 'vampire teeth', 'magic wand', 'treasure chest', 'jack o lantern',
        'spooky tree', 'witch', 'graveyard', 'bat wings', 'candy bucket', 'full moon', 'monster', 'castle', 'cape', 'mummy'],
    },
  },
  psu: {
    name: 'Penn State & HackPSU',
    emoji: '🦁',
    words: {
      1: ['football', 'pizza', 'laptop', 'coffee cup', 'trophy', 'mountain', 'bell', 'tree', 'snowflake', 'star',
        'book', 'pencil', 'flag', 'cloud', 'bus', 'sun', 'ice cube', 'apple', 'key', 'cup'],
      2: ['lion', 'ice cream cone', 'cowbell', 'goalpost', 'rubber duck', 'hoodie', 'helmet', 'paw print', 'backpack', 'energy drink',
        'headphones', 'pretzel', 'bicycle', 'scarf', 'mug', 'desk lamp', 'keyboard', 'trash can', 'whistle', 'medal'],
      3: ['stadium', 'clock tower', 'mount nittany', 'marching drum', 'graduation cap', 'sleeping bag', 'megaphone', 'robot', 'rocket', 'diploma',
        'football player', 'cheerleader pom pom', 'library', 'bridge', 'snowman', 'campfire', 'tent', 'fireworks', 'hot dog', 'drone'],
    },
  },
  tech: {
    name: 'Tech & Code',
    emoji: '💻',
    words: {
      1: ['laptop', 'phone', 'light bulb', 'battery', 'cloud', 'bug', 'robot', 'key', 'magnet', 'mouse',
        'screen', 'cable', 'plug', 'gear', 'lock', 'bolt', 'chip', 'disc', 'star', 'arrow'],
      2: ['keyboard', 'headphones', 'usb stick', 'drone', 'game controller', 'microphone', 'camera', 'floppy disk', 'rocket', 'wifi',
        'printer', 'speaker', 'smartwatch', 'tablet', 'flashlight', 'antenna', 'joystick', 'webcam', 'tv', 'calculator'],
      3: ['satellite dish', 'vr headset', '3d printer', 'circuit board', 'server', 'telescope', 'robot arm', 'satellite', 'radio tower', 'space shuttle',
        'computer', 'router', 'hard drive', 'solar panel', 'electric car', 'microscope', 'walkie talkie', 'arcade machine', 'self driving car', 'rover'],
    },
  },
  food: {
    name: 'Food',
    emoji: '🍕',
    words: {
      1: ['banana', 'apple', 'donut', 'egg', 'carrot', 'cherry', 'lollipop', 'cookie', 'pear', 'grapes',
        'lemon', 'orange', 'strawberry', 'cake', 'cheese', 'candy', 'bread', 'pea pod', 'bowl', 'spoon'],
      2: ['pizza', 'burger', 'taco', 'pretzel', 'hot dog', 'cupcake', 'popcorn', 'watermelon', 'ice cream cone', 'mug',
        'muffin', 'pancakes', 'sushi', 'noodles', 'broccoli', 'mushroom', 'pepper', 'avocado', 'fork', 'knife'],
      3: ['spaghetti', 'birthday cake', 'pineapple', 'chopsticks', 'french fries', 'croissant', 'sandwich', 'frying pan', 'corn', 'teacup',
        'milkshake', 'wedding cake', 'ice cream sundae', 'lobster', 'barbecue', 'kebab', 'teapot', 'cutting board', 'blender', 'picnic basket'],
    },
  },
  animals: {
    name: 'Animals',
    emoji: '🦒',
    words: {
      1: ['snake', 'fish', 'worm', 'snail', 'bird', 'turtle', 'spider', 'bee', 'duck', 'mouse',
        'cat', 'dog', 'pig', 'frog', 'ant', 'ladybug', 'bat', 'egg', 'feather', 'bone'],
      2: ['giraffe', 'octopus', 'whale', 'crab', 'butterfly', 'rabbit', 'jellyfish', 'starfish', 'owl', 'swan',
        'shark', 'dolphin', 'horse', 'cow', 'sheep', 'chicken', 'fox', 'bear', 'deer', 'squirrel'],
      3: ['elephant', 'kangaroo', 'penguin', 'flamingo', 'seahorse', 'dragonfly', 'camel', 'lobster', 'peacock', 'crocodile',
        'zebra', 'lion', 'monkey', 'gorilla', 'koala', 'panda', 'tiger', 'hedgehog', 'parrot', 'scorpion'],
    },
  },
};

const ALIASES = {
  carousel: ['merry go round'],
  slinky: ['spring'],
  dna: ['double helix'],
  'ice cream cone': ['ice cream'],
  'hot air balloon': ['air balloon'],
  'basketball hoop': ['hoop', 'basketball net'],
  'palm tree': ['coconut tree'],
  smile: ['smiley', 'smiley face'],
  'swing set': ['swings', 'swing'],
  'drum kit': ['drums', 'drum set'],
  'chess knight': ['knight', 'horse chess piece'],
  'loch ness monster': ['nessie'],
  'jungle gym': ['monkey bars'],
  wifi: ['wi fi', 'wifi symbol'],
  sailboat: ['sail boat'],
  airplane: ['plane', 'aeroplane'],
  cube: ['box'],
  web: ['spider web', 'cobweb'],
  'witch hat': ['witches hat'],
  broom: ['broomstick'],
  lion: ['nittany lion'],
  stadium: ['beaver stadium'],
  'jack o lantern': ['jackolantern', 'carved pumpkin'],
  'vampire teeth': ['fangs', 'vampire'],
  'magic wand': ['wand'],
  'treasure chest': ['chest', 'treasure'],
  'graduation cap': ['grad cap', 'mortarboard'],
  'marching drum': ['drum'],
  snowflake: ['snow'],
  bow: ['ribbon'],
  wave: ['ocean wave'],
  'satellite dish': ['dish'],
  'game controller': ['controller'],
  phone: ['smartphone', 'cell phone'],
  'light bulb': ['lightbulb', 'bulb'],
  'usb stick': ['usb', 'flash drive', 'thumb drive'],
  'game controller': ['controller', 'gamepad'],
  'vr headset': ['vr', 'vr goggles'],
  'hot dog': ['hotdog'],
  'french fries': ['fries'],
  mug: ['coffee mug'],
  'lightning bolt': ['lightning', 'bolt'],
  'music note': ['note', 'musical note'],
  'paper plane': ['paper airplane'],
  raindrop: ['drop', 'water drop', 'teardrop'],
  tv: ['television'],
  'castle tower': ['tower'],
  'potion bottle': ['potion'],
  'pea pod': ['peas'],
  'cheerleader pom pom': ['pom pom', 'pompom'],
  'ice cream sundae': ['sundae'],
  'walkie talkie': ['walkie-talkie', 'radio'],
  'arcade machine': ['arcade'],
  'robot arm': ['robotic arm'],
  'radio tower': ['antenna tower', 'tower'],
  teacup: ['tea cup'],
};

const MAX_CUSTOM = 200;

/** Guess a difficulty for a custom word: short single words are easy, long or multi-word ones are hard. */
function guessDifficulty(word) {
  const parts = word.split(' ').length;
  if (parts >= 3 || word.length > 13) return 3;
  if (parts === 1 && word.length <= 6) return 1;
  return 2;
}

function cleanCustom(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : String(list || '').split(/[\n,]/)) {
    const w = String(raw).toLowerCase().replace(/[^a-z0-9 '-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (w.length >= 2 && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
}

/** Build a {1:[],2:[],3:[]} pool from the selected packs plus custom words. */
function buildPool(packIds = ['classic'], custom = []) {
  const pool = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (const id of packIds) {
    const pack = PACKS[id];
    if (!pack) continue;
    for (const d of [1, 2, 3]) pack.words[d].forEach((w) => pool[d].add(w));
  }
  for (const w of custom) pool[guessDifficulty(w)].add(w);
  const total = pool[1].size + pool[2].size + pool[3].size;
  if (total === 0) return buildPool(['classic'], []);
  return { 1: [...pool[1]], 2: [...pool[2]], 3: [...pool[3]] };
}

/**
 * Offer one word per difficulty. Prefers words that haven't been drawn or even offered yet in this room,
 * so games don't repeat; only when everything's been seen does it fall back to older words.
 */
function pickChoices(used, pool = buildPool(), offered = new Set()) {
  const all = [1, 2, 3].flatMap((d) => pool[d].map((word) => ({ word, difficulty: d })));
  const out = [];
  const taken = (w) => out.some((o) => o.word === w);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  for (const d of [1, 2, 3]) {
    const mine = pool[d].map((word) => ({ word, difficulty: d })).filter((c) => !taken(c.word));
    const tiers = [
      mine.filter((c) => !used.has(c.word) && !offered.has(c.word)),
      mine.filter((c) => !used.has(c.word)),
      all.filter((c) => !taken(c.word) && !used.has(c.word)), // small packs: borrow from other difficulties
      mine,
      all.filter((c) => !taken(c.word)),
    ];
    const cands = tiers.find((t) => t.length);
    if (cands) out.push(pick(cands));
  }
  return out.sort((a, b) => a.difficulty - b.difficulty);
}

function aliasesFor(word) {
  return ALIASES[word] || [];
}

function packList() {
  return Object.entries(PACKS).map(([id, p]) => ({
    id,
    name: p.name,
    emoji: p.emoji,
    count: p.words[1].length + p.words[2].length + p.words[3].length,
    sample: [p.words[1][0], p.words[2][0], p.words[3][0]],
  }));
}

module.exports = { PACKS, buildPool, pickChoices, aliasesFor, cleanCustom, packList, guessDifficulty };

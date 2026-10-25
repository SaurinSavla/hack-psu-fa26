// Word packs, sorted by how hard each word is to SCULPT IN 3D and RECOGNIZE while spinning.
//
//   1 EASY   – one iconic shape, 1–3 strokes, a single obvious word.
//   2 MEDIUM – a few parts that must sit right in space, or an easy shape with a less obvious word.
//   3 HARD   – many parts or tricky proportions, multi-word answers, or things that look like something else.
//
// Add your own pack by copying one of the blocks below. `aliases` are other answers that also count.
// Run `npm run check-words` after editing to catch duplicates and typos.

const fs = require('fs');
const path = require('path');

// Every word here is SCULPTABLE: it can be built from a few basic shapes (ball, box, cylinder, cone, ring,
// board) plus some brush strokes, and it's recognisable as a 3D object from most angles.
const PACKS = {
  // The demo pack: every word is ONE or TWO of the basic shapes plus a stroke or two, and instantly guessable.
  demo: {
    name: 'Demo: super easy',
    emoji: '⭐',
    words: {
      1: ['snowman', 'ice cream cone', 'donut', 'apple', 'mushroom', 'lollipop', 'balloon', 'sun', 'egg', 'cherry',
        'ball', 'cake', 'candle', 'tree', 'cup', 'hat', 'carrot', 'igloo', 'pyramid', 'tent', 'dice', 'pencil'],
      2: ['house', 'table', 'rocket', 'saturn', 'burger', 'lamp', 'traffic cone', 'cupcake', 'bottle', 'bowl',
        'flower', 'cactus', 'drum', 'bucket', 'mug', 'bell'],
      3: ['robot', 'car', 'boat', 'chair', 'ladder', 'lighthouse', 'ufo', 'trophy', 'teapot', 'crown',
        'snail', 'penguin', 'castle', 'train'],
    },
  },
  classic: {
    name: 'Classic',
    emoji: '🎨',
    words: {
      1: ['snowman', 'ice cream cone', 'mushroom', 'apple', 'donut', 'cup', 'tree', 'house', 'table', 'ladder',
        'lollipop', 'balloon', 'candle', 'cake', 'pyramid', 'igloo', 'tent', 'hat', 'sun', 'ball',
        'egg', 'cherry', 'carrot', 'banana', 'pencil', 'bottle', 'bowl', 'box', 'dice', 'ring',
        'bucket', 'drum', 'cone', 'barrel', 'lamp', 'chair', 'bed', 'door', 'sword', 'arrow',
        'hammer', 'flower', 'cactus', 'rocket', 'planet', 'heart', 'star', 'cloud', 'tower', 'wheel',
        'mug', 'pot', 'jar', 'coin', 'tire', 'magnet', 'key', 'bell', 'flag', 'spoon'],
      2: ['car', 'boat', 'train', 'truck', 'bus', 'airplane', 'robot', 'castle', 'lighthouse', 'windmill',
        'teapot', 'trophy', 'crown', 'saturn', 'hot air balloon', 'palm tree', 'volcano', 'tractor', 'bridge', 'bench',
        'guitar', 'umbrella', 'telescope', 'microphone', 'headphones', 'glasses', 'snail', 'turtle', 'duck', 'fish',
        'spider', 'octopus', 'penguin', 'pig', 'bee', 'ufo', 'campfire', 'treasure chest', 'cupcake', 'burger'],
      3: ['giraffe', 'elephant', 'dinosaur', 'helicopter', 'bicycle', 'motorcycle', 'pirate ship', 'roller coaster', 'ferris wheel', 'carousel',
        'eiffel tower', 'submarine', 'tank', 'space station', 'satellite', 'dragon', 'unicorn', 'snowglobe', 'gumball machine', 'traffic light',
        'swing set', 'treehouse', 'fire truck', 'excavator', 'piano'],
    },
  },
  spooky: {
    name: 'Spooky',
    emoji: '🎃',
    words: {
      1: ['pumpkin', 'ghost', 'candle', 'bone', 'eyeball', 'skull', 'moon', 'candy', 'lollipop', 'hat'],
      2: ['witch hat', 'cauldron', 'coffin', 'tombstone', 'broom', 'lantern', 'spider', 'bat', 'owl', 'potion bottle'],
      3: ['haunted house', 'skeleton', 'black cat', 'scarecrow', 'crystal ball', 'jack o lantern', 'mummy', 'vampire', 'witch', 'graveyard'],
    },
  },
  psu: {
    name: 'Penn State & HackPSU',
    emoji: '🦁',
    words: {
      1: ['football', 'ice cream cone', 'coffee cup', 'pizza', 'laptop', 'trophy', 'mountain', 'bell', 'snowman', 'cup'],
      2: ['lion', 'cowbell', 'goalpost', 'rubber duck', 'helmet', 'backpack', 'energy drink', 'trash can', 'desk lamp', 'medal'],
      3: ['stadium', 'clock tower', 'graduation cap', 'marching drum', 'megaphone', 'robot', 'drone', 'bus', 'bicycle', 'tent'],
    },
  },
  tech: {
    name: 'Tech & Code',
    emoji: '💻',
    words: {
      1: ['laptop', 'phone', 'light bulb', 'battery', 'robot', 'magnet', 'cable', 'chip', 'disc', 'screen'],
      2: ['keyboard', 'headphones', 'game controller', 'microphone', 'camera', 'drone', 'speaker', 'webcam', 'tv', 'rocket'],
      3: ['satellite', 'satellite dish', 'vr headset', 'robot arm', 'computer', 'server', 'telescope', 'space station', 'radio tower', 'printer'],
    },
  },
  food: {
    name: 'Food',
    emoji: '🍕',
    words: {
      1: ['apple', 'banana', 'donut', 'egg', 'carrot', 'cherry', 'lollipop', 'cookie', 'pear', 'orange',
        'cake', 'cheese', 'bread', 'grapes', 'lemon'],
      2: ['pizza', 'burger', 'hot dog', 'cupcake', 'ice cream cone', 'watermelon', 'mushroom', 'pineapple', 'muffin', 'sushi'],
      3: ['birthday cake', 'milkshake', 'popcorn', 'french fries', 'sandwich', 'spaghetti', 'taco', 'teapot', 'wedding cake', 'ice cream sundae'],
    },
  },
  animals: {
    name: 'Animals',
    emoji: '🦒',
    words: {
      1: ['snake', 'fish', 'snail', 'worm', 'ladybug', 'bee', 'duck', 'egg', 'turtle', 'caterpillar'],
      2: ['penguin', 'octopus', 'spider', 'pig', 'frog', 'mouse', 'owl', 'jellyfish', 'starfish', 'whale'],
      3: ['giraffe', 'elephant', 'dinosaur', 'crab', 'rabbit', 'cat', 'dog', 'horse', 'flamingo', 'kangaroo'],
    },
  },
  sports: {
    name: 'Sports & Games',
    emoji: '⚽',
    words: {
      1: ['ball', 'football', 'dice', 'trophy', 'medal', 'bat', 'flag', 'cone', 'whistle', 'dumbbell'],
      2: ['basketball hoop', 'goalpost', 'bowling pin', 'tennis racket', 'skateboard', 'helmet', 'chess pawn', 'dartboard', 'golf club', 'hockey stick'],
      3: ['soccer goal', 'skis', 'surfboard', 'boxing glove', 'race car', 'bicycle', 'chess knight', 'trampoline', 'kayak', 'archery target'],
    },
  },
  home: {
    name: 'Around the House',
    emoji: '🏠',
    words: {
      1: ['cup', 'table', 'chair', 'bed', 'lamp', 'door', 'box', 'bowl', 'plate', 'pillow',
        'candle', 'bucket', 'vase', 'clock', 'mug'],
      2: ['sofa', 'teapot', 'toaster', 'kettle', 'fan', 'bathtub', 'toilet', 'mirror', 'shelf', 'window'],
      3: ['washing machine', 'fridge', 'stove', 'piano', 'bunk bed', 'fireplace', 'staircase', 'sink', 'desk', 'lawn mower'],
    },
  },
  nature: {
    name: 'Nature & Space',
    emoji: '🌍',
    words: {
      1: ['sun', 'moon', 'tree', 'flower', 'cloud', 'mountain', 'rock', 'planet', 'star', 'mushroom'],
      2: ['saturn', 'volcano', 'rainbow', 'cactus', 'palm tree', 'island', 'tornado', 'rocket', 'comet', 'snowflake'],
      3: ['solar system', 'waterfall', 'iceberg', 'ufo', 'astronaut', 'space station', 'satellite', 'lighthouse', 'pine tree', 'campfire'],
    },
  },
  fantasy: {
    name: 'Fantasy & Fairy Tales',
    emoji: '🧚',
    words: {
      1: ['crown', 'sword', 'wand', 'crystal', 'gem', 'shield', 'castle', 'tower', 'potion', 'star'],
      2: ['treasure chest', 'magic lamp', 'wizard hat', 'mushroom house', 'pumpkin carriage', 'genie lamp', 'crystal ball', 'throne', 'cauldron', 'snowman'],
      3: ['dragon', 'unicorn', 'mermaid', 'pirate ship', 'knight', 'fairy', 'giant', 'gingerbread house', 'wizard', 'troll'],
    },
  },
};

const ALIASES = {
  // demo
  snowman: ['snow man'],
  donut: ['doughnut'],
  lollipop: ['lolly', 'candy', 'sucker'],
  ball: ['sphere', 'orb', 'football', 'basketball'],
  cake: ['birthday cake'],
  cup: ['glass'],
  hat: ['top hat'],
  dice: ['die'],
  rocket: ['rocket ship', 'spaceship'],
  saturn: ['planet'],
  burger: ['hamburger', 'cheeseburger'],
  mushroom: ['toadstool'],
  teapot: ['kettle', 'tea pot'],
  trophy: ['cup trophy', 'award'],
  // classic
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
  'jungle gym': ['monkey bars', 'climbing frame'],
  sailboat: ['sail boat'],
  airplane: ['plane', 'aeroplane'],
  jet: ['jet plane', 'fighter jet', 'plane'],
  cube: ['box'],
  bow: ['ribbon'],
  wave: ['ocean wave'],
  phone: ['smartphone', 'cell phone'],
  'light bulb': ['lightbulb', 'bulb'],
  'lightning bolt': ['lightning', 'bolt'],
  'music note': ['note', 'musical note'],
  'paper plane': ['paper airplane'],
  raindrop: ['drop', 'water drop', 'teardrop'],
  tv: ['television'],
  'castle tower': ['tower'],
  'yo yo': ['yoyo'],
  'bow tie': ['bowtie'],
  necktie: ['tie'],
  'pine cone': ['pinecone'],
  seashell: ['shell', 'sea shell'],
  clover: ['shamrock', 'four leaf clover'],
  ufo: ['flying saucer', 'spaceship'],
  checkmark: ['tick', 'check mark', 'check'],
  'dollar sign': ['dollar', 'money'],
  'exclamation mark': ['exclamation point'],
  hashtag: ['hash', 'pound sign'],
  'traffic cone': ['cone'],
  'picture frame': ['frame', 'photo frame'],
  stairs: ['staircase', 'steps'],
  popsicle: ['ice pop', 'ice lolly'],
  crescent: ['crescent moon'],
  diamond: ['gem'],
  hanger: ['coat hanger', 'clothes hanger'],
  paintbrush: ['brush', 'paint brush'],
  'watering can': ['watering pot'],
  'shopping cart': ['trolley', 'shopping trolley'],
  sofa: ['couch'],
  bookshelf: ['bookcase', 'shelf'],
  padlock: ['lock'],
  doghouse: ['kennel', 'dog house'],
  nest: ['bird nest', 'birds nest'],
  beehive: ['hive', 'bee hive'],
  quill: ['feather pen', 'quill pen'],
  globe: ['world', 'earth'],
  wristwatch: ['watch'],
  'alarm clock': ['clock'],
  gift: ['present', 'gift box'],
  'disco ball': ['mirror ball'],
  'wishing well': ['well'],
  binoculars: ['field glasses'],
  'ice skate': ['skate', 'ice skates'],
  'roller skate': ['skate', 'roller skates', 'rollerblade'],
  'flip flops': ['flip flop', 'sandals', 'sandal'],
  snorkel: ['snorkel mask'],
  canteen: ['water bottle', 'flask'],
  'statue of liberty': ['lady liberty', 'liberty statue'],
  'leaning tower of pisa': ['tower of pisa', 'leaning tower', 'pisa'],
  'golden gate bridge': ['golden gate'],
  'big ben': ['clock tower', 'elizabeth tower'],
  'space station': ['iss'],
  'lunar lander': ['moon lander', 'lander'],
  'scuba diver': ['diver', 'scuba'],
  'christmas tree': ['xmas tree'],
  'grandfather clock': ['pendulum clock'],
  'construction crane': ['crane', 'tower crane'],
  excavator: ['digger', 'backhoe'],
  'cement mixer': ['concrete mixer'],
  'steam train': ['steam engine', 'locomotive'],
  'cable car': ['gondola', 'tram'],
  'viking ship': ['longship'],
  'mouse trap': ['mousetrap'],
  'rubiks cube': ['rubik cube', 'puzzle cube'],
  'jigsaw puzzle': ['jigsaw', 'puzzle', 'puzzle piece'],
  'chess board': ['chessboard', 'chess'],
  'claw machine': ['claw game', 'crane game'],
  typewriter: ['type writer'],
  gramophone: ['record player', 'phonograph'],
  'spinning top': ['top'],
  'rocking horse': ['hobby horse'],
  'teddy bear': ['teddy'],
  'swimming pool': ['pool'],
  'bonsai tree': ['bonsai'],
  // spooky
  web: ['spider web', 'cobweb'],
  'spider web': ['web', 'cobweb'],
  'witch hat': ['witches hat'],
  broom: ['broomstick'],
  'jack o lantern': ['jackolantern', 'carved pumpkin'],
  'vampire teeth': ['fangs', 'vampire'],
  'magic wand': ['wand'],
  'treasure chest': ['chest', 'treasure'],
  'potion bottle': ['potion'],
  'storm cloud': ['rain cloud', 'thundercloud'],
  'crescent moon': ['moon', 'crescent'],
  'candy bag': ['trick or treat bag', 'treat bag'],
  'spell book': ['spellbook', 'magic book'],
  candelabra: ['candle holder', 'candlestick'],
  'wizard hat': ['witch hat'],
  toadstool: ['mushroom'],
  'trap door': ['trapdoor'],
  'tarot card': ['tarot'],
  crossbones: ['skull and crossbones'],
  'pirate flag': ['jolly roger'],
  frankenstein: ['frankenstein monster', 'frankensteins monster'],
  'grim reaper': ['reaper', 'death'],
  'bubbling cauldron': ['cauldron'],
  'ouija board': ['spirit board', 'ouija'],
  'headless horseman': ['horseman'],
  'swamp monster': ['swamp thing'],
  yeti: ['bigfoot', 'abominable snowman'],
  'bat swarm': ['bats'],
  // psu
  lion: ['nittany lion'],
  stadium: ['beaver stadium'],
  'graduation cap': ['grad cap', 'mortarboard'],
  'marching drum': ['drum'],
  snowflake: ['snow'],
  'cheerleader pom pom': ['pom pom', 'pompom'],
  'lion shrine': ['nittany lion shrine', 'lion statue'],
  'old main': ['old main building'],
  'dance marathon': ['thon'],
  'foam finger': ['number one finger'],
  'cornhole board': ['cornhole', 'bean bag toss'],
  beanbag: ['bean bag', 'beanbag chair'],
  'sticky note': ['post it', 'post it note'],
  'soda can': ['can', 'pop can'],
  'name badge': ['badge', 'name tag'],
  'swag bag': ['tote bag', 'goodie bag'],
  'coffee machine': ['coffee maker'],
  // tech
  'satellite dish': ['dish'],
  'game controller': ['controller', 'gamepad'],
  'usb stick': ['usb', 'flash drive', 'thumb drive'],
  'vr headset': ['vr', 'vr goggles'],
  'walkie talkie': ['walkie-talkie', 'radio'],
  'arcade machine': ['arcade'],
  'robot arm': ['robotic arm'],
  'radio tower': ['antenna tower', 'tower'],
  wifi: ['wi fi', 'wifi symbol'],
  'remote control': ['remote', 'tv remote'],
  earbuds: ['airpods', 'earphones'],
  'curly braces': ['braces', 'brackets'],
  'thumbs up': ['like', 'thumb'],
  'qr code': ['qr'],
  'graphics card': ['gpu', 'video card'],
  'cpu fan': ['fan'],
  'ethernet cable': ['ethernet', 'network cable'],
  'power bank': ['portable charger'],
  'robot vacuum': ['roomba'],
  'smart speaker': ['alexa', 'echo'],
  'electric scooter': ['e scooter', 'scooter'],
  'wind turbine': ['windmill'],
  // food
  'hot dog': ['hotdog'],
  'french fries': ['fries'],
  mug: ['coffee mug'],
  'pea pod': ['peas'],
  'ice cream sundae': ['sundae'],
  teacup: ['tea cup'],
  'gummy bear': ['gummy', 'gummies'],
  'chili pepper': ['chili', 'chilli', 'hot pepper'],
  'cotton candy': ['candy floss'],
  'bubble tea': ['boba', 'boba tea'],
  'juice box': ['juice'],
  'ketchup bottle': ['ketchup'],
  'salt shaker': ['salt'],
  'honey jar': ['honey', 'honeypot'],
  'roast turkey': ['turkey'],
  'espresso machine': ['coffee machine'],
  'gumball machine': ['gumball'],
  'candy apple': ['toffee apple', 'caramel apple'],
  drumstick: ['chicken leg'],
  // animals
  rhinoceros: ['rhino'],
  hippopotamus: ['hippo'],
  'praying mantis': ['mantis'],
  'bald eagle': ['eagle'],
  pufferfish: ['puffer fish', 'blowfish'],
  stingray: ['ray', 'manta ray'],
  firefly: ['lightning bug'],
  ladybug: ['ladybird'],
  // sports
  'soccer ball': ['football'],
  'tennis racket': ['racket', 'racquet', 'tennis racquet'],
  'ping pong paddle': ['ping pong bat', 'table tennis paddle', 'paddle'],
  'boxing glove': ['boxing gloves'],
  dumbbell: ['weights', 'dumbell'],
  'playing card': ['card', 'cards'],
  'chess pawn': ['pawn'],
  'chess king': ['king'],
  'tic tac toe': ['noughts and crosses'],
  'bow and arrow': ['bow', 'archery'],
  shuttlecock: ['birdie', 'shuttle'],
  'pool cue': ['cue', 'pool stick'],
  'fishing rod': ['fishing pole'],
  'relay baton': ['baton'],
  'archery target': ['target', 'bullseye'],
  'olympic rings': ['olympics'],
  'pool table': ['billiards table', 'snooker table'],
  'ping pong table': ['table tennis table'],
  'foosball table': ['foosball', 'table football'],
  'air hockey table': ['air hockey'],
  'figure skater': ['ice skater', 'skater'],
  'rowing boat': ['rowboat'],
  'sumo wrestler': ['sumo'],
  // home
  fridge: ['refrigerator'],
  'vacuum cleaner': ['vacuum', 'hoover'],
  'toilet paper': ['toilet roll', 'tp'],
  faucet: ['tap'],
  wardrobe: ['closet'],
  dresser: ['chest of drawers'],
  nightstand: ['bedside table'],
  houseplant: ['plant', 'potted plant'],
  'fish tank': ['aquarium'],
  clothespin: ['clothes peg', 'peg'],
  'baby stroller': ['stroller', 'pram'],
  'four poster bed': ['canopy bed'],
  'garden gnome': ['gnome'],
  'grand piano': ['piano'],
  recliner: ['armchair'],
  'hot tub': ['jacuzzi'],
  treadmill: ['running machine'],
  'lawn mower': ['mower'],
  'welcome mat': ['doormat'],
  // nature
  'shooting star': ['falling star', 'meteor'],
  'pine tree': ['christmas tree', 'evergreen', 'fir tree'],
  'venus flytrap': ['flytrap', 'venus fly trap'],
  'black hole': ['wormhole'],
  galaxy: ['spiral galaxy'],
  'northern lights': ['aurora', 'aurora borealis'],
  'big dipper': ['dipper', 'ursa major', 'plough'],
  'planet earth': ['earth', 'globe', 'world'],
  'mars rover': ['rover'],
  'rain forest': ['rainforest', 'jungle'],
  'solar eclipse': ['eclipse'],
  thunderstorm: ['storm', 'thunder'],
  sunset: ['sunrise'],
  'mount everest': ['everest'],
  'niagara falls': ['waterfall'],
  crater: ['moon crater'],
  meteor: ['meteorite', 'asteroid'],
  'hot spring': ['hot springs'],
  'sand dune': ['dune'],
  stalactite: ['stalagmite'],
  // fantasy
  'gold coin': ['coin', 'gold'],
  treasure: ['treasure chest', 'gold'],
  'dragon egg': ['egg'],
  'magic lamp': ['genie lamp', 'lamp', 'oil lamp'],
  'flying carpet': ['magic carpet', 'carpet'],
  'glass slipper': ['slipper', 'shoe'],
  'magic mirror': ['mirror'],
  goblet: ['chalice', 'cup'],
  'battle axe': ['axe'],
  trident: ['pitchfork'],
  'golden egg': ['egg', 'gold egg'],
  'magic beans': ['beans'],
  broomstick: ['broom'],
  'treasure map': ['map'],
  'pirate hat': ['tricorn'],
  'mermaid tail': ['tail', 'fish tail'],
  'knight helmet': ['helmet'],
  'fairy wings': ['wings'],
  'unicorn horn': ['horn'],
  pegasus: ['flying horse', 'winged horse'],
  griffin: ['gryphon'],
  kraken: ['giant squid'],
  'sea serpent': ['sea monster', 'sea snake'],
  'pumpkin carriage': ['carriage', 'coach'],
  'gingerbread man': ['gingerbread'],
  'humpty dumpty': ['humpty'],
  wizard: ['magician', 'sorcerer'],
  genie: ['djinn'],
};

// Drop aliases for words that are no longer in any pack.
{
  const inPacks = new Set(Object.values(PACKS).flatMap((p) => Object.values(p.words).flat()));
  for (const k of Object.keys(ALIASES)) if (!inPacks.has(k)) delete ALIASES[k];
}

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

/**
 * Build a {1:[],2:[],3:[]} pool from the selected packs plus custom words.
 * A word that appears in several packs is only kept once, at its easiest difficulty.
 */
function buildPool(packIds = ['classic'], custom = []) {
  const pool = { 1: [], 2: [], 3: [] };
  const seen = new Set();
  const add = (w, d) => {
    if (seen.has(w)) return;
    seen.add(w);
    pool[d].push(w);
  };
  for (const d of [1, 2, 3]) {
    for (const id of packIds) if (PACKS[id]) PACKS[id].words[d].forEach((w) => add(w, d));
  }
  for (const w of custom) add(w, guessDifficulty(w));
  if (pool[1].length + pool[2].length + pool[3].length === 0) return buildPool(['classic'], []);
  return pool;
}

// ---------------------------------------------------------------------------
// Recently played words, shared by every room and kept across server restarts,
// so opening a new room (or restarting the laptop) doesn't bring back the same few words.
// ---------------------------------------------------------------------------

const RECENT_FILE = process.env.RECENT_WORDS_FILE || path.join(__dirname, '..', '.data', 'recent-words.json');
const RECENT_MAX = 800;
const recent = loadRecent(); // word -> last time it was offered (ms); oldest first
let saveTimer = null;

function loadRecent() {
  try {
    const list = JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8'));
    return new Map(Array.isArray(list) ? list.filter((e) => Array.isArray(e) && typeof e[0] === 'string').map(([w, t]) => [w, Number(t) || 0]) : []);
  } catch {
    return new Map();
  }
}

function rememberWords(words) {
  const now = Date.now();
  for (const w of words) {
    recent.delete(w); // re-insert so the Map stays oldest-first
    recent.set(w, now);
  }
  while (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdir(path.dirname(RECENT_FILE), { recursive: true }, () => {
      fs.writeFile(RECENT_FILE, JSON.stringify([...recent]), () => {});
    });
  }, 1000);
  saveTimer.unref?.();
}

/**
 * Offer one word per difficulty. Prefers words that haven't been drawn or even offered yet in this room,
 * and among those, words nobody has seen lately in any room. Only when everything's been seen does it
 * fall back to older words. The offered words are remembered as recently played.
 */
function pickChoices(used, pool = buildPool(), offered = new Set()) {
  const all = [1, 2, 3].flatMap((d) => pool[d].map((word) => ({ word, difficulty: d })));
  const out = [];
  const taken = (w) => out.some((o) => o.word === w);
  const seenAt = (c) => recent.get(c.word) || 0;
  const pick = (list) => {
    // Never-seen words first; otherwise the least recently seen third.
    const fresh = list.filter((c) => !seenAt(c));
    const cands = fresh.length ? fresh : [...list].sort((a, b) => seenAt(a) - seenAt(b)).slice(0, Math.ceil(list.length / 3));
    return cands[Math.floor(Math.random() * cands.length)];
  };
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
  rememberWords(out.map((c) => c.word));
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

module.exports = { PACKS, ALIASES, buildPool, pickChoices, aliasesFor, cleanCustom, packList, guessDifficulty };

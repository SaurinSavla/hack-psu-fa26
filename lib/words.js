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
        'bowl', 'wheel', 'button', 'nail', 'crayon', 'cherry', 'carrot', 'worm', 'circle', 'zigzag',
        'candy cane', 'horseshoe', 'pear', 'lemon', 'grapes', 'cookie', 'ice cube', 'snowflake', 'paperclip', 'straw',
        'tire', 'hula hoop', 'jump rope', 'yo yo', 'top hat', 'bow tie', 'necktie', 'belt', 'boot', 'acorn',
        'pine cone', 'seashell', 'tulip', 'rose', 'sunflower', 'clover', 'branch', 'log', 'rock', 'island',
        'comet', 'planet', 'ufo', 'coin', 'brick', 'plus sign', 'infinity', 'checkmark', 'dollar sign', 'exclamation mark',
        'hashtag', 'mug', 'plate', 'pan', 'pot', 'jar', 'needle', 'scroll', 'traffic cone', 'mirror',
        'picture frame', 'window', 'stairs', 'arch', 'popsicle', 'cupcake', 'pie', 'cake', 'match', 'torch',
        'plug', 'cable', 'chain', 'rope', 'spring', 'pipe', 'crescent', 'diamond', 'cross', 'hook'],
      2: ['key', 'spoon', 'chair', 'car', 'boat', 'bridge', 'igloo', 'anchor', 'glasses', 'bed',
        'tornado', 'trophy', 'crown', 'sailboat', 'rocket', 'lighthouse', 'palm tree', 'volcano', 'teapot', 'bow',
        'guitar', 'spider', 'octopus', 'whale', 'butterfly', 'airplane', 'windmill', 'skateboard', 'saturn', 'snail',
        'ice cream cone', 'hot air balloon', 'hourglass', 'fork', 'bell', 'flag', 'wave', 'bucket', 'lamp', 'clock',
        'truck', 'bus', 'train', 'hammer', 'shovel', 'axe', 'scarf', 'glove', 'mitten', 'sunglasses',
        'campfire', 'flashlight', 'magnifying glass', 'light bulb', 'battery', 'camera', 'phone', 'tv', 'radio', 'backpack',
        'suitcase', 'mailbox', 'stop sign', 'swing', 'slide', 'fence', 'bench', 'tower', 'castle tower', 'drum',
        'trumpet', 'violin', 'microphone', 'headphones', 'compass', 'magnet', 'pillow', 'toothbrush', 'comb', 'necklace',
        'hanger', 'paintbrush', 'rolling pin', 'whisk', 'ladle', 'spatula', 'kettle', 'toaster', 'watering can', 'wheelbarrow',
        'shopping cart', 'scooter', 'canoe', 'parachute', 'blimp', 'jet', 'rocking chair', 'stool', 'sofa', 'bookshelf',
        'padlock', 'barrel', 'basket', 'birdhouse', 'doghouse', 'nest', 'beehive', 'quill', 'globe', 'tiara',
        'earring', 'bracelet', 'wristwatch', 'alarm clock', 'medal', 'gift', 'party hat', 'pinata', 'disco ball', 'harp',
        'saxophone', 'xylophone', 'tambourine', 'maracas', 'flute', 'easel', 'statue', 'fountain', 'wishing well', 'buoy',
        'binoculars', 'test tube', 'race car', 'tricycle', 'unicycle', 'wagon', 'sled', 'snowboard', 'surfboard', 'ice skate',
        'roller skate', 'hammock', 'seesaw', 'trampoline', 'sandcastle', 'beach ball', 'flip flops', 'snorkel', 'goggles', 'canteen'],
      3: ['bicycle', 'giraffe', 'castle', 'dinosaur', 'roller coaster', 'helicopter', 'ferris wheel', 'spiral staircase', 'eiffel tower', 'penguin',
        'elephant', 'scissors', 'telescope', 'treehouse', 'waterfall', 'slinky', 'skyscraper', 'submarine', 'unicorn', 'dragon',
        'traffic light', 'jellyfish', 'swing set', 'piano', 'solar system', 'atom', 'dna', 'satellite', 'basketball hoop', 'motorcycle',
        'pirate ship', 'shark', 'turtle', 'robot', 'tractor', 'fire truck', 'carousel', 'cannon', 'catapult', 'birdcage',
        'statue of liberty', 'leaning tower of pisa', 'golden gate bridge', 'big ben', 'stonehenge', 'colosseum', 'pagoda', 'space station', 'lunar lander', 'astronaut',
        'scuba diver', 'jungle gym', 'chess knight', 'drum kit', 'loch ness monster', 'christmas tree', 'snow globe', 'music box', 'grandfather clock', 'chandelier',
        'construction crane', 'excavator', 'cement mixer', 'steam train', 'cable car', 'viking ship', 'hamster wheel', 'mouse trap', 'rubiks cube', 'jigsaw puzzle',
        'chess board', 'pinball machine', 'claw machine', 'vending machine', 'washing machine', 'sewing machine', 'typewriter', 'gramophone', 'spinning top', 'jack in the box',
        'rocking horse', 'teddy bear', 'water tower', 'swimming pool', 'bonsai tree'],
    },
  },
  spooky: {
    name: 'Spooky',
    emoji: '🎃',
    words: {
      1: ['pumpkin', 'ghost', 'bat', 'moon', 'candy', 'bone', 'eyeball', 'web', 'candle', 'star',
        'cat', 'owl', 'leaf', 'cloud', 'tooth', 'key', 'apple', 'worm', 'feather', 'mask',
        'rat', 'toad', 'snake', 'slime', 'axe', 'pitchfork', 'storm cloud', 'lightning bolt', 'tentacle', 'crescent moon',
        'raven', 'candy bag', 'eye patch', 'hook', 'dagger', 'scroll', 'grave', 'rose', 'ring', 'mirror'],
      2: ['witch hat', 'broom', 'cauldron', 'skull', 'spider', 'coffin', 'tombstone', 'lollipop', 'lantern', 'crow',
        'potion bottle', 'cobweb', 'claw', 'fang', 'tree stump', 'gate', 'chain', 'lock', 'cupcake', 'scarf',
        'spell book', 'hourglass', 'candelabra', 'wizard hat', 'scythe', 'hockey mask', 'toadstool', 'trap door', 'zombie hand', 'tarot card',
        'sword', 'shield', 'cloak', 'crypt', 'shovel', 'pumpkin pie', 'crossbones', 'pirate flag', 'rocking chair', 'wolf'],
      3: ['haunted house', 'skeleton', 'black cat', 'scarecrow', 'crystal ball', 'candy corn', 'vampire teeth', 'magic wand', 'treasure chest', 'jack o lantern',
        'spooky tree', 'witch', 'graveyard', 'bat wings', 'candy bucket', 'full moon', 'monster', 'castle', 'cape', 'mummy',
        'werewolf', 'vampire', 'zombie', 'frankenstein', 'gargoyle', 'ghost ship', 'headless horseman', 'bubbling cauldron', 'ouija board', 'pumpkin patch',
        'creepy doll', 'grim reaper', 'spider web', 'ghost train', 'cemetery gate', 'haunted mirror', 'swamp monster', 'alien', 'yeti', 'bat swarm'],
    },
  },
  psu: {
    name: 'Penn State & HackPSU',
    emoji: '🦁',
    words: {
      1: ['football', 'pizza', 'laptop', 'coffee cup', 'trophy', 'mountain', 'bell', 'tree', 'snowflake', 'star',
        'book', 'pencil', 'flag', 'cloud', 'bus', 'sun', 'ice cube', 'apple', 'key', 'cup',
        'pennant', 'notebook', 'eraser', 'pen', 'sticky note', 'lanyard', 'bagel', 'soda can', 'water bottle', 'sticker',
        'ticket', 'leaf', 'acorn', 'clock', 'umbrella'],
      2: ['lion', 'ice cream cone', 'cowbell', 'goalpost', 'rubber duck', 'hoodie', 'helmet', 'paw print', 'backpack', 'energy drink',
        'headphones', 'pretzel', 'bicycle', 'scarf', 'mug', 'desk lamp', 'keyboard', 'trash can', 'whistle', 'medal',
        'bunk bed', 'desk', 'whiteboard', 'projector', 'pizza box', 'coffee machine', 'beanbag', 'foam finger', 'grill', 'cornhole board',
        'frisbee', 'bleachers', 'swag bag', 'name badge', 'scoreboard'],
      3: ['stadium', 'clock tower', 'mount nittany', 'marching drum', 'graduation cap', 'sleeping bag', 'megaphone', 'robot', 'rocket', 'diploma',
        'football player', 'cheerleader pom pom', 'library', 'bridge', 'snowman', 'campfire', 'tent', 'fireworks', 'hot dog', 'drone',
        'lion shrine', 'old main', 'marching band', 'touchdown', 'field goal', 'mascot', 'referee', 'quarterback', 'dance marathon', 'snowball fight',
        'tailgate', 'dorm room', 'lecture hall', 'pizza party', 'bell tower'],
    },
  },
  tech: {
    name: 'Tech & Code',
    emoji: '💻',
    words: {
      1: ['laptop', 'phone', 'light bulb', 'battery', 'cloud', 'bug', 'robot', 'key', 'magnet', 'mouse',
        'screen', 'cable', 'plug', 'gear', 'lock', 'bolt', 'chip', 'disc', 'star', 'arrow',
        'sd card', 'remote control', 'power button', 'earbuds', 'charger', 'curly braces', 'thumbs up', 'cursor', 'folder', 'trash can',
        'play button', 'pause button', 'download arrow', 'qr code', 'pixel'],
      2: ['keyboard', 'headphones', 'usb stick', 'drone', 'game controller', 'microphone', 'camera', 'floppy disk', 'rocket', 'wifi',
        'printer', 'speaker', 'smartwatch', 'tablet', 'flashlight', 'antenna', 'joystick', 'webcam', 'tv', 'calculator',
        'smart speaker', 'robot vacuum', 'selfie stick', 'tripod', 'ring light', 'monitor', 'graphics card', 'cpu fan', 'ethernet cable', 'barcode scanner',
        'gaming chair', 'keycap', 'stylus', 'power bank', 'satellite'],
      3: ['satellite dish', 'vr headset', '3d printer', 'circuit board', 'server', 'telescope', 'robot arm', 'radio tower', 'space shuttle', 'computer',
        'router', 'hard drive', 'solar panel', 'electric car', 'microscope', 'walkie talkie', 'arcade machine', 'self driving car', 'rover', 'robot dog',
        'humanoid robot', 'hologram', 'neural network', 'wind turbine', 'electric scooter', 'charging station', 'motherboard', 'radio telescope', 'jetpack', 'hoverboard',
        'exoskeleton', 'smart fridge', 'data center', 'quantum computer'],
    },
  },
  food: {
    name: 'Food',
    emoji: '🍕',
    words: {
      1: ['banana', 'apple', 'donut', 'egg', 'carrot', 'cherry', 'lollipop', 'cookie', 'pear', 'grapes',
        'lemon', 'orange', 'strawberry', 'cake', 'cheese', 'candy', 'bread', 'pea pod', 'bowl', 'spoon',
        'peanut', 'olive', 'tomato', 'potato', 'onion', 'pickle', 'peach', 'coconut', 'blueberry', 'waffle',
        'gummy bear', 'marshmallow', 'bacon', 'sausage', 'baguette'],
      2: ['pizza', 'burger', 'taco', 'pretzel', 'hot dog', 'cupcake', 'popcorn', 'watermelon', 'ice cream cone', 'mug',
        'muffin', 'pancakes', 'sushi', 'noodles', 'broccoli', 'mushroom', 'pepper', 'avocado', 'fork', 'knife',
        'drumstick', 'chili pepper', 'honey jar', 'salt shaker', 'ketchup bottle', 'juice box', 'lunch box', 'fried egg', 'toast', 'cotton candy',
        'candy apple', 'cinnamon roll', 'bubble tea', 'dumpling', 'burrito'],
      3: ['spaghetti', 'birthday cake', 'pineapple', 'chopsticks', 'french fries', 'croissant', 'sandwich', 'frying pan', 'corn', 'teacup',
        'milkshake', 'wedding cake', 'ice cream sundae', 'lobster', 'barbecue', 'kebab', 'teapot', 'cutting board', 'blender', 'picnic basket',
        'gingerbread house', 'chocolate fountain', 'club sandwich', 'pizza oven', 'food truck', 'lemonade stand', 'gumball machine', 'popcorn machine', 'espresso machine', 'bento box',
        'fondue pot', 'banana split', 'corn dog', 'roast turkey', 'cheese grater'],
    },
  },
  animals: {
    name: 'Animals',
    emoji: '🦒',
    words: {
      1: ['snake', 'fish', 'worm', 'snail', 'bird', 'turtle', 'spider', 'bee', 'duck', 'mouse',
        'cat', 'dog', 'pig', 'frog', 'ant', 'ladybug', 'bat', 'egg', 'feather', 'bone',
        'caterpillar', 'slug', 'goldfish', 'tadpole', 'eel', 'clam', 'beetle', 'centipede', 'chick', 'hamster',
        'goose', 'pigeon', 'seal', 'firefly', 'shrimp'],
      2: ['giraffe', 'octopus', 'whale', 'crab', 'butterfly', 'rabbit', 'jellyfish', 'starfish', 'owl', 'swan',
        'shark', 'dolphin', 'horse', 'cow', 'sheep', 'chicken', 'fox', 'bear', 'deer', 'squirrel',
        'raccoon', 'otter', 'beaver', 'moose', 'llama', 'goat', 'turkey', 'stingray', 'pufferfish', 'hummingbird',
        'woodpecker', 'skunk', 'porcupine', 'walrus', 'sloth'],
      3: ['elephant', 'kangaroo', 'penguin', 'flamingo', 'seahorse', 'dragonfly', 'camel', 'lobster', 'peacock', 'crocodile',
        'zebra', 'lion', 'monkey', 'gorilla', 'koala', 'panda', 'tiger', 'hedgehog', 'parrot', 'scorpion',
        'rhinoceros', 'hippopotamus', 'chameleon', 'armadillo', 'platypus', 'anteater', 'narwhal', 'axolotl', 'praying mantis', 'ostrich',
        'toucan', 'pelican', 'meerkat', 'bald eagle', 'polar bear'],
    },
  },
  sports: {
    name: 'Sports & Games',
    emoji: '⚽',
    words: {
      1: ['soccer ball', 'basketball', 'baseball', 'tennis ball', 'golf ball', 'bowling pin', 'hockey puck', 'frisbee', 'dart', 'dumbbell',
        'kettlebell', 'boxing glove', 'baseball bat', 'hockey stick', 'golf club', 'tennis racket', 'ping pong paddle', 'dice', 'playing card', 'chess pawn',
        'domino', 'marble', 'jump rope', 'whistle', 'stopwatch'],
      2: ['bowling ball', 'skis', 'soccer goal', 'dartboard', 'archery target', 'bow and arrow', 'pool cue', 'diving board', 'finish line', 'podium',
        'boomerang', 'shuttlecock', 'golf flag', 'hurdle', 'relay baton', 'javelin', 'balance beam', 'punching bag', 'chess king', 'tic tac toe',
        'swim goggles', 'life jacket', 'snowshoe', 'fishing rod', 'canoe paddle'],
      3: ['pole vault', 'ski jump', 'climbing wall', 'ski lift', 'tennis court', 'bowling alley', 'pool table', 'foosball table', 'air hockey table', 'ping pong table',
        'race track', 'olympic rings', 'figure skater', 'gymnast', 'goalkeeper', 'slam dunk', 'home run', 'hole in one', 'rowing boat', 'sumo wrestler'],
    },
  },
  home: {
    name: 'Around the House',
    emoji: '🏠',
    words: {
      1: ['spoon', 'fork', 'knife', 'pillow', 'towel', 'soap', 'sponge', 'mop', 'broom', 'vase',
        'doorknob', 'light switch', 'faucet', 'plunger', 'toilet paper', 'toothpaste', 'rubber duck', 'hanger', 'shelf', 'rug',
        'coaster', 'clothespin', 'candle', 'lamp', 'clock'],
      2: ['bathtub', 'shower', 'toilet', 'sink', 'fridge', 'oven', 'microwave', 'iron', 'ironing board', 'vacuum cleaner',
        'ceiling fan', 'dishwasher', 'doorbell', 'smoke alarm', 'curtains', 'nightstand', 'dresser', 'wardrobe', 'laundry basket', 'dustpan',
        'step ladder', 'coat rack', 'houseplant', 'fish tank', 'dog bowl'],
      3: ['fireplace', 'chimney', 'garage door', 'porch swing', 'four poster bed', 'recliner', 'grand piano', 'garden gnome', 'bird bath', 'lawn mower',
        'garden hose', 'sprinkler', 'clothesline', 'welcome mat', 'hot tub', 'treadmill', 'baby stroller', 'high chair', 'toy box', 'dollhouse'],
    },
  },
  nature: {
    name: 'Nature & Space',
    emoji: '🌋',
    words: {
      1: ['sun', 'crescent moon', 'shooting star', 'cloud', 'rainbow', 'leaf', 'flower', 'mountain', 'rock', 'wave',
        'raindrop', 'snowflake', 'lightning bolt', 'comet', 'planet', 'cactus', 'mushroom', 'pine tree', 'acorn', 'pine cone',
        'seashell', 'icicle', 'feather', 'tulip', 'sunflower'],
      2: ['volcano', 'iceberg', 'canyon', 'cave', 'river', 'sand dune', 'cliff', 'geyser', 'whirlpool', 'hurricane',
        'galaxy', 'black hole', 'meteor', 'crater', 'saturn', 'ufo', 'rocket', 'coral', 'bamboo', 'vine',
        'lily pad', 'venus flytrap', 'tree stump', 'crystal', 'stalactite'],
      3: ['solar eclipse', 'northern lights', 'milky way', 'big dipper', 'constellation', 'asteroid belt', 'mars rover', 'nebula', 'coral reef', 'rain forest',
        'oasis', 'mount everest', 'niagara falls', 'planet earth', 'tsunami', 'avalanche', 'sunset', 'thunderstorm', 'blizzard', 'hot spring'],
    },
  },
  fantasy: {
    name: 'Fantasy & Fairy Tales',
    emoji: '🐉',
    words: {
      1: ['magic wand', 'crown', 'sword', 'shield', 'potion', 'gem', 'treasure', 'gold coin', 'key', 'apple',
        'mirror', 'scroll', 'candle', 'tower', 'flag', 'rainbow', 'dragon egg', 'mushroom', 'frog', 'bow',
        'arrow', 'lantern', 'horn', 'quill', 'ring'],
      2: ['glass slipper', 'beanstalk', 'magic lamp', 'flying carpet', 'treasure chest', 'crystal ball', 'spell book', 'wizard hat', 'knight helmet', 'drawbridge',
        'fairy wings', 'unicorn horn', 'magic mirror', 'goblet', 'battle axe', 'trident', 'golden egg', 'magic beans', 'cauldron', 'broomstick',
        'treasure map', 'pirate hat', 'mermaid tail', 'gnome', 'tiara'],
      3: ['dragon', 'unicorn', 'mermaid', 'centaur', 'phoenix', 'griffin', 'pegasus', 'kraken', 'cyclops', 'minotaur',
        'troll', 'fairy', 'wizard', 'knight', 'princess', 'genie', 'sea serpent', 'pumpkin carriage', 'humpty dumpty', 'gingerbread man'],
    },
  },
};

const ALIASES = {
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

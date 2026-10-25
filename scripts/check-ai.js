// Checks that your Gemini and ElevenLabs keys work.   npm run check-ai
require('../lib/env').loadEnv();
const fs = require('fs');
const path = require('path');
const ai = require('../lib/ai');

(async () => {
  console.log('\n🔎 Checking AI services…\n');
  if (!process.env.GEMINI_API_KEY) console.log('⚠️  GEMINI_API_KEY is not set (add it to .env)');
  else {
    try {
      const out = await ai.gemini([{ text: 'Reply ONLY with JSON {"ok": true, "hello": "<a 5-word game-show greeting>"}' }]);
      console.log(`✅ Gemini (${ai.GEMINI_MODEL}) works:`, out.hello || out);
    } catch (e) {
      console.log(`❌ Gemini (${ai.GEMINI_MODEL}) failed:`, e.message);
      const { reason } = ai.geminiStatus();
      if (reason) console.log(`   ${reason}`);
      if (/Gemini 429/.test(e.message)) {
        console.log('   Free-tier limits belong to the Google Cloud project, not the key, so a new key in the same project');
        console.log('   will not help. See "Getting a Gemini key that isn\'t anyone\'s personal key" in the README.');
      } else if (/Gemini 404/.test(e.message)) {
        console.log('   Tip: try another model, e.g. GEMINI_MODEL=gemini-3.5-flash-lite in .env');
      }
    }
    console.log(`   The game makes ${ai.GUESSES_PER_TURN} guess request(s)${ai.CRITIC ? ' + 1 review' : ''} per turn (GEMINI_GUESSES_PER_TURN / GEMINI_CRITIC).`);
  }
  if (!process.env.ELEVENLABS_API_KEY) console.log('⚠️  ELEVENLABS_API_KEY is not set (add it to .env)');
  else {
    try {
      const buf = await ai.tts('Welcome to Sculpt and Spin! Grab your phones and get sculpting!');
      const file = path.join(__dirname, '..', 'check-voice.mp3');
      fs.writeFileSync(file, buf);
      console.log(`✅ ElevenLabs (${ai.ELEVEN_MODEL}) works: saved ${file} (${buf.length} bytes), play it to hear the announcer.`);
    } catch (e) {
      console.log(`❌ ElevenLabs (${ai.ELEVEN_MODEL}) failed:`, e.message);
      console.log('   Tip: try ELEVENLABS_MODEL=eleven_multilingual_v2 in .env');
    }
  }
  console.log('');
})();

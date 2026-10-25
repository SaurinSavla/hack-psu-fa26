// Game-show announcer for the TV. Speaks with an ElevenLabs voice (via the server's /api/tts),
// or the browser's built-in voice if no ElevenLabs key is configured.

export class Announcer {
  /** @param {() => ({room: string, token: string} | null)} auth */
  constructor(auth) {
    this.auth = auth;
    this.enabled = true;
    this.useEleven = false;
    this.queue = [];
    this.playing = null;
    this.cache = new Map(); // text -> object URL
    this.volume = 1;
  }

  url(text) {
    const a = this.auth();
    if (!a) return null;
    return `/api/tts?room=${encodeURIComponent(a.room)}&token=${encodeURIComponent(a.token)}&text=${encodeURIComponent(text)}`;
  }

  /** Warm the cache for lines we know we'll need, so they play instantly. */
  async preload(lines) {
    if (!this.useEleven) return;
    for (const t of lines) {
      if (this.cache.has(t)) continue;
      try {
        const res = await fetch(this.url(t));
        if (res.ok) this.cache.set(t, URL.createObjectURL(await res.blob()));
      } catch {}
    }
  }

  /**
   * Queue a line. Lines that have waited longer than `maxAgeMs` are dropped so the voice never lags behind the game.
   * `interrupt` stops whatever is playing (used for big moments).
   */
  say(text, { maxAgeMs = 7000, interrupt = false } = {}) {
    if (!this.enabled || !text) return;
    const item = { text, at: performance.now(), maxAgeMs };
    if (interrupt) {
      this.queue = [];
      this.stop();
    }
    this.queue.push(item);
    // Start fetching ElevenLabs audio right away so it's ready when its turn comes.
    if (this.useEleven && !this.cache.has(text)) item.fetching = this.fetchAudio(text);
    if (!this.playing) this.next();
  }

  async fetchAudio(text) {
    try {
      const res = await fetch(this.url(text));
      if (!res.ok) throw new Error(res.status);
      const u = URL.createObjectURL(await res.blob());
      this.cache.set(text, u);
      return u;
    } catch {
      return null;
    }
  }

  stop() {
    if (this.playing?.pause) this.playing.pause();
    if (window.speechSynthesis) speechSynthesis.cancel();
    this.playing = null;
  }

  async next() {
    const item = this.queue.shift();
    if (!item) return (this.playing = null);
    if (performance.now() - item.at > item.maxAgeMs) return this.next();
    this.playing = { pause() {} };
    if (this.useEleven) {
      const src = this.cache.get(item.text) || (await (item.fetching || this.fetchAudio(item.text)));
      if (src && performance.now() - item.at <= item.maxAgeMs + 2000) {
        const audio = new Audio(src);
        audio.volume = this.volume;
        this.playing = audio;
        audio.onended = audio.onerror = () => this.next();
        try {
          await audio.play();
          return;
        } catch {}
      }
      return this.next();
    }
    // Browser voice fallback.
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(item.text);
      u.rate = 1.08;
      u.pitch = 1.05;
      u.onend = u.onerror = () => this.next();
      speechSynthesis.speak(u);
      return;
    }
    this.next();
  }
}

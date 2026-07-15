// Klyfton TTS — turn Klyfton's text into a natural cloud voice.
// DORMANT until a key is set in Vercel (mirrors the other gated integrations — never
// fabricates, just reports not-configured). Supports two providers, auto-detected by env:
//   ELEVENLABS_API_KEY  → ElevenLabs (most lifelike; optional ELEVENLABS_VOICE_ID default)
//   OPENAI_API_KEY      → OpenAI TTS (simple, cheap; optional OPENAI_TTS_MODEL)
// If both are set, ElevenLabs wins. No npm deps (global fetch).
//
//   GET  -> { configured, provider, voices:[{id,label}] }   (no audio, key never echoed)
//   POST { text, voice } -> audio/mpeg (mp3)

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
// Owner's chosen Voice Library voice is the default (env var still overrides).
const ELEVEN_VOICE_DEFAULT = process.env.ELEVENLABS_VOICE_ID || "IRHApOXLvnW57QJPQH2P";
const OPENAI_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5"; // fast+cheap; set eleven_multilingual_v2 for max quality

// OpenAI's built-in voices.
const OPENAI_VOICES = [
  { id: "onyx",   label: "Onyx — deep male (Klyfton default)" },
  { id: "echo",   label: "Echo — male" },
  { id: "ash",    label: "Ash — male" },
  { id: "fable",  label: "Fable — British" },
  { id: "alloy",  label: "Alloy — neutral" },
  { id: "sage",   label: "Sage — neutral" },
  { id: "nova",   label: "Nova — female" },
  { id: "shimmer",label: "Shimmer — female" },
];
// ElevenLabs shared-library default voices (stable IDs).
const ELEVEN_VOICES = [
  { id: "IRHApOXLvnW57QJPQH2P", label: "★ Klyfton — your Voice Library pick" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — deep male" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — British male" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — male" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — strong male" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella — female" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — female" },
];

function provider() { if (ELEVEN_KEY) return "elevenlabs"; if (OPENAI_KEY) return "openai"; return ""; }
// Detect provider from a client-supplied key: OpenAI keys start with "sk-", else ElevenLabs.
function detectClientProvider(key) { return key ? (/^sk-/.test(key) ? "openai" : "elevenlabs") : ""; }

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  const envProv = provider();
  if (req.method === "GET") {
    // clientConfigurable=true so the app can offer an on-device key field when no env key is set.
    res.status(200).json({
      configured: !!envProv,
      clientConfigurable: true,
      provider: envProv || "elevenlabs",
      voices: envProv === "openai" ? OPENAI_VOICES : ELEVEN_VOICES,
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  const body = await readBody(req);
  // Key resolution: env var wins; else an on-device key the app sends (stored on the crew's
  // device, PIN-gated, never in the repo). We never log the key.
  const clientKey = (typeof body.key === "string" ? body.key.trim() : "");
  let prov = envProv, elevenKey = ELEVEN_KEY, openaiKey = OPENAI_KEY;
  if (!prov && clientKey) { prov = detectClientProvider(clientKey); if (prov === "openai") openaiKey = clientKey; else elevenKey = clientKey; }
  if (!prov) { res.status(200).json({ configured: false }); return; }

  // Cap length so cost stays predictable (a long reply won't run up the bill).
  const text = (typeof body.text === "string" ? body.text : "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!text) { res.status(200).json({ configured: true, error: "no_text" }); return; }
  const voice = (typeof body.voice === "string" && body.voice.trim()) ? body.voice.trim() : "";

  try {
    let r;
    if (prov === "elevenlabs") {
      const vid = voice || ELEVEN_VOICE_DEFAULT;
      r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(vid) + "?output_format=mp3_44100_128", {
        method: "POST",
        headers: { "xi-api-key": elevenKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.75 } }),
      });
    } else {
      r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: "Bearer " + openaiKey, "content-type": "application/json" },
        body: JSON.stringify({ model: OPENAI_MODEL, voice: voice || "onyx", input: text, response_format: "mp3" }),
      });
    }
    if (!r.ok) {
      let detail = ""; try { detail = await r.text(); } catch {}
      res.status(200).json({ configured: true, error: "tts_http_" + r.status, detail: String(detail).slice(0, 160) });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(buf);
  } catch (e) {
    res.status(200).json({ configured: true, error: String((e && e.message) || e).slice(0, 160) });
  }
};

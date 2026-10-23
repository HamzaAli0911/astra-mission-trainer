import { useUI } from "../state/ui";

/** Reads CAPCOM's lines aloud with the browser's built-in voices, when enabled in Settings. */
let voice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (voice || typeof speechSynthesis === "undefined") return voice;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  voice =
    voices.find((v) => /Samantha|Google US English|Jenny|Aria|Serena|Karen/i.test(v.name)) ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null;
  return voice;
}
if (typeof speechSynthesis !== "undefined")
  speechSynthesis.addEventListener?.("voiceschanged", () => {
    voice = null;
    pickVoice();
  });

export function speak(text: string, force = false) {
  if (typeof speechSynthesis === "undefined") return;
  if (!force && !useUI.getState().settings.voice) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[₂]/g, "2").replace(/\bmSv\b/g, "millisieverts").replace(/\bkWh\b/g, "kilowatt hours").replace(/\bkW\b/g, "kilowatts"));
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1;
    u.pitch = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* speech is optional */
  }
}

export function hush() {
  try {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

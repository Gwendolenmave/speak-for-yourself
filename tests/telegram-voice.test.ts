import assert from "node:assert/strict";
import test from "node:test";
import { TelegramVoiceSender } from "../src/telegram-voice.js";

test("Telegram sender uses sendVoice with an MP3 file", async () => {
  let seenUrl = "";
  let seenBody: FormData | null = null;
  const sender = new TelegramVoiceSender({
    botToken: "test-token",
    maxAttempts: 1,
    fetchImpl: async (input, init) => {
      seenUrl = String(input);
      seenBody = init?.body as FormData;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await sender.sendVoice(42, new Uint8Array([1, 2, 3]));

  assert.match(seenUrl, /\/sendVoice$/u);
  const body = seenBody as unknown as FormData;
  assert.equal(body.get("chat_id"), "42");
  const voice = body.get("voice");
  assert.ok(voice instanceof File);
  assert.equal(voice.name, "voice.mp3");
  assert.equal(voice.type, "audio/mpeg");
});

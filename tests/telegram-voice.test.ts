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

test("Telegram sender does not retry a non-retryable 4xx", async () => {
  let calls = 0;
  const sender = new TelegramVoiceSender({
    botToken: "test-token",
    maxAttempts: 3,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    },
  });

  await assert.rejects(
    sender.sendVoice(42, new Uint8Array([1])),
    /Telegram sendVoice HTTP 400/u,
  );
  assert.equal(calls, 1);
});

test("Telegram sender retries a 5xx and can recover", async () => {
  let calls = 0;
  const sender = new TelegramVoiceSender({
    botToken: "test-token",
    maxAttempts: 3,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ ok: false }), { status: 503 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await sender.sendVoice(42, new Uint8Array([1]));
  assert.equal(calls, 2);
});

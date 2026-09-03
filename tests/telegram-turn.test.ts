import assert from "node:assert/strict";
import test from "node:test";
import { handleTelegramTurn } from "../examples/telegram-turn.js";
import type { ResolvedExpression } from "../src/expression.js";

function makeStore(events: string[]) {
  const persisted: Array<{
    turnKey: string;
    content: string;
    expression: ResolvedExpression;
  }> = [];
  return {
    persisted,
    store: {
      persist: async (input: {
        turnKey: string;
        content: string;
        expression: ResolvedExpression;
      }) => {
        events.push("persist");
        persisted.push(input);
      },
    },
  };
}

test("Telegram reference: Voice success is voice-only and persists once", async () => {
  const events: string[] = [];
  const texts: string[] = [];
  const { store, persisted } = makeStore(events);
  const originalFetch = globalThis.fetch;
  let ttsCalls = 0;
  let voiceCalls = 0;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.elevenlabs.io")) {
      ttsCalls += 1;
      events.push("tts");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (url.includes("api.telegram.org")) {
      voiceCalls += 1;
      events.push("voice");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    await handleTelegramTurn({
      turnKey: "turn-voice",
      chatId: 42,
      userText: "say it",
      mode: "voice",
      agent: { generate: async () => "[softly] I know." },
      store,
      sendText: async (_chatId, text) => {
        events.push("text");
        texts.push(text);
      },
      elevenLabsApiKey: "test-key",
      elevenLabsVoiceId: "test-voice",
      telegramBotToken: "test-bot",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, ["persist", "tts", "voice"]);
  assert.equal(texts.length, 0);
  assert.equal(ttsCalls, 1);
  assert.equal(voiceCalls, 1);
  assert.deepEqual(persisted, [
    { turnKey: "turn-voice", content: "[softly] I know.", expression: "voice" },
  ]);
});

test("Telegram reference: Voice failure falls back to the exact canonical text", async () => {
  const events: string[] = [];
  const texts: string[] = [];
  const { store } = makeStore(events);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.elevenlabs.io")) {
      events.push("tts");
      return new Response("nope", { status: 500 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    await handleTelegramTurn({
      turnKey: "turn-fallback",
      chatId: 42,
      userText: "say it",
      mode: "voice",
      agent: { generate: async () => "[softly] Same words." },
      store,
      sendText: async (_chatId, text) => {
        events.push("text");
        texts.push(text);
      },
      elevenLabsApiKey: "test-key",
      elevenLabsVoiceId: "test-voice",
      telegramBotToken: "test-bot",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, ["persist", "tts", "text"]);
  assert.deepEqual(texts, ["[softly] Same words."]);
});

test("Telegram reference: Both sends text before voice and persists one canonical reply", async () => {
  const events: string[] = [];
  const texts: string[] = [];
  const { store, persisted } = makeStore(events);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.elevenlabs.io")) {
      events.push("tts");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (url.includes("api.telegram.org")) {
      events.push("voice");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    await handleTelegramTurn({
      turnKey: "turn-both",
      chatId: 42,
      userText: "keep it",
      mode: "both",
      agent: { generate: async () => "Keep this one." },
      store,
      sendText: async (_chatId, text) => {
        events.push("text");
        texts.push(text);
      },
      elevenLabsApiKey: "test-key",
      elevenLabsVoiceId: "test-voice",
      telegramBotToken: "test-bot",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, ["persist", "text", "tts", "voice"]);
  assert.deepEqual(texts, ["Keep this one."]);
  assert.deepEqual(persisted, [
    { turnKey: "turn-both", content: "Keep this one.", expression: "both" },
  ]);
});

test("Telegram reference: Both voice failure keeps already-delivered text without resending", async () => {
  const events: string[] = [];
  const texts: string[] = [];
  const { store } = makeStore(events);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.elevenlabs.io")) {
      events.push("tts");
      return new Response("nope", { status: 500 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    await handleTelegramTurn({
      turnKey: "turn-both-fail",
      chatId: 42,
      userText: "keep it",
      mode: "both",
      agent: { generate: async () => "Keep this one." },
      store,
      sendText: async (_chatId, text) => {
        events.push("text");
        texts.push(text);
      },
      elevenLabsApiKey: "test-key",
      elevenLabsVoiceId: "test-voice",
      telegramBotToken: "test-bot",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, ["persist", "text", "tts"]);
  assert.deepEqual(texts, ["Keep this one."]);
});

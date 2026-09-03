import assert from "node:assert/strict";
import test from "node:test";
import {
  ELEVENLABS_DIALOGUE_MAX_CHARS,
  ELEVENLABS_EXPRESSION_MODEL,
  buildElevenLabsDialogueRequest,
} from "../src/elevenlabs.js";

test("Create Dialogue uses inputs[] and the expressive v3 model", () => {
  const request = buildElevenLabsDialogueRequest({
    apiKey: "secret-key",
    voiceId: "voice-id",
    text: "[laughs] You knew.",
  });

  const body = JSON.parse(request.body) as {
    inputs: Array<{ text: string; voice_id: string }>;
    model_id: string;
    language_code: string;
  };

  assert.equal(request.url.startsWith("https://api.elevenlabs.io/v1/text-to-dialogue"), true);
  assert.equal(request.url.includes("output_format=mp3_44100_128"), true);
  assert.equal(body.inputs.length, 1);
  assert.equal(body.inputs[0]?.text, "[laughs] You knew.");
  assert.equal(body.inputs[0]?.voice_id, "voice-id");
  assert.equal(body.model_id, ELEVENLABS_EXPRESSION_MODEL);
  assert.equal(body.language_code, "en");
});

test("the API key exists only in the request header", () => {
  const request = buildElevenLabsDialogueRequest({
    apiKey: "secret-key-material",
    voiceId: "voice-id",
    text: "hello",
  });
  assert.equal(request.headers["xi-api-key"], "secret-key-material");
  assert.ok(!request.url.includes("secret-key-material"));
  assert.ok(!request.body.includes("secret-key-material"));
});

test("the reference reliability bound is explicit", () => {
  assert.equal(ELEVENLABS_DIALOGUE_MAX_CHARS, 2_000);
});

# Status

This file describes what the current public source implements. It is not a roadmap promise.

## Implemented

- `ExpressionMode = auto | text | voice | both`;
- turn-local Expression instructions;
- first-non-whitespace Auto marker protocol;
- fail-closed missing / malformed marker behavior;
- configurable Voice/Both text guard (CJK-rejecting English reference default);
- performance directions preserved in canonical content;
- ElevenLabs Create Dialogue request builder using `inputs[]`;
- default `eleven_v3_conversational` model;
- explicit `mp3_44100_128` output format;
- 2,000-character TTS reliability bound;
- Telegram `sendVoice` adapter with bounded 429 / 5xx retries;
- minimal no-network example;
- Telegram turn integration example;
- tests for core protocol, ElevenLabs request shape, and Telegram voice upload behavior;
- documentation for durable production delivery / recovery semantics.

## Deliberately not implemented as a framework

- model-provider adapters;
- persona or memory systems;
- Telegram polling / webhook ownership;
- durable database / outbox implementation;
- proactive scheduling;
- automatic voice design / cloning;
- exact-once voice delivery;
- a hosted service or telemetry backend.

## Package state

The repository is currently a source/tutorial candidate. `package.json` is marked private; there is no npm publication promise.

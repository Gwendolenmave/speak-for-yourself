# Pitfalls from a real integration

These are not hypothetical style preferences. They are failure modes that showed up while turning the pattern into a live Telegram bot.

## 1. A second voice rewriter makes the voice stop feeling like the same agent

The first tempting design is:

```text
canonical agent reply
      │
      ▼
translator / voice rewriter
      │
      ▼
TTS
```

It can sound fluent and still feel wrong. Pronouns drift, jokes flatten, intimate wording changes, and the spoken reply becomes a paraphrase authored by a second model.

The durable fix is architectural: **the canonical agent authors the spoken-language reply directly.** TTS should receive the same canonical content that history and recovery see.

## 2. Tests can faithfully prove the wrong API shape

A provider request can be wrong while every local test is green if the tests merely mirror the implementation.

For ElevenLabs Create Dialogue, the request field is `inputs[]`, not `input`. Keep a focused contract test that asserts the exact provider-facing shape: endpoint, `inputs[].text`, `voice_id`, model id, language code, and output format.

## 3. Test what the user receives, not only helper classes

A Voice service can pass all of its unit tests while the runtime still sends the normal text reply first. That silently turns **Voice into Both**.

Add runtime-level assertions for visible effects:

- Text → text count 1, voice count 0;
- Voice success → text count 0, voice count 1;
- Voice failure → the exact canonical text once;
- Both → text first, then voice.

## 4. A fallback interface is not a fallback until it is wired

It is easy to define “Voice failure falls back to Text” in a service and forget to connect the durable text path at composition/runtime level.

Test the failure from the transport boundary all the way to the user-visible result. A TTS exception or `sendVoice` failure must not lose the reply.

## 5. Resolve Expression on the final canonical text

If the host already has a corrective regeneration or bounded retry, do not parse the Auto marker before that step. A later canonical attempt may produce different text and a different marker.

Resolve once, **after the host has decided which reply is final**, then persist that content and resolved mode.

## 6. Forced mode is host authority — but valid markers are still protocol

Text / Voice / Both selected explicitly should not be overridden by a model-emitted marker. At the same time, a valid leading `[AGENT_EXPRESSION:*]` line should not leak into visible text or TTS just because the mode was forced.

Strip the reserved marker, keep the host-selected mode.

## 7. Freeze the resolved mode for the turn

Changing the UI from Voice to Text should affect future turns, not cancel or mutate a reply that already resolved to Voice.

Delivery and recovery should read the **persisted resolved expression**, not consult mutable control state again.

## 8. Both needs one finalization choke point

The reliable order is:

```text
persist reply → text ACK → voice attempt → finalize
```

If text fails, do not speak yet. If the process crashes after text ACK, restart must skip the acknowledged text and still attempt voice.

Putting “supplement Both voice” in two recovery branches creates a deterministic duplicate. Keep one authoritative finalization path.

## 9. Proactive messages need the same contract

If an agent can initiate a message, do not build a special proactive voice brain. The initiative system decides **whether/why** to speak; the canonical agent decides **what** to say; Expression decides **how** it is delivered.

Use the same persisted `{ content, expression }` and the same recovery rules.

## 10. Do not add a long-script subsystem before you need one

For the reference ElevenLabs path, keep total `inputs[].text` at or below the documented ~2,000-character reliability boundary.

Above the bound, fail soft to Text. Do not silently truncate, summarize, or invent a chunking architecture just to preserve Voice.

## 11. One Telegram bot should have one update consumer

If a live bot is using long polling, do not probe it by starting another `getUpdates` consumer with the same token. Telegram can return `409 Conflict`, and a correctly defensive runtime may terminate to avoid a split-brain worker.

Health checks should inspect process/service state, logs, or the host's own receipts — not compete with the live update loop.

## 12. Keep real provider calls out of ordinary CI

CI should prove parser behavior, request shape, fallback logic, and transport wiring with fakes. It should not spend TTS credits or post real Telegram messages.

After deployment, one deliberately bounded live canary is more useful than making every test hit the provider.

## The meta-lesson

Most of the bugs were not “TTS quality” bugs. They were **authority and delivery-order bugs**: a second author appeared, a marker was parsed at the wrong time, a fallback existed only on paper, or a turn finalized before all of its intended delivery work was accounted for.

That is why this project keeps the core small and makes the boundaries explicit.

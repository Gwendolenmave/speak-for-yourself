# Speak for Yourself

[简体中文](README.zh-CN.md)

**One mind. Text, voice, or both.**

Most AI voice bots do this:

```text
agent reply → translator / voice rewriter → TTS
```

Speak for Yourself does this:

```text
                    ┌→ Text
one agent reply → Expression
                    ├→ Voice → TTS
                    └→ Both  → Text + TTS
```

**The same agent writes the final utterance once and chooses how it reaches the user.** No translator model, no second persona, no second semantic reply. ElevenLabs is the throat, not a second brain.

This repository is a small, provider-neutral reference implementation, using Telegram + ElevenLabs as the concrete example.

## The idea in one turn

Your existing agent still receives its normal persona, memory, tools, and conversation context. In `auto` mode it may return:

```text
[AGENT_EXPRESSION:voice]
[laughs] You absolutely did that on purpose. Come here.
```

The host strips only the first-line control marker and keeps one canonical assistant reply:

```text
[laughs] You absolutely did that on purpose. Come here.
```

That exact content is what gets persisted and spoken.

Performance directions such as `[softly]`, `[laughs]`, and `[sighs]` stay part of the canonical utterance. A missing or malformed Auto marker simply falls back to Text; Expression never calls another model to repair the choice.

## Four modes

| Mode | Result |
| --- | --- |
| **Text** | text only |
| **Voice** | voice only; same-text fallback if voice delivery fails |
| **Both** | text first, then the same content as voice |
| **Auto** | the agent chooses Text / Voice / Both in its normal generation |

Text is the usual medium. Voice is an intentional choice. Both is rarer. The reference implementation uses no percentages, randomizers, topic heuristics, or second-model classifier.

## Try it

Requires **Node.js 22.22+**.

```sh
git clone https://github.com/Gwendolenmave/speak-for-yourself.git
cd speak-for-yourself
npm install
npm run verify
npm run example:minimal
```

The minimal example uses no network calls or credentials.

## Add it to an existing agent

You do not need to replace your framework. Add one turn-local instruction to the generation you already perform, then resolve the result locally:

```ts
import {
  renderExpressionInstruction,
  resolveExpression,
} from "./src/index.js";

const mode = "auto" as const;
const turnEnhancement = renderExpressionInstruction(mode, {
  userName: "Atalanta",
});

const rawReply = await yourExistingAgent.generate({
  userText,
  ...(turnEnhancement ? { turnEnhancement } : {}),
});

const reply = resolveExpression(mode, rawReply);
```

`reply.content` is the one canonical utterance. `reply.expression` is transport metadata.

If your provider keeps a stateful thread, keep the static identity prompt static: put Expression in a **turn-local context seam**, not in a per-mode system-prompt rewrite.

## Reference adapters

ElevenLabs uses Create Dialogue as pure TTS:

```text
POST /v1/text-to-dialogue
model: eleven_v3_conversational
inputs: [{ text, voice_id }]
output_format: mp3_44100_128
```

Telegram delivery uses `sendVoice`. See [`examples/telegram-turn.ts`](examples/telegram-turn.ts) for the complete readable path.

## Production rules

The small example is intentionally simple. A durable bot should keep these rules:

1. **Persist `{ content, expression }` before TTS.**
2. **Never regenerate a completed reply just because delivery crashed.** Resume transport from the persisted reply.
3. **Voice failure falls back to the exact same text.** Do not translate, summarize, or rewrite it.
4. **Both is text-first.** Do not send voice until text is acknowledged; finalize only after the voice attempt.
5. **One assistant reply stays one assistant reply.** Transport metadata does not create a sibling transcript.

Read [Production delivery and recovery](docs/PRODUCTION.md) before using this pattern in a long-running bot.

## What this repository owns

Only the Expression pattern and small reference adapters:

- Auto / Text / Voice / Both resolution;
- first-line protocol parsing;
- ElevenLabs TTS request construction;
- Telegram `sendVoice` delivery;
- examples and production guidance.

Your host still owns the model provider, persona, memory, tools, transcript store, polling/webhooks, proactive scheduling, deployment, backups, and secrets.

## Documentation

| Need | Read |
| --- | --- |
| wire it into your agent | [Integration](docs/INTEGRATION.md) |
| understand the invariants | [Architecture](docs/ARCHITECTURE.md) |
| survive crashes / restarts | [Production](docs/PRODUCTION.md) |
| inspect current implementation | [Status](docs/STATUS.md) |
| understand privacy / secrets | [Privacy](docs/PRIVACY.md) |

## License

[PolyForm Noncommercial License 1.0.0](LICENSE.md). Personal use, study, modification, and noncommercial sharing are permitted; commercial use requires separate permission.

Created by **Gwendolen** with **AmeliaGPT**.

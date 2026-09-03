# Speak for Yourself

[简体中文](README.zh-CN.md)

**One mind. Text, voice, or both.**

Most AI voice integrations bolt speech onto the end of a text pipeline: the main agent writes a reply, another model translates or rewrites it for speech, and TTS reads the second version. It works — but the voice is no longer quite the same author.

**Speak for Yourself uses a stricter contract: your existing agent writes the final utterance once, and chooses how that same utterance should reach the user.** Text, Voice, and Both are delivery modes, not different assistants. ElevenLabs is the throat, not a second brain.

This repository is a small, provider-neutral reference implementation for adding that pattern to an existing AI agent, with Telegram + ElevenLabs as the concrete example.

## One example is faster than a feature list

Imagine **Atalanta** and her assistant **Artemis** are chatting normally. Most of the conversation is text.

Atalanta says something that makes Artemis want her to actually hear the answer.

With Expression set to `auto`, the same agent that already has the persona, memory, tools, and conversation context produces:

```text
[AGENT_EXPRESSION:voice]
[laughs] You absolutely did that on purpose. Come here.
```

The host does four things:

1. parses the first non-whitespace line as host protocol;
2. removes only that control marker;
3. persists exactly one canonical assistant reply:

   ```text
   [laughs] You absolutely did that on purpose. Come here.
   ```

4. sends that exact content to ElevenLabs and delivers the resulting audio.

There is **no translator model**, no “voice persona,” no second conversation, and no second semantic generation.

If Artemis chooses `both`, the same canonical content is sent as text and spoken as audio. If the Auto marker is missing or malformed, the host fails closed to Text instead of asking another model to repair the decision.

That is the whole idea.

## The architecture

```text
user message
    │
    ▼
your existing agent
persona · memory · tools · conversation context
    │
    │ ONE semantic reply generation
    ▼
Expression resolution
Auto / Text / Voice / Both
    │
    ├── Text ───────────────────────→ chat text
    │
    ├── Voice ─→ ElevenLabs ───────→ voice message
    │             failure ─────────→ same text fallback
    │
    └── Both ──→ chat text first
                 └→ ElevenLabs ────→ voice supplement
```

The important boundary is between **meaning** and **transport**. Expression may decide how a reply is delivered. It does not get to author a second reply.

## What makes this different from ordinary “AI + TTS”

A common voice pipeline looks like this:

```text
main agent reply
      │
      ▼
translator / voice rewriter
      │
      ▼
TTS
```

That creates two semantic authors. Pronouns can drift. Humor can flatten. Intimacy can get sanitized. The “spoken version” may become a polished paraphrase of what the assistant actually meant.

Speak for Yourself instead uses:

```text
main agent reply
      │
      ├── text
      └── TTS
```

For Voice/Both, the **main agent authors the spoken-language version directly during its normal turn**. Performance directions such as `[softly]`, `[laughs]`, and `[sighs]` remain part of the canonical utterance, so there is still only one representation to remember, recover, or reference later.

## Try it locally

Requires **Node.js 22.22 or newer**.

```sh
git clone https://github.com/Gwendolenmave/speak-for-yourself.git
cd speak-for-yourself
npm install
npm run verify
npm run example:minimal
```

The minimal example uses no network calls or credentials. It demonstrates one Auto turn resolving to Voice while preserving a performance direction.

For the Telegram reference handler, read [`examples/telegram-turn.ts`](examples/telegram-turn.ts). It shows where the Expression instruction enters an existing agent call, where the one canonical reply is persisted, and how Text / Voice / Both are delivered.

## The minimal integration

You do **not** need to replace your agent framework.

Add one turn-local instruction to the generation you already perform:

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
  ...(turnEnhancement !== undefined ? { turnEnhancement } : {}),
});

const reply = resolveExpression(mode, rawReply);
```

`reply.content` is the one canonical assistant utterance. `reply.expression` is only transport metadata:

```ts
{
  expression: "voice",
  content: "[laughs] You absolutely did that on purpose. Come here.",
  markerObserved: true
}
```

Persist that pair before voice delivery if you care about crash recovery.

### Stateful providers: keep the static prompt static

If your provider keeps a stateful conversation thread and fingerprints the system prompt, do not rewrite the static system prompt every time the user switches Text / Voice / Both. Put the Expression instruction in a **turn-local context seam** instead.

The assistant's identity is static authority. Expression is per-turn delivery intent.

See [Integration](docs/INTEGRATION.md) for the full host contract.

## ElevenLabs: pure TTS, not an agent

The reference adapter uses ElevenLabs Create Dialogue:

```text
POST /v1/text-to-dialogue
model: eleven_v3_conversational
inputs: [{ text, voice_id }]
language_code: en
output_format: mp3_44100_128
```

The request contains exactly one text input and one voice. The API key is placed only in the request header. The reference implementation keeps a 2,000-character reliability bound: longer Voice content should fail soft to Text rather than being silently truncated, summarized, or split into a second semantic representation.

```ts
import { ElevenLabsDialogueSynthesizer } from "./src/index.js";

const tts = new ElevenLabsDialogueSynthesizer({
  apiKey: process.env.ELEVENLABS_API_KEY!,
  voiceId: process.env.ELEVENLABS_VOICE_ID!,
});

const mp3 = await tts.synthesize(reply.content);
```

## Telegram: send the audio as a real voice message

```ts
import { TelegramVoiceSender } from "./src/index.js";

const telegramVoice = new TelegramVoiceSender({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
});

await telegramVoice.sendVoice(chatId, mp3);
```

The adapter uploads the MP3 through Telegram `sendVoice`. It retries ordinary 429 / 5xx failures and never includes the bot token in thrown error messages.

## The four modes

| Mode | Semantic generation | User-visible result |
| --- | --- | --- |
| **Text** | normal agent reply | text only |
| **Voice** | same agent authors a spoken-language reply | voice only; same-text fallback if voice delivery fails |
| **Both** | same agent authors one spoken-language reply | text first, then the same content as voice |
| **Auto** | same agent also chooses the transport | Text / Voice / Both according to the first-line protocol marker |

The reference Auto instruction deliberately makes Text the usual medium, Voice an intentional occasional choice, and Both rarer still. There are no percentages, randomizers, topic heuristics, or second-model classifiers.

## Why the marker exists

Auto needs a tiny machine-readable signal without creating a second classifier call:

```text
[AGENT_EXPRESSION:text]
[AGENT_EXPRESSION:voice]
[AGENT_EXPRESSION:both]
```

Only a valid marker on the **first non-whitespace line** is control protocol. A marker after conversational content is just text. A missing or malformed marker means Text.

The marker is removed before persistence, TTS, or user delivery. Performance directions are not removed.

## Performance directions stay canonical

The reference implementation intentionally does **not** maintain one “clean transcript string” and another “TTS script string.”

```text
[softly] I know.
[laughs] You planned that.
```

is one canonical utterance.

That has a useful consequence: later context can naturally refer to delivery cues — “you laughed when you said that” — without inventing a sibling transcript or metadata parser.

If your product chooses to strip performance directions from visible Both text, that is a different representation contract. Make that trade-off explicitly; do not accidentally create two competing versions of the assistant's words.

## Production: persist before transport

The small Telegram example is intentionally easy to read. A long-running bot also needs crash semantics.

The production contract is:

```text
one model reply
      │
      ▼
persist { content, expression }
      │
      ├── Text  → durable text delivery
      │
      ├── Voice → TTS/sendVoice
      │             └─ failure → durable SAME-text fallback
      │
      └── Both  → durable text ACK
                    └─ TTS/sendVoice
                         └─ finalize after the voice attempt
```

On restart, if the canonical assistant reply already exists, **do not run the model again**. Recover `content + expression` and resume delivery.

Read [Production delivery and recovery](docs/PRODUCTION.md) before treating a live bot as durable. It covers the important crash windows, text-first Both semantics, voice fallback, and why at-least-once voice delivery is a more honest claim than exact-once.

## Design rules

1. **One reply means one semantic author.** Expression must not add a translator, rewriter, or repair generation.
2. **Transport metadata is not a second transcript.** Persist one assistant message plus the resolved Expression mode.
3. **Fail closed instead of repairing with another model.** Missing marker, invalid marker, language guard failure, or TTS failure should degrade transport — not meaning.
4. **Persist before TTS.** A voice message should never be the only surviving copy of what the assistant said.
5. **Text first for Both.** If text fails, do not emit the voice yet. If voice fails after text succeeds, the text stands.
6. **Per-turn control belongs in per-turn context.** Do not churn a stateful provider's static identity prompt just to switch media.

[Architecture](docs/ARCHITECTURE.md) is the normative version of these rules.

## What this repository deliberately does not own

Speak for Yourself is a pattern + reference adapters, not a complete chatbot platform. It does not own:

- your model provider or agent framework;
- persona, memory, tools, or system-prompt authority;
- Telegram polling / webhook orchestration;
- a database or transcript format;
- a scheduler for proactive messages;
- voice cloning or voice design;
- deployment, process supervision, backups, or secret storage.

Those remain host responsibilities. Keeping the project small is part of the design: **add a voice to the agent you already have; do not build another agent next to it.**

## Privacy and network boundary

This repository operates no hosted service or telemetry backend.

With the reference adapters:

- your existing model provider receives whatever prompt/context your host already sends for the turn;
- ElevenLabs receives only the canonical content selected for Voice/Both plus the configured voice id;
- Telegram receives the text and/or generated audio you explicitly deliver;
- API keys and bot tokens should stay in environment variables or your host secret store, never in source control.

See [Privacy and secrets](docs/PRIVACY.md).

## Documentation map

| I want to… | Read this |
| --- | --- |
| wire Expression into an existing agent | [Integration](docs/INTEGRATION.md) |
| understand the invariants and authority boundaries | [Architecture](docs/ARCHITECTURE.md) |
| make delivery survive crashes/restarts | [Production delivery and recovery](docs/PRODUCTION.md) |
| see exactly what the current public source implements | [Status](docs/STATUS.md) |
| understand data / secret / network boundaries | [Privacy and secrets](docs/PRIVACY.md) |
| report a bug or security issue | [Contributing](CONTRIBUTING.md) / [Security](SECURITY.md) |

## Licence and maintenance

Speak for Yourself uses the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Personal use, study, modification, and noncommercial sharing are permitted under the licence; commercial use requires separate permission.

The licensor and maintainer is **Gwendolen** (`@Gwendolenmave` on GitHub).

The project uses closed maintenance and is not accepting substantive external code contributions. Bug reports and responsible security reports remain welcome.
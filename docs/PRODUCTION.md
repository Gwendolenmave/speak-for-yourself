# Production delivery and recovery

The reference examples are intentionally small. A long-running bot also needs durable delivery semantics.

## Canonical record

Before any TTS call, persist one canonical assistant record:

```ts
{
  turnKey,
  content,
  expression: "text" | "voice" | "both"
}
```

The transport must be recoverable from this record without invoking the model again.

## Text

```text
persist canonical reply
        │
        ▼
durable text outbox
        │
        ▼
Telegram ACK
        │
        ▼
finalize
```

## Voice

```text
persist canonical reply
        │
        ▼
TTS exact content
        │
        ▼
sendVoice
   │         │
 success    failure / too long
   │         │
finalize     ▼
       durable SAME-text fallback
                │
                ▼
             finalize
```

Do not translate, summarize, truncate, or run a repair generation on the fallback path.

## Both

```text
persist canonical reply
        │
        ▼
durable text outbox
        │
        ▼
all text ACKed
        │
        ▼
TTS exact content
        │
        ▼
sendVoice attempt
        │
        ▼
finalize
```

Text acknowledgement is the ordering boundary. Voice must not outrun undelivered text.

If the voice attempt fails, the delivered text is accepted as the fail-soft result.

## Crash windows

### Canonical reply exists, no outbox yet

On restart: find the canonical reply by stable turn key, recover `content + expression`, do not regenerate, and resume the correct delivery path.

### Text outbox exists, some chunks acknowledged

Resume only undelivered chunks. When all are acknowledged, continue the Both voice attempt if the persisted expression is `both`.

### Both text is fully acknowledged, process dies before voice

Keep enough durable state to prove the text phase completed but the overall turn did not finalize. On restart, skip text resend and attempt voice.

### Voice send succeeds but acknowledgement is lost

Exactly-once voice delivery is difficult without a transport-level idempotency key. A retry can duplicate a voice message at this boundary.

The honest contract is **at-least-once voice delivery around acknowledgement loss**, not exact-once.

## Long TTS content

The ElevenLabs reference adapter uses a 2,000-character bound.

Recommended semantics:

- Voice > bound → skip TTS and deliver the same canonical content as Text.
- Both > bound → keep the already-delivered Text and skip voice.

Do not introduce chunking just to preserve Voice unless your product has a real need for multi-part spoken delivery.

## Proactive messages

If your agent can initiate messages on its own, keep the same authority split:

```text
initiative policy  → whether/why to speak
canonical agent    → what to say
Expression         → how to deliver it
```

Do not create a separate “voice proactive agent.” Persist the same canonical reply and resolved expression on the proactive job, then use the same recovery rules.

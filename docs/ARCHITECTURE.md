# Architecture

This document is the normative contract for Speak for Yourself.

## Scope

Expression answers one question only:

> Given one canonical assistant reply, how should that same reply reach the user?

It does not own identity, memory, model access, tools, or conversation state.

## Authority map

```text
host / user setting
requested ExpressionMode
        │
        ▼
turn-local Expression instruction
        │
        ▼
existing canonical agent generation
        │
        ▼
resolveExpression()
        │
        ├── content      ← canonical assistant utterance
        └── expression   ← transport metadata
```

The host's normal agent generation remains the only semantic authority.

## Invariants

### A1. One semantic reply

Expression must add zero semantic generations.

Infrastructure retries already belonging to the host are not Expression calls. A provider retry, refusal retry, or other pre-existing recovery mechanism may still occur. The invariant is narrower: **Expression itself may not introduce a translator, rewriter, repair model, or medium classifier call.**

### A2. One canonical content string

After a valid Auto marker is removed, the remaining content is the assistant reply.

Performance directions are ordinary canonical content. The reference implementation does not split visible text, TTS script, and performance-tag metadata.

### A3. Auto control is first-line protocol

Only a valid marker on the first non-whitespace line is machine control:

```text
[AGENT_EXPRESSION:text]
[AGENT_EXPRESSION:voice]
[AGENT_EXPRESSION:both]
```

A marker later in the reply is content. A missing or malformed first-line marker resolves to Text without regeneration.

### A4. Forced mode is host authority

When the host requested Text, Voice, or Both explicitly, that mode wins. The model is not asked to choose another mode.

A spoken-language guard may still downgrade explicit Voice/Both to Text when the already-produced content cannot satisfy the host's voice contract. That downgrade changes transport only.

### A5. Static identity prompt should not churn

Per-turn Expression instructions belong in per-turn context.

For stateful providers, mutating the static system prompt on every mode switch can rotate or fragment the provider's internal thread. The assistant's identity is stable; Expression is not.

### A6. Persistence precedes voice transport

A production host persists the canonical content and resolved expression before spending TTS or sending audio.

Voice transport must never become the only durable record of what the assistant said.

### A7. Both is text-first

Both means:

1. persist canonical reply;
2. durably deliver text;
3. after text acknowledgement, attempt voice;
4. finalize after the voice attempt.

If text fails, do not emit voice yet. If voice fails after text succeeds, the text stands.

## Failure semantics

| Failure | Required behavior |
| --- | --- |
| Auto marker missing / malformed | Text, same content, no model rerun |
| Voice-language guard fails | Text, same content, no translation |
| Voice content exceeds provider bound | Text fallback (Voice) or text-only completion (Both) |
| TTS fails | Text fallback for Voice; Both text stands |
| Telegram voice send fails | same as TTS failure |
| crash after canonical persistence | recover `{content, expression}`; do not regenerate |
| crash after Both text acknowledgement | do not resend acknowledged text; resume voice attempt |

## What is intentionally not in core

The core does not include model/provider calls, durable storage, a Telegram update loop, a proactive scheduler, a language-detection dependency, a second voice transcript, an MP3 cache, or random Auto percentages/topic heuristics.

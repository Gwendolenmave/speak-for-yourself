# Integration

Speak for Yourself is designed to enter an agent you already have, not replace it.

## 1. Choose where requested mode lives

Your host owns the requested mode:

```ts
type ExpressionMode = "auto" | "text" | "voice" | "both";
```

A simple UI may keep this in session state. For unattended systems, starting in `text` is a conservative way to avoid unexpected TTS spend.

## 2. Add Expression as turn-local context

```ts
const enhancement = renderExpressionInstruction(mode, {
  userName: "Atalanta",
  voiceLanguage: "natural American English",
});
```

Pass that string through the host's existing per-turn context seam. Do not create a new agent instance. Do not strip the existing persona, memory, tools, search results, or relationship context.

## 3. Run the normal generation

```ts
const raw = await agent.generate({
  userText,
  ...(enhancement !== undefined ? { turnEnhancement: enhancement } : {}),
});
```

Expression should add no model call.

If your host already has provider retries or a refusal retry that legitimately belongs to the canonical generation path, keep it. The invariant is not “the entire host must make exactly one network call.” It is “Expression must add zero semantic calls.”

## 4. Resolve on the final canonical text

If the host has a pre-existing corrective regeneration step, resolve Expression **after** that step. The final generation may contain a different Auto marker from an earlier attempt.

```ts
const reply = resolveExpression(mode, finalRawReply);
```

Persist and deliver `reply.content`, not the raw marker-bearing string.

## 5. Configure the voice-language guard

The default guard rejects CJK for Voice/Both because the reference prompt asks the main agent to directly author spoken replies in English.

For another spoken-language contract:

```ts
resolveExpression(mode, raw, {
  rejectVoiceText: (text) => !myLanguageValidator(text),
});
```

Or disable it when your provider intentionally supports the language range you need:

```ts
resolveExpression(mode, raw, {
  rejectVoiceText: () => false,
});
```

Do not “fix” a failed guard by sending the text to a translation model.

## 6. Persist one reply

A durable host should store at least:

```ts
{
  content: reply.content,
  expression: reply.expression
}
```

Do not create a second assistant message just because the transport is voice.

## 7. Deliver

- Text: send text.
- Voice: TTS + send voice; on failure, send the same canonical text.
- Both: send text first, then TTS + voice; voice failure does not rewrite or resend text.

For a long-running host, continue with [Production delivery and recovery](PRODUCTION.md).

## Stateful provider note

Some providers reuse an opaque server-side thread and treat a static system-prompt change as a new conversation variant.

```text
static prompt   = identity / stable authority
turn context    = current message / memory / Expression instruction
```

This preserves provider thread continuity when the user switches modes.

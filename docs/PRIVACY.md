# Privacy and secrets

Speak for Yourself operates no hosted backend and collects no telemetry.

## Network flows

The reference architecture can involve three independent network destinations:

1. **your existing model provider** — receives whatever prompt/context your host already sends for the canonical turn;
2. **ElevenLabs** — receives the canonical content selected for Voice/Both and the configured voice id;
3. **Telegram** — receives the text and/or generated audio explicitly delivered to the chat.

Review each provider's own terms and retention settings for your deployment.

## Secrets

Do not commit:

- `ELEVENLABS_API_KEY`;
- `ELEVENLABS_VOICE_ID` when you treat it as private deployment configuration;
- Telegram bot tokens;
- model-provider credentials;
- private proxy URLs containing credentials.

`.env.example` contains placeholders only. Real values belong in environment variables or the host's secret store.

## Conversation data

Do not attach real transcripts, generated audio from private conversations, provider responses, runtime logs, state databases, or backups to public bug reports.

Use a synthetic reproduction with invented names and content.

## Error handling

The reference ElevenLabs adapter consumes provider error bodies but does not echo them into thrown errors. The Telegram adapter does not include the token-bearing request URL in thrown errors.

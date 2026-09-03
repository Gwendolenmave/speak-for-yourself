# Security policy

Speak for Yourself touches model outputs, TTS provider requests, Telegram bot credentials, and user-visible delivery. Security reports deserve a private path and a synthetic reproduction.

## Supported state

The repository is an early source/tutorial candidate. There is no hosted service, npm support commitment, or production SLA. Security fixes are evaluated against the current canonical source state.

## Reporting a vulnerability

Use a private GitHub security advisory on the canonical repository when that facility is available. Otherwise, contact the maintainer through the `Gwendolenmave` GitHub account and ask for a private reporting channel before sending technical details.

Do not open a public issue containing API keys, bot tokens, provider credentials, credential-bearing proxy URLs, real conversation transcripts, generated private audio, provider response bodies, production state databases, logs, backups, or machine paths.

## High-priority classes

Reports are especially important when they involve:

- a secret appearing in an error or log;
- Auto control markers leaking into user-visible or persisted canonical content;
- a second semantic model call occurring on the Expression path unexpectedly;
- Voice/Both delivering content different from the canonical persisted reply;
- a crash causing the agent to regenerate an already-persisted turn;
- Both sending voice before text acknowledgement;
- unsafe Telegram upload handling or unexpected network egress.

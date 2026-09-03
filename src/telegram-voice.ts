const DEFAULT_MAX_ATTEMPTS = 3;

export interface TelegramVoiceSenderOptions {
  botToken: string;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function retryAfterSeconds(body: unknown): number | null {
  if (body === null || typeof body !== "object") return null;
  const parameters = (body as Record<string, unknown>).parameters;
  if (parameters === null || typeof parameters !== "object") return null;
  const value = (parameters as Record<string, unknown>).retry_after;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A small Telegram sendVoice adapter. It never includes the bot token in errors. */
export class TelegramVoiceSender {
  private readonly maxAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TelegramVoiceSenderOptions) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async sendVoice(chatId: number | string, audio: Uint8Array): Promise<void> {
    if (audio.length === 0) throw new Error("Telegram voice upload is empty");

    const url = `https://api.telegram.org/bot${this.options.botToken}/sendVoice`;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set(
        "voice",
        new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }),
        "voice.mp3",
      );

      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: "POST", body: form });
      } catch (error) {
        if (attempt >= this.maxAttempts - 1) {
          throw new Error("Telegram sendVoice failed", {
            cause: error instanceof Error ? error.name : undefined,
          });
        }
        await this.sleep(Math.min(8_000, 500 * 2 ** attempt));
        continue;
      }

      const responseText = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }

      const ok =
        response.ok &&
        parsed !== null &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).ok === true;
      if (ok) return;

      const canRetry = attempt < this.maxAttempts - 1;
      if (response.status === 429 && canRetry) {
        const seconds = retryAfterSeconds(parsed) ?? 2;
        await this.sleep(Math.min(30_000, Math.max(1_000, seconds * 1_000)));
        continue;
      }
      if (response.status >= 500 && canRetry) {
        await this.sleep(Math.min(8_000, 500 * 2 ** attempt));
        continue;
      }

      throw new Error(`Telegram sendVoice HTTP ${response.status}`);
    }
  }
}

export const ELEVENLABS_DIALOGUE_MAX_CHARS = 2_000;
export const ELEVENLABS_EXPRESSION_MODEL = "eleven_v3_conversational";
export const ELEVENLABS_EXPRESSION_OUTPUT_FORMAT = "mp3_44100_128";

export interface ElevenLabsDialogueRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ElevenLabsDialogueOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  languageCode?: string;
  outputFormat?: string;
  maxChars?: number;
  fetchImpl?: typeof fetch;
}

/** Build one Create Dialogue request. The API key exists only in the header. */
export function buildElevenLabsDialogueRequest(params: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
  languageCode?: string;
  outputFormat?: string;
}): ElevenLabsDialogueRequest {
  const voiceId = params.voiceId.trim();
  if (voiceId.length === 0) throw new Error("ElevenLabs voice id is empty");

  const url = new URL("https://api.elevenlabs.io/v1/text-to-dialogue");
  url.searchParams.set(
    "output_format",
    params.outputFormat ?? ELEVENLABS_EXPRESSION_OUTPUT_FORMAT,
  );

  return {
    url: url.toString(),
    headers: {
      "xi-api-key": params.apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      inputs: [{ text: params.text, voice_id: voiceId }],
      model_id: params.modelId ?? ELEVENLABS_EXPRESSION_MODEL,
      language_code: params.languageCode ?? "en",
    }),
  };
}

/** Pure TTS: canonical assistant content in, MP3 bytes out. */
export class ElevenLabsDialogueSynthesizer {
  private readonly fetchImpl: typeof fetch;
  private readonly maxChars: number;

  constructor(private readonly options: ElevenLabsDialogueOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxChars = options.maxChars ?? ELEVENLABS_DIALOGUE_MAX_CHARS;
  }

  async synthesize(text: string): Promise<Uint8Array> {
    if (text.trim().length === 0) throw new Error("ElevenLabs voice text is empty");
    if (text.length > this.maxChars) {
      throw new Error(`ElevenLabs script exceeds the ${this.maxChars}-character bound`);
    }

    const request = buildElevenLabsDialogueRequest({
      apiKey: this.options.apiKey,
      voiceId: this.options.voiceId,
      text,
      ...(this.options.modelId !== undefined ? { modelId: this.options.modelId } : {}),
      ...(this.options.languageCode !== undefined
        ? { languageCode: this.options.languageCode }
        : {}),
      ...(this.options.outputFormat !== undefined
        ? { outputFormat: this.options.outputFormat }
        : {}),
    });

    const response = await this.fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error(`ElevenLabs TTS HTTP ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("ElevenLabs returned empty audio");
    return bytes;
  }
}

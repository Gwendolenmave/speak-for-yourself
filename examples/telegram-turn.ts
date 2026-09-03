import {
  ElevenLabsDialogueSynthesizer,
  TelegramVoiceSender,
  renderExpressionInstruction,
  resolveExpression,
  type ExpressionMode,
  type ResolvedExpression,
} from "../src/index.js";

export interface ExistingAgent {
  generate(input: { userText: string; turnEnhancement?: string }): Promise<string>;
}

export interface CanonicalReplyStore {
  persist(input: {
    turnKey: string;
    content: string;
    expression: ResolvedExpression;
  }): Promise<void>;
}

/**
 * A compact reference handler. For crash recovery and durable outboxes, use
 * docs/PRODUCTION.md rather than treating this in-process example as enough.
 */
export async function handleTelegramTurn(params: {
  turnKey: string;
  chatId: number;
  userText: string;
  mode: ExpressionMode;
  agent: ExistingAgent;
  store: CanonicalReplyStore;
  sendText: (chatId: number, text: string) => Promise<void>;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  telegramBotToken: string;
}): Promise<void> {
  const turnEnhancement = renderExpressionInstruction(params.mode, {
    userName: "the user",
  });
  const rawReply = await params.agent.generate({
    userText: params.userText,
    ...(turnEnhancement !== undefined ? { turnEnhancement } : {}),
  });

  const resolved = resolveExpression(params.mode, rawReply);

  await params.store.persist({
    turnKey: params.turnKey,
    content: resolved.content,
    expression: resolved.expression,
  });

  const synth = new ElevenLabsDialogueSynthesizer({
    apiKey: params.elevenLabsApiKey,
    voiceId: params.elevenLabsVoiceId,
  });
  const telegramVoice = new TelegramVoiceSender({ botToken: params.telegramBotToken });

  if (resolved.expression === "text") {
    await params.sendText(params.chatId, resolved.content);
    return;
  }

  if (resolved.expression === "voice") {
    try {
      const audio = await synth.synthesize(resolved.content);
      await telegramVoice.sendVoice(params.chatId, audio);
    } catch {
      await params.sendText(params.chatId, resolved.content);
    }
    return;
  }

  await params.sendText(params.chatId, resolved.content);
  try {
    const audio = await synth.synthesize(resolved.content);
    await telegramVoice.sendVoice(params.chatId, audio);
  } catch {
    // fail soft: delivered text stands
  }
}

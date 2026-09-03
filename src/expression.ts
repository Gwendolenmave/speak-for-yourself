/**
 * Expression is transport intent for one canonical assistant reply.
 * It never creates a translator, sibling persona, or second semantic reply.
 */

export type ExpressionMode = "auto" | "text" | "voice" | "both";
export type ResolvedExpression = "text" | "voice" | "both";

export const EXPRESSION_MODES: readonly ExpressionMode[] = [
  "auto",
  "text",
  "voice",
  "both",
];

export const EXPRESSION_MARKER_PREFIX = "AGENT_EXPRESSION";

export interface ExpressionInstructionOptions {
  /** Human-readable addressee used only inside the turn-local instruction. */
  userName?: string;
  /** Natural-language instruction for replies that will be spoken. */
  voiceLanguage?: string;
}

export interface ResolveExpressionOptions {
  /**
   * Return true when Voice/Both must fail closed to Text. The default rejects
   * CJK because the reference recipe asks the model to author spoken replies in
   * English. Replace or disable this when your spoken-language contract differs.
   */
  rejectVoiceText?: (text: string) => boolean;
}

export interface ExpressionResolution {
  expression: ResolvedExpression;
  /** The one canonical utterance, with only a valid Auto control marker removed. */
  content: string;
  markerObserved: boolean;
}

const MARKER_PATTERN = /^\[AGENT_EXPRESSION:(text|voice|both)\][ \t]*$/u;
const CJK_RE = /[\u3400-\u9fff]/u;

export function isExpressionMode(value: unknown): value is ExpressionMode {
  return value === "auto" || value === "text" || value === "voice" || value === "both";
}

export function isResolvedExpression(value: unknown): value is ResolvedExpression {
  return value === "text" || value === "voice" || value === "both";
}

export function containsCJK(text: string): boolean {
  return CJK_RE.test(text);
}

/**
 * A turn-local instruction for your existing agent generation.
 *
 * Keep this OUT of a shared/static system prompt when your provider reuses a
 * stateful thread keyed by static prompt bytes. Expression changes per turn;
 * identity does not need to.
 */
export function renderExpressionInstruction(
  mode: ExpressionMode | undefined,
  options: ExpressionInstructionOptions = {},
): string | undefined {
  if (mode === undefined || mode === "text") return undefined;

  const userName = options.userName?.trim() || "the user";
  const voiceLanguage = options.voiceLanguage?.trim() || "natural American English";

  if (mode === "auto") {
    return [
      `You may choose how to express this reply to ${userName}: Text, Voice, or Both.`,
      "Text is your usual medium.",
      "Voice is an intentional choice you make from time to time when you specifically want them to hear what you are saying.",
      "Both is rarer: choose it when what you are saying matters especially and you want them to hear it and keep it.",
      "The choice is yours.",
      `If you choose Voice or Both, compose the reply directly in ${voiceLanguage}; do not translate an already-written reply.`,
      "You may include natural voice-performance directions such as [softly], [laughs], or [sighs] when they belong to what you want to say.",
      "If you choose Voice or Both, the first non-whitespace line must be exactly [AGENT_EXPRESSION:voice] or [AGENT_EXPRESSION:both].",
      "If you choose Text, either omit the marker or begin with [AGENT_EXPRESSION:text].",
      "The marker is host protocol: never mention it or quote it as conversation content.",
    ].join(" ");
  }

  const medium = mode === "voice" ? "your voice" : "both text and your voice";
  return [
    `This reply will be delivered as ${medium}.`,
    `Write the whole reply directly in ${voiceLanguage}, exactly as you would say it aloud.`,
    "Do not translate a separately authored reply.",
    "You may include natural voice-performance directions such as [softly], [laughs], or [sighs] when they belong to what you want to say.",
  ].join(" ");
}

/**
 * Resolve a requested mode against the one reply your agent already produced.
 *
 * - explicit Text never needs a marker;
 * - explicit Voice/Both can fail closed through the voice guard;
 * - Auto only trusts a marker on the first non-whitespace line;
 * - missing/malformed markers become Text without regeneration;
 * - performance directions stay inside canonical content byte-for-byte.
 */
export function resolveExpression(
  requested: ExpressionMode,
  rawReply: string,
  options: ResolveExpressionOptions = {},
): ExpressionResolution {
  const rejectVoiceText = options.rejectVoiceText ?? containsCJK;

  if (requested !== "auto") {
    if (requested === "text") {
      return { expression: "text", content: rawReply, markerObserved: false };
    }
    if (rejectVoiceText(rawReply)) {
      return { expression: "text", content: rawReply, markerObserved: false };
    }
    return { expression: requested, content: rawReply, markerObserved: false };
  }

  const lines = rawReply.split("\n");
  let markerLineIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trim().length > 0) {
      markerLineIndex = index;
      break;
    }
  }

  const markerLine = markerLineIndex >= 0 ? (lines[markerLineIndex] ?? "").trim() : "";
  const match = MARKER_PATTERN.exec(markerLine);
  if (match === null) {
    return { expression: "text", content: rawReply, markerObserved: false };
  }

  const chosen = match[1] as ResolvedExpression;
  const content = lines
    .slice(markerLineIndex + 1)
    .join("\n")
    .replace(/^\r?\n+/u, "");

  if (chosen === "text") {
    return { expression: "text", content, markerObserved: true };
  }

  if (content.trim().length === 0 || rejectVoiceText(content)) {
    return { expression: "text", content, markerObserved: true };
  }

  return { expression: chosen, content, markerObserved: true };
}

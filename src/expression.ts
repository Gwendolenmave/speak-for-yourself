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
  /** The one canonical utterance, with a valid leading control marker removed. */
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

/** Parse only a valid marker on the first non-whitespace line. */
function parseLeadingExpressionMarker(
  rawReply: string,
): { chosen: ResolvedExpression; content: string } | null {
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
  if (match === null) return null;

  return {
    chosen: match[1] as ResolvedExpression,
    content: lines
      .slice(markerLineIndex + 1)
      .join("\n")
      .replace(/^\r?\n+/u, ""),
  };
}

/**
 * Resolve a requested mode against the one reply your agent already produced.
 *
 * - forced Text/Voice/Both remains host authority;
 * - a valid accidental leading marker is stripped even in forced modes;
 * - explicit Voice/Both can fail closed through the voice guard;
 * - Auto only trusts a marker on the first non-whitespace line;
 * - missing/malformed Auto markers become Text without regeneration;
 * - performance directions stay inside canonical content byte-for-byte.
 */
export function resolveExpression(
  requested: ExpressionMode,
  rawReply: string,
  options: ResolveExpressionOptions = {},
): ExpressionResolution {
  const rejectVoiceText = options.rejectVoiceText ?? containsCJK;
  const marker = parseLeadingExpressionMarker(rawReply);

  if (requested !== "auto") {
    // Forced mode is host authority. If the model accidentally emits a valid
    // Expression marker anyway, strip the reserved protocol line but never
    // let it override the requested mode.
    const content = marker?.content ?? rawReply;
    const markerObserved = marker !== null;
    if (requested === "text") {
      return { expression: "text", content, markerObserved };
    }
    if (rejectVoiceText(content)) {
      return { expression: "text", content, markerObserved };
    }
    return { expression: requested, content, markerObserved };
  }

  if (marker === null) {
    return { expression: "text", content: rawReply, markerObserved: false };
  }

  if (marker.chosen === "text") {
    return { expression: "text", content: marker.content, markerObserved: true };
  }

  if (marker.content.trim().length === 0 || rejectVoiceText(marker.content)) {
    return { expression: "text", content: marker.content, markerObserved: true };
  }

  return { expression: marker.chosen, content: marker.content, markerObserved: true };
}

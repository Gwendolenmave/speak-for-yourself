import {
  renderExpressionInstruction,
  resolveExpression,
  type ExpressionMode,
} from "../src/index.js";

/** Replace this with your existing agent/provider call. */
async function existingAgentGenerate(input: {
  userText: string;
  turnEnhancement?: string;
}): Promise<string> {
  void input;
  return [
    "[AGENT_EXPRESSION:voice]",
    "[laughs] You absolutely did that on purpose. Come here.",
  ].join("\n");
}

const mode: ExpressionMode = "auto";
const turnEnhancement = renderExpressionInstruction(mode, { userName: "Atalanta" });
const rawReply = await existingAgentGenerate({
  userText: "I knew that would make you laugh.",
  ...(turnEnhancement !== undefined ? { turnEnhancement } : {}),
});

const reply = resolveExpression(mode, rawReply);
console.log(reply);

import assert from "node:assert/strict";
import test from "node:test";
import {
  renderExpressionInstruction,
  resolveExpression,
} from "../src/expression.js";

test("Text preserves canonical content byte-for-byte", () => {
  assert.deepEqual(resolveExpression("text", "普通回复。"), {
    expression: "text",
    content: "普通回复。",
    markerObserved: false,
  });
});

test("explicit Voice preserves performance directions", () => {
  assert.deepEqual(resolveExpression("voice", "[softly] I know."), {
    expression: "voice",
    content: "[softly] I know.",
    markerObserved: false,
  });
});

test("Auto strips a valid first non-whitespace marker", () => {
  assert.deepEqual(
    resolveExpression("auto", "\n[AGENT_EXPRESSION:voice]\n[laughs] You knew."),
    {
      expression: "voice",
      content: "[laughs] You knew.",
      markerObserved: true,
    },
  );
});

test("Auto with no marker fails closed to Text without rewriting", () => {
  assert.deepEqual(resolveExpression("auto", "No marker here."), {
    expression: "text",
    content: "No marker here.",
    markerObserved: false,
  });
});

test("a marker after real content is not control protocol", () => {
  const raw = "Real content first.\n[AGENT_EXPRESSION:voice]";
  assert.deepEqual(resolveExpression("auto", raw), {
    expression: "text",
    content: raw,
    markerObserved: false,
  });
});

test("English reference guard downgrades CJK Voice/Both to Text", () => {
  assert.equal(resolveExpression("voice", "过来。 ").expression, "text");
  assert.equal(
    resolveExpression("auto", "[AGENT_EXPRESSION:both]\n过来。 ").expression,
    "text",
  );
});

test("the voice guard can be replaced for another spoken-language contract", () => {
  assert.equal(
    resolveExpression("voice", "过来。", { rejectVoiceText: () => false }).expression,
    "voice",
  );
});

test("turn-local Auto instruction explains choice without a second model", () => {
  const instruction = renderExpressionInstruction("auto", { userName: "Atalanta" }) ?? "";
  assert.match(instruction, /Text is your usual medium/u);
  assert.match(instruction, /Both is rarer/u);
  assert.match(instruction, /compose the reply directly/u);
  assert.match(instruction, /AGENT_EXPRESSION:voice/u);
});

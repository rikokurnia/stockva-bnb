import test from "node:test";
import assert from "node:assert/strict";

function computeProgressFormat(percent, totalSeconds = 7) {
  const filled = Math.min(10, Math.max(0, Math.round(percent / 10)));
  const empty = 10 - filled;
  const blocks = `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  const formatText =
    percent >= 100
      ? `${blocks} 100% Completed!`
      : `${blocks} ${percent}% · ${totalSeconds}s`;
  return { blocks, formatText };
}

function computeConstructionState(percent, isConfirmingOnchain = false) {
  if (percent >= 100) return "100% Completed!";
  if (isConfirmingOnchain) return "Confirming transaction...";
  if (percent >= 35) return "Constructing city...";
  return "Drafting Site...";
}

test("1.3 Construction progress bar exact format: [████████░░] 78% · 7s", () => {
  const result78 = computeProgressFormat(78, 7);
  assert.equal(result78.blocks, "[████████░░]");
  assert.equal(result78.formatText, "[████████░░] 78% · 7s");

  const result0 = computeProgressFormat(0, 7);
  assert.equal(result0.blocks, "[░░░░░░░░░░]");
  assert.equal(result0.formatText, "[░░░░░░░░░░] 0% · 7s");

  const result50 = computeProgressFormat(50, 7);
  assert.equal(result50.blocks, "[█████░░░░░]");
  assert.equal(result50.formatText, "[█████░░░░░] 50% · 7s");

  const result100 = computeProgressFormat(100, 7);
  assert.equal(result100.blocks, "[██████████]");
  assert.equal(result100.formatText, "[██████████] 100% Completed!");
});

test("Construction states progress correctly: Drafting Site -> Constructing city -> 100% Completed!", () => {
  assert.equal(computeConstructionState(0), "Drafting Site...");
  assert.equal(computeConstructionState(20), "Drafting Site...");
  assert.equal(computeConstructionState(34), "Drafting Site...");
  assert.equal(computeConstructionState(35), "Constructing city...");
  assert.equal(computeConstructionState(78), "Constructing city...");
  assert.equal(computeConstructionState(99), "Constructing city...");
  assert.equal(computeConstructionState(100), "100% Completed!");

  // Actual pending confirmation has a separate label from visual city construction
  assert.equal(computeConstructionState(10, true), "Confirming transaction...");
});

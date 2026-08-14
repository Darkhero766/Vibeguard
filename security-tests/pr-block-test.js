// VibeGuard PR protection test fixture.
// This intentionally contains an unsafe pattern so the protection scanner
// should report a NEW finding on this PR. Do not merge this file.
function evaluateUserExpression(userInput) {
  return eval(userInput);
}

module.exports = { evaluateUserExpression };

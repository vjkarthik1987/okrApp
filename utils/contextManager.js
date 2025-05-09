// File: utils/contextManager.js
function saveContext(req, ctx) {
  if (req.session) req.session.assistantContext = ctx;
}
function getContext(req) {
  return req.session?.assistantContext || null;
}
function clearContext(req) {
  if (req.session) req.session.assistantContext = null;
}
module.exports = { saveContext, getContext, clearContext };

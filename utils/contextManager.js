// File: utils/contextManager.js

function saveContext(req, context) {
    if (!req.session) return;
    req.session.lastAssistantContext = {
      model: context.model || null,
      filters: context.filters || {},
      timeframe: context.timeframe || null,
      timestamp: new Date()
    };
  }
  
  function getContext(req) {
    return req.session?.lastAssistantContext || null;
  }
  
  function clearContext(req) {
    if (req.session) {
      req.session.lastAssistantContext = null;
    }
  }
  
  module.exports = { saveContext, getContext, clearContext };
  
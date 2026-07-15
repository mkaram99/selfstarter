const db = require('./db');

const API_KEY = 'anthropic_api_key';
const MODEL_KEY = 'anthropic_model';

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fast & cheap', recommended: true },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 — more detailed, costs more' },
];
const DEFAULT_MODEL = MODELS[0].id;

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
const delStmt = db.prepare('DELETE FROM settings WHERE key = ?');

function getApiKey() {
  return getStmt.get(API_KEY)?.value || null;
}

function setApiKey(value) {
  if (value) setStmt.run(API_KEY, value);
  else delStmt.run(API_KEY);
}

function getModel() {
  return getStmt.get(MODEL_KEY)?.value || DEFAULT_MODEL;
}

function setModel(value) {
  setStmt.run(MODEL_KEY, value);
}

module.exports = { MODELS, DEFAULT_MODEL, getApiKey, setApiKey, getModel, setModel };

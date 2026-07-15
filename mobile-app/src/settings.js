import * as SecureStore from 'expo-secure-store';

const API_KEY_STORE_KEY = 'anthropic_api_key';
const MODEL_STORE_KEY = 'anthropic_model';

export const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fast & cheap', recommended: true },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 — more detailed, costs more' },
];

export const DEFAULT_MODEL = MODELS[0].id;

export async function getApiKey() {
  return SecureStore.getItemAsync(API_KEY_STORE_KEY);
}

export async function setApiKey(value) {
  if (value) {
    await SecureStore.setItemAsync(API_KEY_STORE_KEY, value);
  } else {
    await SecureStore.deleteItemAsync(API_KEY_STORE_KEY);
  }
}

export async function getModel() {
  const value = await SecureStore.getItemAsync(MODEL_STORE_KEY);
  return value || DEFAULT_MODEL;
}

export async function setModel(value) {
  await SecureStore.setItemAsync(MODEL_STORE_KEY, value);
}

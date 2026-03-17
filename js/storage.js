const KEY = 'buddyState';

export function saveState(state) {
  return chrome.storage.local.set({ [KEY]: state });
}

export function loadState() {
  return chrome.storage.local.get(KEY).then(result => result[KEY] ?? null);
}

export function clearState() {
  return chrome.storage.local.remove(KEY);
}

const PREFIX = 'l8secure:';

export async function getItemAsync(key) {
  try {
    return globalThis.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key, value) {
  try {
    globalThis.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}

export async function deleteItemAsync(key) {
  try {
    globalThis.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export async function isAvailableAsync() {
  return true;
}

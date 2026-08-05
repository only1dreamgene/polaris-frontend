'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'polaris.adminKey';

/** Session-only (sessionStorage, not localStorage) admin API key entry — never sent anywhere but this app's own backend, never persisted past the browser tab closing. */
export function useAdminKey() {
  const [adminKey, setAdminKey] = useState('');

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) setAdminKey(stored);
  }, []);

  function update(key: string) {
    setAdminKey(key);
    window.sessionStorage.setItem(STORAGE_KEY, key);
  }

  return { adminKey, setAdminKey: update };
}

type Store = { getItemAsync: (key: string) => Promise<string | null>; setItemAsync: (key: string, value: string) => Promise<void>; deleteItemAsync: (key: string) => Promise<void> };
// Split session values into small Keychain/Keystore entries; publish the manifest last.
export function secureSessionStorage(store: Store) {
  async function parts(key: string) {
    const raw = await store.getItemAsync(`${key}.manifest`);
    if (!raw) return null;
    const value = JSON.parse(raw) as { version: string; count: number };
    if (!/^[0-9a-z-]+$/.test(value.version) || !Number.isInteger(value.count) || value.count < 1 || value.count > 128) throw new Error('Invalid secure session manifest');
    return value;
  }
  async function clean(key: string, value: Awaited<ReturnType<typeof parts>>) {
    if (value) for (let i = 0; i < value.count; i++) await store.deleteItemAsync(`${key}.${value.version}.${i}`);
  }
  return {
    async getItem(key: string) {
      const value = await parts(key); if (!value) return null;
      const chunks = await Promise.all(Array.from({ length: value.count }, (_, i) => store.getItemAsync(`${key}.${value.version}.${i}`)));
      if (chunks.some(chunk => chunk === null)) throw new Error('Secure session is incomplete');
      return chunks.join('');
    },
    async setItem(key: string, text: string) {
      if (text.length > 64000) throw new Error('Secure session exceeds storage limit');
      const old = await parts(key);
      const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const points = Array.from(text); // Never split an emoji surrogate pair across native values.
      const chunks: string[] = [];
      for (let i = 0; i < points.length; i += 500) chunks.push(points.slice(i, i + 500).join(''));
      if (!chunks.length) chunks.push('');
      for (let i = 0; i < chunks.length; i++) await store.setItemAsync(`${key}.${version}.${i}`, chunks[i]);
      await store.setItemAsync(`${key}.manifest`, JSON.stringify({ version, count: chunks.length }));
      await clean(key, old).catch(() => {});
    },
    async removeItem(key: string) {
      const old = await parts(key);
      await store.deleteItemAsync(`${key}.manifest`);
      await clean(key, old);
    },
  };
}

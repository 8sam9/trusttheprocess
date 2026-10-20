// Shared jest setup. The device store behind the gate cache is replaced by an in-memory Storage, because the
// real one is expo-sqlite's localStorage (native) or the browser's (web).
jest.mock('@/lib/authStorage', () => {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
  return { authStorage: storage };
});

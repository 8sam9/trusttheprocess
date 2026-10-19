// Native: persist the session with expo-sqlite's localStorage implementation.
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;

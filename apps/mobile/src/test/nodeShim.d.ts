// Minimal Node typings for architecture tests that scan the source tree (the app does not depend on @types/node).
declare module 'node:fs' {
  interface Dirent {
    name: string;
    isDirectory(): boolean;
  }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}

declare const __dirname: string;

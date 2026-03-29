/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_MODE?: "mock" | "tauri";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

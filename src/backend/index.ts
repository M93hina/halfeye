import { MockBackend } from "./mockBackend";
import { TauriBackend } from "./tauriBackend";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const backend = isTauri ? new TauriBackend() : new MockBackend();

export const backendModeLabel =
  backend.kind === "tauri" ? "Tauri連携" : "モック連携";

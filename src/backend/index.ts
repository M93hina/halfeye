import { MockBackend } from "./mockBackend";
import { TauriBackend } from "./tauriBackend";

const requestedMode =
  import.meta.env.VITE_BACKEND_MODE === "tauri" ? "tauri" : "mock";

export const backend =
  requestedMode === "tauri" ? new TauriBackend() : new MockBackend();

export const backendModeLabel =
  backend.kind === "tauri" ? "Tauri連携" : "モック連携";

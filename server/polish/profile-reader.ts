import type { ProfileDocument } from "../../shared/document";
import type { SettingsState } from "../settings-watch";

// Reads the saved profile (Chat Polish's preferences live in the active layout's `chat`).
export interface ProfileReader {
  read(): Promise<SettingsState<ProfileDocument>>;
}

import { createValueStore } from "./profile-store";

// Whether Morphise's sidebar view has been shown in this app since it started. Paseo picks the
// active sidebar view in its own settings and tells plugins nothing, so this is the only sign
// that the view is in use.
export const viewPresence = createValueStore<boolean>(false);

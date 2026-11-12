import type { PolishPart } from "./context";
import { IMAGES_ROW_KIND, imagesSchema } from "./media/image-rows";
import { clearImageCache } from "./media/images";
import { ImagesItem } from "./media/views";
import { setStackMode, stackImages } from "./media/web/image-stacks";
import { styleStackCards } from "./media/web/stack-cards";
import { currentPrefs, subscribePrefs } from "./prefs";
import type { Prefs } from "../../shared/polish/prefs";

// Images (ported from Chat Polish, see NOTICE.md): the image-only reply row as thumbnails, and on
// web, stacks of images in replies Paseo draws itself. The rows part turns image-only replies into
// IMAGES_ROW_KIND rows (imageRowData); the stack viewer shows through StackViewerHost (views.tsx),
// which an always-mounted component mounts. Returns cleanup.

// Like Chat Polish, stacks in Paseo's own replies need Restyle (their sizes and colours are its variables).
const stackMode = (prefs: Prefs) => (prefs.images !== "native" && prefs.nativeStyle === "design" && prefs.imageStacks === "on" ? prefs.imageStackOpen : undefined);

export const registerMedia: PolishPart = ({ client }) => {
  const stopRenderer = client.addTimelineRenderer({ kind: IMAGES_ROW_KIND, version: 1, schema: imagesSchema, Component: ImagesItem });
  const unstyle = styleStackCards();
  const unstack = stackImages();
  const follow = () => setStackMode(stackMode(currentPrefs()));
  follow();
  const unsubscribe = subscribePrefs(follow);
  return () => {
    unsubscribe();
    setStackMode(undefined);
    unstack();
    unstyle();
    void stopRenderer();
    clearImageCache();
  };
};

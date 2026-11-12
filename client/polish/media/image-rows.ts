// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): imageData and imagesSchema in client/model.ts
import { z } from "zod";
import { translate, type Language } from "../../../shared/polish/i18n";
import { currentLanguage } from "../i18n";
import { currentPrefs } from "../prefs";

// The image-only reply row: its timeline kind, and its data for an assistant reply that is only
// images (undefined for any other reply). The rows part calls imageRowData from the
// assistant_message transformer; registerMedia draws the row.
export const IMAGES_ROW_KIND = "polish-images";

export const imagesSchema = z.object({ images: z.array(z.object({ alt: z.string(), url: z.string() })) });
export type ImagesRow = z.output<typeof imagesSchema>;

const IMAGE_MD = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Images of an assistant message that is nothing but image markdown; mixed messages stay native. */
export function imagesOf(text: string, language: Language = "en"): ImagesRow | undefined {
  if (text.replace(IMAGE_MD, "").trim()) return undefined;
  const images = [...text.matchAll(IMAGE_MD)].map((m) => ({ alt: m[1] || translate(language, "chat.image"), url: m[2]! }));
  return images.length ? { images } : undefined;
}

/** The row's data, or undefined while Images is Paseo's own ("native") or the reply has text. */
export function imageRowData(text: string, language: Language = currentLanguage()): Record<string, unknown> | undefined {
  if (currentPrefs().images === "native") return undefined;
  return imagesOf(text, language);
}

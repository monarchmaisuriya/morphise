import { Platform } from "react-native";

// The only module that touches the DOM. This plugin typechecks without the DOM library, so it
// declares just what it uses. On iOS and Android there is no DOM and nothing is applied.
interface StyleElement {
  id: string;
  textContent: string | null;
  remove(): void;
}
declare const document: {
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: StyleElement): unknown };
};

export function applyStyleSheet(css: string): () => void {
  if (Platform.OS !== "web" || css === "") return () => {};
  const element = document.createElement("style");
  element.id = "morphise-style";
  element.textContent = css;
  document.head.appendChild(element);
  return () => element.remove();
}

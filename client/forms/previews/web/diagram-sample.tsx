// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/dashboard/rich-preview.tsx (DiagramSample)
// The sample reply's diagram, drawn in a frame the way chats draw theirs: Paseo's mermaid document, or Pele's bridge
// (which the restyle answers from the daemon). Web and desktop only.
import type { PluginTheme } from "@getpaseo/plugin";
import { createElement, useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { diagramDoc, drawDiagram } from "../../../polish/web/mermaid";
import { alpha, sunken } from "../../../polish/rows/row";
import { SAMPLE_DIAGRAM } from "../samples";

function DiagramFrame({ theme, pele }: { theme: PluginTheme; pele: boolean }) {
  const c = theme.colors;
  const [frame, setFrame] = useState<unknown>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // Paseo's mermaid document is known only once a chat in this window has drawn a diagram (Morphise does not load
  // Paseo's scripts itself).
  const doc = diagramDoc(pele);
  const key = `${pele}:${Object.values(c).join()}`;
  useEffect(() => {
    setSize(null);
    setFailed(false);
  }, [key]);
  useEffect(() => (frame ? drawDiagram(frame, SAMPLE_DIAGRAM, (drawn) => (drawn ? setSize(drawn) : setFailed(true))) : undefined), [frame]);
  const note = failed ? "The sample diagram could not be drawn." : doc ? null : "The diagram sample shows once a chat in this window has drawn a diagram.";
  return (
    <View style={{ padding: 12, borderRadius: 8, backgroundColor: sunken(c.surface0), borderWidth: 1, borderColor: alpha(c.border, 0.6), alignItems: "center" }}>
      {note ? (
        <Text style={{ color: c.foregroundMuted, fontSize: 12, paddingVertical: 24 }}>{note}</Text>
      ) : (
        createElement("iframe", {
          key,
          ref: setFrame,
          title: "Sample diagram",
          sandbox: "allow-scripts",
          srcDoc: doc,
          style: { display: "block", border: 0, width: "100%", pointerEvents: "none", background: "transparent", ...(size ? { maxWidth: size.width, aspectRatio: `${size.width} / ${size.height}` } : { height: 120, opacity: 0 }) },
        })
      )}
    </View>
  );
}

export const DiagramSample = Platform.OS === "web" ? DiagramFrame : null;

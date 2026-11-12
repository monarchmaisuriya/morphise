// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): index.client.tsx
import type { PolishPart } from "./context";
import { cancelQueuedReplies, SIDE_CHAT_PANEL_ID } from "./selection/actions";
import { SideChatPanel } from "./selection/side-chat-panel";
import { installSelectionBar } from "./selection/web/bar";

// The bar over text selected in a chat (web and desktop), and the panel its side chats open in.
// The panel stays registered whatever the bar's settings, so side chats already open keep working.
export const registerSelection: PolishPart = ({ client, bookmarkPassage }) => {
  const removePanel = client.addAgentPanel({ id: SIDE_CHAT_PANEL_ID, title: "Side chat", icon: "MessagesSquare", locations: ["explorer", "workspace"], Component: SideChatPanel });
  const removeBar = installSelectionBar({ client, bookmarkPassage });
  return () => {
    removeBar();
    removePanel();
    cancelQueuedReplies();
  };
};

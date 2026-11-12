// The steps card's preview (General tab): the real card (client/steps-card.tsx) drawn with a sample plan, where the
// options put it.
import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import { type StepsSettings, stepsOptions } from "../../../shared/steps";
import { StepsCardView } from "../../steps-card";
import { useTokens } from "../../ui/kit";
import { stepsPlacement } from "./helpers";
import { PREVIEW_FRAME, PreviewNote } from "./parts";
import { SAMPLE_STEPS } from "./samples";

const SAMPLE_PLAN = { status: "ready" as const, steps: SAMPLE_STEPS, latestAt: null, finishedAt: null };

export function StepsCardPreview({ theme, steps, compact = false }: { theme: PluginTheme; steps: StepsSettings | undefined; compact?: boolean }) {
  const t = useTokens(theme, compact);
  const options = stepsOptions(steps);
  const place = stepsPlacement(options);
  // The card reads "start folded" once, when it mounts.
  const card = <StepsCardView key={JSON.stringify(options)} plan={SAMPLE_PLAN} t={t} options={options} title={place.title} inline={place.inline} />;
  // Drawn on a sample of where it goes (a chat, or the sidebar), on the page colour, so the card
  // never sits as a card inside the settings card.
  return (
    <View style={{ ...PREVIEW_FRAME, gap: 10 }}>
      <PreviewNote theme={theme} text={place.label} />
      {place.inline ? (
        <View style={{ padding: 14, gap: 10, borderRadius: 10, backgroundColor: theme.colors.surface0 }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foregroundMuted }}>I'll move the auth checks into one middleware, then run the tests.</Text>
          {card}
        </View>
      ) : (
        <View style={{ width: compact ? "100%" : 280, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.surface0 }}>{card}</View>
      )}
    </View>
  );
}

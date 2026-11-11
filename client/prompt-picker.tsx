import { useComposer } from "@getpaseo/plugin/client";
import { Combobox } from "@getpaseo/plugin/client/ui";
import type { Prompt } from "../shared/document";
import { searchPrompts } from "../shared/prompt-search";

const PREVIEW_LENGTH = 80;

// A composer search box over the saved prompts; choosing one inserts its text at the cursor.
export function createPromptPicker(prompts: readonly Prompt[]) {
  return function MorphisePromptPicker() {
    const composer = useComposer();
    return (
      <Combobox
        title="Prompts"
        icon="Library"
        value={null}
        search={async ({ query }) =>
          searchPrompts(prompts, query).map((prompt) => ({
            id: prompt.id,
            label: prompt.starred ? `★ ${prompt.title}` : prompt.title,
            description: prompt.text.length > PREVIEW_LENGTH ? `${prompt.text.slice(0, PREVIEW_LENGTH)}…` : prompt.text,
          }))
        }
        onSelect={async ({ item }) => {
          const prompt = prompts.find((candidate) => candidate.id === item.id);
          if (!prompt) return;
          composer.insertText(prompt.text);
          await composer.focus();
        }}
      />
    );
  };
}

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { STATUS_TITLES } from "../../shared/arrange";
import { slug, type TaskOperation } from "../../shared/task-ops";
import { RULE_STATUSES, type Rule, type TaskDocument } from "../../shared/tasks";
import { useValue } from "../profile-store";
import { tasksOf } from "../task-store";
import type { BoardDeps } from "./deps";
import { boardStyles } from "./styles";

const COLORS = ["#8f8cf2", "#4fb3a9", "#e0a84f", "#e06c75", "#61afef", "#98c379", "#c678dd", "#8b8ca3"];

type RuleStatus = Extract<Rule["when"], { kind: "chat-status" }>["status"];

function describeRule(rule: Rule, document: TaskDocument): string {
  const when = rule.when.kind === "chat-status" ? `When a linked chat is "${STATUS_TITLES[rule.when.status]}"` : "When a card enters Done";
  const target = rule.then;
  const then = target.kind === "move" ? `move it to ${document.columns.find((column) => column.id === target.column)?.name ?? "?"}` : "clear its reminder";
  return `${when}, ${then}`;
}

// A text box that keeps what is typed and saves it when focus leaves or Enter is pressed. A
// refused value (its reason shows as a toast) puts the saved value back.
function CommitInput({ value, onCommit, label, placeholder, style, theme, numeric }: { value: string; onCommit(text: string): Promise<boolean> | false; label: string; placeholder?: string; style: object; theme: PluginTheme; numeric?: boolean }) {
  const [text, setText] = useState(value);
  const commit = () => {
    if (text.trim() === value) return;
    void Promise.resolve(onCommit(text.trim())).then((saved) => {
      if (!saved) setText(value);
    });
  };
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.foregroundMuted}
      value={text}
      onChangeText={(next) => setText(numeric ? next.replace(/[^0-9]/g, "") : next)}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType={numeric ? "number-pad" : "default"}
      style={style}
    />
  );
}

// Columns, labels, automation rules and auto-archiving, each change saved at once.
export function CustomiseBoard({ deps, theme, compact, onClose }: { deps: BoardDeps; theme: PluginTheme; compact: boolean; onClose(): void }) {
  const document = tasksOf(useValue(deps.tasks));
  const styles = useMemo(() => boardStyles(theme, compact), [theme, compact]);
  // Errors show as toasts: a message at the bottom of this long dialog is off screen on a phone.
  const toast = useToast();
  const [newColumn, setNewColumn] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [ruleWhen, setRuleWhen] = useState<string>("needs_input");
  const [ruleThen, setRuleThen] = useState<string>(document.columns.find((column) => column.id === "review")?.id ?? document.columns[0].id);

  const run = (...operations: TaskOperation[]): Promise<boolean> =>
    deps.apply(...operations).then(
      () => true,
      (caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : String(caught));
        return false;
      },
    );
  const icon = (name: string, label: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{ padding: 6, opacity: disabled ? 0.3 : 1 }}>
      <Icon name={name} size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
  const colorDots = (current: string | undefined, onPick: (color: string) => void) => (
    <View style={styles.row}>
      {COLORS.map((color) => (
        <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Colour ${color}`} onPress={() => onPick(color)} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, borderWidth: current === color ? 2 : 0, borderColor: theme.colors.foreground }} />
      ))}
    </View>
  );

  return (
    <Modal title="Customise board" open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 10 }}>
        <Text style={styles.section}>Columns</Text>
        {document.columns.map((column, index) => (
          <View key={column.id} style={[styles.listRow, { flexWrap: "wrap" }]}>
            <CommitInput
              key={`${column.id}:${column.name}`}
              label={`Name of ${column.name}`}
              value={column.name}
              onCommit={(name) => !!name && run({ kind: "updateColumn", id: column.id, patch: { name } })}
              style={[styles.input, { minWidth: 120 }]}
              theme={theme}
            />
            <CommitInput
              key={`${column.id}:wip:${column.wipLimit}`}
              label={`Work in progress limit for ${column.name}`}
              placeholder="No limit"
              value={column.wipLimit === null ? "" : String(column.wipLimit)}
              onCommit={(text) => run({ kind: "updateColumn", id: column.id, patch: { wipLimit: text === "" ? null : Number(text) } })}
              style={styles.smallInput}
              theme={theme}
              numeric
            />
            {colorDots(column.color, (color) => run({ kind: "updateColumn", id: column.id, patch: { color } }))}
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: column.done }} accessibilityLabel={`${column.name} is the Done column`} onPress={() => run({ kind: "setDoneColumn", id: column.id })} style={[styles.chip, column.done ? styles.chipOn : null]}>
              <Text style={column.done ? styles.chipTextOn : styles.chipText}>Done</Text>
            </Pressable>
            {icon("ChevronLeft", `Move ${column.name} left`, () => run({ kind: "moveColumn", id: column.id, by: -1 }), index === 0)}
            {icon("ChevronRight", `Move ${column.name} right`, () => run({ kind: "moveColumn", id: column.id, by: 1 }), index === document.columns.length - 1)}
            {icon("Trash2", `Delete ${column.name}; its cards move to the first column`, () => run({ kind: "deleteColumn", id: column.id }), column.done)}
          </View>
        ))}
        <View style={styles.row}>
          <TextInput accessibilityLabel="New column name" placeholder="New column" placeholderTextColor={theme.colors.foregroundMuted} value={newColumn} onChangeText={setNewColumn} style={styles.input} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add column"
            disabled={!newColumn.trim()}
            onPress={() => {
              const name = newColumn.trim();
              const taken = document.columns.map((column) => column.id);
              let id = slug(name, "column");
              while (taken.includes(id)) id = `${id}-2`;
              run({ kind: "addColumn", column: { id, name } });
              setNewColumn("");
            }}
            style={[styles.primary, !newColumn.trim() ? styles.disabled : null]}
          >
            <Text style={styles.primaryText}>Add column</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>A work in progress limit turns the column's count red when it holds more cards.</Text>

        <Text style={styles.section}>Labels</Text>
        {document.labels.length === 0 ? <Text style={styles.muted}>No labels yet. Add one here, in a card, or type @label in quick add.</Text> : null}
        {document.labels.map((label) => (
          <View key={label.id} style={styles.listRow}>
            <CommitInput
              key={`${label.id}:${label.name}`}
              label={`Name of label ${label.name}`}
              value={label.name}
              onCommit={(name) => !!name && run({ kind: "saveLabel", label: { ...label, name } })}
              style={[styles.input, { minWidth: 120 }]}
              theme={theme}
            />
            {colorDots(label.color, (color) => run({ kind: "saveLabel", label: { ...label, color } }))}
            {icon("Trash2", `Delete label ${label.name}`, () => run({ kind: "deleteLabel", id: label.id }))}
          </View>
        ))}
        <View style={styles.row}>
          <TextInput accessibilityLabel="New label name" placeholder="New label" placeholderTextColor={theme.colors.foregroundMuted} value={newLabel} onChangeText={setNewLabel} style={styles.input} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add label"
            disabled={!newLabel.trim()}
            onPress={() => {
              const name = newLabel.trim();
              const taken = document.labels.map((label) => label.id);
              let id = slug(name, "label");
              while (taken.includes(id)) id = `${id}-2`;
              run({ kind: "saveLabel", label: { id, name, color: COLORS[document.labels.length % COLORS.length] } });
              setNewLabel("");
            }}
            style={[styles.primary, !newLabel.trim() ? styles.disabled : null]}
          >
            <Text style={styles.primaryText}>Add label</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Automations</Text>
        <Text style={styles.muted}>Rules run while any of your Paseo apps is open, and react when a linked chat changes status.</Text>
        {document.rules.map((rule) => (
          <View key={rule.id} style={styles.listRow}>
            <Switch value={rule.enabled} onValueChange={(enabled) => void run({ kind: "saveRule", rule: { ...rule, enabled } })} />
            <Text style={styles.listTitle}>{describeRule(rule, document)}</Text>
            {icon("Trash2", "Delete rule", () => run({ kind: "deleteRule", id: rule.id }))}
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.muted}>When</Text>
          {[...RULE_STATUSES.map((status) => ({ id: status, label: `chat: ${STATUS_TITLES[status]}` })), { id: "enters-done", label: "card enters Done" }].map((option) => (
            <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: ruleWhen === option.id }} accessibilityLabel={option.label} onPress={() => setRuleWhen(option.id)} style={[styles.chip, ruleWhen === option.id ? styles.chipOn : null]}>
              <Text style={ruleWhen === option.id ? styles.chipTextOn : styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Then</Text>
          {ruleWhen === "enters-done" ? (
            <Text style={styles.muted}>clear its reminder</Text>
          ) : (
            document.columns.map((column) => (
              <Pressable key={column.id} accessibilityRole="radio" accessibilityState={{ checked: ruleThen === column.id }} accessibilityLabel={`move to ${column.name}`} onPress={() => setRuleThen(column.id)} style={[styles.chip, ruleThen === column.id ? styles.chipOn : null]}>
                <Text style={ruleThen === column.id ? styles.chipTextOn : styles.chipText}>move to {column.name}</Text>
              </Pressable>
            ))
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add rule"
            onPress={() =>
              run({
                kind: "saveRule",
                rule:
                  ruleWhen === "enters-done"
                    ? { id: `rule-${Date.now().toString(36)}`, enabled: true, when: { kind: "enters-done" }, then: { kind: "clear-reminder" } }
                    : { id: `rule-${Date.now().toString(36)}`, enabled: true, when: { kind: "chat-status", status: ruleWhen as RuleStatus }, then: { kind: "move", column: ruleThen } },
              })
            }
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Add rule</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Archive</Text>
        <View style={styles.listRow}>
          <Switch value={document.archiveDone.enabled} onValueChange={(enabled) => void run({ kind: "setArchiveDone", enabled, days: document.archiveDone.days })} />
          <Text style={styles.listTitle}>Archive Done cards after</Text>
          <CommitInput
            key={`days:${document.archiveDone.days}`}
            label="Days before Done cards are archived"
            value={String(document.archiveDone.days)}
            onCommit={(text) => run({ kind: "setArchiveDone", enabled: document.archiveDone.enabled, days: Number(text) })}
            style={styles.smallInput}
            theme={theme}
            numeric
          />
          <Text style={styles.muted}>days</Text>
        </View>
      </Modal.Content>
    </Modal>
  );
}

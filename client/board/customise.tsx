import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { STATUS_TITLES } from "../../shared/arrange";
import { slug, type TaskOperation } from "../../shared/task-ops";
import { RULE_STATUSES, type Rule, type TaskDocument } from "../../shared/tasks";
import { useValue } from "../profile-store";
import { tasksOf } from "../task-store";
import { Button, Field, IconButton, PopoverHost, Select, type Tokens, useTokens } from "../ui/kit";
import type { BoardDeps } from "./deps";

const COLORS = ["#8f8cf2", "#4fb3a9", "#e0a84f", "#e06c75", "#61afef", "#98c379", "#c678dd", "#8b8ca3"];

type RuleStatus = Extract<Rule["when"], { kind: "chat-status" }>["status"];

function describeRule(rule: Rule, document: TaskDocument): string {
  const when = rule.when.kind === "chat-status" ? `When a linked chat is “${STATUS_TITLES[rule.when.status]}”` : "When a card enters Done";
  const target = rule.then;
  const then = target.kind === "move" ? `move it to ${document.columns.find((column) => column.id === target.column)?.name ?? "?"}` : "clear its reminder";
  return `${when}, ${then}`;
}

// A field that keeps what is typed and saves it when focus leaves or Enter is pressed. A refused
// value (its reason shows as a toast) puts the saved value back.
function CommitField({ t, value, onCommit, label, placeholder, numeric, width }: { t: Tokens; value: string; onCommit(text: string): Promise<boolean> | false; label: string; placeholder?: string; numeric?: boolean; width?: number }) {
  const [text, setText] = useState(value);
  const commit = () => {
    if (text.trim() === value) return;
    void Promise.resolve(onCommit(text.trim())).then((saved) => {
      if (!saved) setText(value);
    });
  };
  return (
    <View style={width ? { width } : { flex: 1, minWidth: 120 }}>
      <Field t={t} value={text} onChangeText={(next) => setText(numeric ? next.replace(/[^0-9]/g, "") : next)} onBlur={commit} onSubmit={commit} numeric={numeric} placeholder={placeholder} accessibilityLabel={label} />
    </View>
  );
}

function ColorDots({ t, current, onPick }: { t: Tokens; current: string | undefined; onPick(color: string): void }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {COLORS.map((color) => (
        <Pressable
          key={color}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === color }}
          accessibilityLabel={`Colour ${color}`}
          onPress={() => onPick(color)}
          hitSlop={4}
          style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, borderWidth: 2, borderColor: current === color ? t.c.foreground : "transparent" }}
        />
      ))}
    </View>
  );
}

function Section({ t, title, hint, children }: { t: Tokens; title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <Text style={t.text.heading}>{title}</Text>
        {hint ? <Text style={t.text.meta}>{hint}</Text> : null}
      </View>
      <View style={{ borderRadius: t.radius.panel, borderWidth: 1, borderColor: t.c.border, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

function Row({ t, children, last }: { t: Tokens; children: ReactNode; last?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.c.border, backgroundColor: t.c.surface1 }}>{children}</View>;
}

// Columns, labels, automation rules and auto-archiving, each change saved at once.
export function CustomiseBoard({ deps, theme, compact, onClose }: { deps: BoardDeps; theme: PluginTheme; compact: boolean; onClose(): void }) {
  const document = tasksOf(useValue(deps.tasks));
  const t = useTokens(theme, compact);
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
  const addColumn = () => {
    const name = newColumn.trim();
    if (!name) return;
    const taken = document.columns.map((column) => column.id);
    let id = slug(name, "column");
    while (taken.includes(id)) id = `${id}-2`;
    void run({ kind: "addColumn", column: { id, name } }).then((ok) => ok && setNewColumn(""));
  };
  const addLabel = () => {
    const name = newLabel.trim();
    if (!name) return;
    const taken = document.labels.map((label) => label.id);
    let id = slug(name, "label");
    while (taken.includes(id)) id = `${id}-2`;
    void run({ kind: "saveLabel", label: { id, name, color: COLORS[document.labels.length % COLORS.length] } }).then((ok) => ok && setNewLabel(""));
  };
  const whenOptions = [...RULE_STATUSES.map((status) => ({ value: status as string, label: `A linked chat is “${STATUS_TITLES[status]}”` })), { value: "enters-done", label: "A card enters Done" }];

  return (
    <Modal title="Customise board" open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 24, paddingBottom: 24 }}>
        <PopoverHost>
        <Section t={t} title="Columns" hint="A limit turns the column's count red when it holds more cards. One column is Done.">
          {document.columns.map((column, index) => (
            <Row key={column.id} t={t}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: column.color ?? (column.done ? t.c.statusSuccess : t.c.foregroundMuted) }} />
              <CommitField key={`${column.id}:${column.name}`} t={t} label={`Name of ${column.name}`} value={column.name} onCommit={(name) => !!name && run({ kind: "updateColumn", id: column.id, patch: { name } })} />
              <CommitField key={`${column.id}:wip:${column.wipLimit}`} t={t} width={96} numeric label={`Card limit for ${column.name}`} placeholder="No limit" value={column.wipLimit === null ? "" : String(column.wipLimit)} onCommit={(text) => run({ kind: "updateColumn", id: column.id, patch: { wipLimit: text === "" ? null : Number(text) } })} />
              <ColorDots t={t} current={column.color} onPick={(color) => void run({ kind: "updateColumn", id: column.id, patch: { color } })} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                <Button t={t} variant={column.done ? "secondary" : "ghost"} icon={column.done ? "CircleCheck" : "Circle"} label="Done" checked={column.done} accessibilityLabel={`${column.name} is the Done column`} onPress={() => void run({ kind: "setDoneColumn", id: column.id })} />
                <IconButton t={t} size="sm" icon="ChevronLeft" label={`Move ${column.name} left`} disabled={index === 0} onPress={() => void run({ kind: "moveColumn", id: column.id, by: -1 })} />
                <IconButton t={t} size="sm" icon="ChevronRight" label={`Move ${column.name} right`} disabled={index === document.columns.length - 1} onPress={() => void run({ kind: "moveColumn", id: column.id, by: 1 })} />
                <IconButton t={t} size="sm" icon="Trash2" label={column.done ? "The Done column cannot be deleted" : `Delete ${column.name}; its cards move to the first column`} disabled={column.done} onPress={() => void run({ kind: "deleteColumn", id: column.id })} />
              </View>
            </Row>
          ))}
          <Row t={t} last>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Field t={t} icon="Plus" value={newColumn} onChangeText={setNewColumn} onSubmit={addColumn} placeholder="New column" accessibilityLabel="New column name" />
            </View>
            <Button t={t} label="Add column" disabled={!newColumn.trim()} onPress={addColumn} />
          </Row>
        </Section>

        <Section t={t} title="Labels" hint="Also created from a card, or by typing @label in quick add.">
          {document.labels.map((label) => (
            <Row key={label.id} t={t}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: label.color }} />
              <CommitField key={`${label.id}:${label.name}`} t={t} label={`Name of label ${label.name}`} value={label.name} onCommit={(name) => !!name && run({ kind: "saveLabel", label: { ...label, name } })} />
              <ColorDots t={t} current={label.color} onPick={(color) => void run({ kind: "saveLabel", label: { ...label, color } })} />
              <IconButton t={t} size="sm" icon="Trash2" label={`Delete label ${label.name}`} onPress={() => void run({ kind: "deleteLabel", id: label.id })} />
            </Row>
          ))}
          <Row t={t} last>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Field t={t} icon="Plus" value={newLabel} onChangeText={setNewLabel} onSubmit={addLabel} placeholder="New label" accessibilityLabel="New label name" />
            </View>
            <Button t={t} label="Add label" disabled={!newLabel.trim()} onPress={addLabel} />
          </Row>
        </Section>

        <Section t={t} title="Automations" hint="Rules run while any of your Paseo apps is open, when a linked chat changes status.">
          {document.rules.map((rule) => (
            <Row key={rule.id} t={t}>
              <Switch value={rule.enabled} onValueChange={(enabled) => void run({ kind: "saveRule", rule: { ...rule, enabled } })} />
              <Text style={[t.text.body, { flex: 1, minWidth: 160 }]}>{describeRule(rule, document)}</Text>
              <IconButton t={t} size="sm" icon="Trash2" label="Delete rule" onPress={() => void run({ kind: "deleteRule", id: rule.id })} />
            </Row>
          ))}
          <Row t={t} last>
            <Text style={t.text.label}>When</Text>
            <Select t={t} label="When" value={ruleWhen} onChange={setRuleWhen} options={whenOptions} />
            <Text style={t.text.label}>then</Text>
            {ruleWhen === "enters-done" ? (
              <Text style={t.text.body}>clear its reminder</Text>
            ) : (
              <Select t={t} label="Then move the card to" value={ruleThen} onChange={setRuleThen} options={document.columns.map((column) => ({ value: column.id, label: `move it to ${column.name}`, dot: column.color }))} />
            )}
            <Button
              t={t}
              variant="primary"
              label="Add rule"
              onPress={() =>
                void run({
                  kind: "saveRule",
                  rule:
                    ruleWhen === "enters-done"
                      ? { id: `rule-${Date.now().toString(36)}`, enabled: true, when: { kind: "enters-done" }, then: { kind: "clear-reminder" } }
                      : { id: `rule-${Date.now().toString(36)}`, enabled: true, when: { kind: "chat-status", status: ruleWhen as RuleStatus }, then: { kind: "move", column: ruleThen } },
                })
              }
            />
          </Row>
        </Section>

        <Section t={t} title="Archive">
          <Row t={t} last>
            <Switch value={document.archiveDone.enabled} onValueChange={(enabled) => void run({ kind: "setArchiveDone", enabled, days: document.archiveDone.days })} />
            <Text style={t.text.body}>Archive Done cards after</Text>
            <CommitField key={`days:${document.archiveDone.days}`} t={t} width={72} numeric label="Days before Done cards are archived" value={String(document.archiveDone.days)} onCommit={(text) => run({ kind: "setArchiveDone", enabled: document.archiveDone.enabled, days: Number(text) })} />
            <Text style={t.text.body}>days</Text>
          </Row>
        </Section>
        </PopoverHost>
      </Modal.Content>
    </Modal>
  );
}

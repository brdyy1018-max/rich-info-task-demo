import { useRef, useState, type PointerEvent } from "react";
import { Phone } from "./Phone";
import { emptyAnswers, emptyValue } from "./engine";
import { PRESETS } from "./presets";
import { DEFAULT_CHECK_OPTIONS, type CaptureAction, type FieldDef, type Section, type TaskTemplate } from "./types";

const DEFAULT_SELECT_OPTIONS = [
  { value: "", label: "Select" },
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
];

function parseCap(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptySection(partial: Partial<Section> & Pick<Section, "id" | "title">): Section {
  return {
    description: "",
    required: true,
    available: true,
    helpEnabled: false,
    helpText: "",
    helpLink: "",
    exampleEnabled: false,
    exampleLabel: "Ex.",
    exampleLink: "",
    layout: "labeled_slots",
    actions: ["photo"],
    minItems: 1,
    maxItems: 1,
    numbered: false,
    repeatable: false,
    slots: [],
    addLabel: "+ Add group",
    groupLabel: "Group",
    fields: [],
    bindField: partial.id,
    visibleWhen: "always",
    unavailableButton: true,
    unavailableLabel: "Not available",
    ...partial,
  };
}

function makePhotoSlot(label: string): Section["slots"][number] {
  return { key: newId("slot"), label, action: "photo", maxItems: 1 };
}

const DEFAULT_BLOCKS: {
  id: string;
  title: string;
  hint: string;
  build: () => Section;
}[] = [
  {
    id: "storefront",
    title: "Storefront",
    hint: "Ex. + 2 photos",
    build: () =>
      emptySection({
        id: newId("sec"),
        title: "Storefront Capturing",
        description: "Take storefront photos from outside.",
        exampleEnabled: true,
        slots: [makePhotoSlot("Take Photo"), makePhotoSlot("Take Photo")],
        bindField: "storefront_photos",
      }),
  },
  {
    id: "environment",
    title: "Environment",
    hint: "Left · Center · Right",
    build: () =>
      emptySection({
        id: newId("sec"),
        title: "Environment Capturing",
        description: "Enter the store and take interior photos.",
        helpEnabled: true,
        helpText: "Shoot left, center, and right. No faces, receipts, or payment QR codes.",
        slots: [makePhotoSlot("Left View"), makePhotoSlot("Center View"), makePhotoSlot("Right View")],
        bindField: "environment_photos",
      }),
  },
];

function newField(action: "text" | "select" | "check"): FieldDef {
  const key = newId("field");
  if (action === "select") {
    return { key, label: "Choice", action: "select", options: DEFAULT_SELECT_OPTIONS };
  }
  if (action === "check") {
    return {
      key,
      label: "Previous task completed",
      action: "check",
      options: DEFAULT_CHECK_OPTIONS,
    };
  }
  return { key, label: "Value", action: "text", placeholder: "Type here" };
}

function deriveActions(section: Pick<Section, "repeatable" | "slots" | "fields">): CaptureAction[] {
  const next: CaptureAction[] = [];
  const add = (action: CaptureAction) => {
    if (!next.includes(action)) next.push(action);
  };
  if (section.repeatable) add("photo");
  for (const slot of section.slots) {
    if (slot.action === "photo" || slot.action === "video") add(slot.action);
  }
  for (const field of section.fields) {
    if (field.action === "text" || field.action === "select" || field.action === "check") add(field.action);
  }
  return next;
}

function captureSummary(section: Section): string {
  const labels: string[] = [];
  if (section.repeatable) labels.push("Groups");
  if (section.slots.some((s) => s.action === "photo")) labels.push("Photo");
  if (section.slots.some((s) => s.action === "video")) labels.push("Video");
  if (section.fields.some((f) => f.action === "check")) labels.push("Check");
  if (section.fields.some((f) => f.action === "text" || f.action === "select")) labels.push("Text");
  if (!section.available) labels.push("Hidden");
  return labels.join(" · ") || "Empty";
}

function optionsText(field: FieldDef): string {
  return (field.options ?? [])
    .filter((o) => o.value)
    .map((o) => o.label)
    .join(", ");
}

function parseChoiceOptions(text: string): { value: string; label: string }[] {
  const labels = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return labels.map((label) => ({
    value: label.toLowerCase().replace(/\s+/g, "_"),
    label,
  }));
}

function parseOptions(text: string): { value: string; label: string }[] {
  return [{ value: "", label: "Select" }, ...parseChoiceOptions(text)];
}

function cloneTemplate(): TaskTemplate {
  return structuredClone(PRESETS[0]);
}

function IconGrip() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
      <circle cx="3" cy="3" r="1.25" fill="currentColor" />
      <circle cx="7" cy="3" r="1.25" fill="currentColor" />
      <circle cx="3" cy="8" r="1.25" fill="currentColor" />
      <circle cx="7" cy="8" r="1.25" fill="currentColor" />
      <circle cx="3" cy="13" r="1.25" fill="currentColor" />
      <circle cx="7" cy="13" r="1.25" fill="currentColor" />
    </svg>
  );
}

function dropTargetFromPoint(
  list: HTMLElement,
  clientX: number,
  clientY: number,
  fromId: string,
): { id: string; edge: "before" | "after" } | null {
  const items = [...list.querySelectorAll<HTMLElement>("[data-section-id]")];
  const horizontal = getComputedStyle(list).flexDirection === "row";
  for (const item of items) {
    const id = item.dataset.sectionId;
    if (!id || id === fromId) continue;
    const rect = item.getBoundingClientRect();
    if (horizontal) {
      if (clientX < rect.left + rect.width / 2) return { id, edge: "before" };
    } else if (clientY < rect.top + rect.height / 2) {
      return { id, edge: "before" };
    }
  }
  const last = [...items].reverse().find((item) => item.dataset.sectionId !== fromId);
  const lastId = last?.dataset.sectionId;
  return lastId ? { id: lastId, edge: "after" } : null;
}

export default function App() {
  const [template, setTemplate] = useState<TaskTemplate>(() => cloneTemplate());
  const [answers, setAnswers] = useState(() => emptyAnswers(template.sections));
  const [selectedId, setSelectedId] = useState(template.sections[0]?.id ?? "");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; edge: "before" | "after" } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dropRef = useRef<{ id: string; edge: "before" | "after" } | null>(null);
  const didDragRef = useRef(false);

  const selected = template.sections.find((s) => s.id === selectedId) ?? template.sections[0];

  function patchSection(partial: Partial<Section>) {
    if (!selected) return;
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === selected.id ? { ...s, ...partial } : s)),
    }));
  }

  function patchTemplate(partial: Partial<TaskTemplate>) {
    setTemplate((prev) => ({ ...prev, ...partial }));
  }

  function insertSection(section: Section) {
    setTemplate((prev) => ({ ...prev, sections: [...prev.sections, section] }));
    setAnswers((prev) => ({ ...prev, [section.id]: emptyValue() }));
    setSelectedId(section.id);
  }

  function addSection() {
    insertSection(
      emptySection({
        id: newId("sec"),
        title: "New block",
        required: false,
        layout: "form",
        actions: [],
        bindField: "custom_media",
      }),
    );
  }

  function addDefaultBlock(id: string) {
    const preset = DEFAULT_BLOCKS.find((block) => block.id === id);
    if (!preset) return;
    insertSection(preset.build());
  }

  function removeSection(id: string) {
    if (template.sections.length <= 1) return;
    const next = template.sections.filter((s) => s.id !== id);
    setTemplate({ ...template, sections: next });
    setSelectedId(id === selectedId ? next[0].id : selectedId);
  }

  function moveSection(id: string, dir: -1 | 1) {
    const i = template.sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= template.sections.length) return;
    const sections = [...template.sections];
    const [row] = sections.splice(i, 1);
    sections.splice(j, 0, row);
    setTemplate({ ...template, sections });
  }

  function reorderSections(fromId: string, toId: string, place: "before" | "after") {
    setTemplate((prev) => {
      if (fromId === toId) return prev;
      const from = prev.sections.findIndex((s) => s.id === fromId);
      if (from < 0) return prev;
      const next = [...prev.sections];
      const [row] = next.splice(from, 1);
      let insertAt = next.findIndex((s) => s.id === toId);
      if (insertAt < 0) return prev;
      if (place === "after") insertAt += 1;
      next.splice(insertAt, 0, row);
      if (next.every((s, i) => s.id === prev.sections[i].id)) return prev;
      return { ...prev, sections: next };
    });
  }

  function clearDrag() {
    dragOriginRef.current = null;
    draggingIdRef.current = null;
    dropRef.current = null;
    setDraggingId(null);
    setDrop(null);
  }

  function onHandlePointerDown(sectionId: string, e: PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = { id: sectionId, x: e.clientX, y: e.clientY };
  }

  function onHandlePointerMove(sectionId: string, e: PointerEvent<HTMLElement>) {
    const origin = dragOriginRef.current;
    if (!origin || origin.id !== sectionId) return;
    if (!draggingIdRef.current) {
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 5) return;
      didDragRef.current = true;
      draggingIdRef.current = origin.id;
      setDraggingId(origin.id);
    }
    const list = listRef.current;
    if (!list) return;
    const next = dropTargetFromPoint(list, e.clientX, e.clientY, origin.id);
    dropRef.current = next;
    setDrop((prev) => {
      if (!next) return prev ? null : prev;
      if (prev?.id === next.id && prev.edge === next.edge) return prev;
      return next;
    });
  }

  function onHandlePointerUp(sectionId: string, e: PointerEvent<HTMLElement>) {
    const fromId = draggingIdRef.current;
    const next = dropRef.current;
    if (fromId === sectionId && next) {
      reorderSections(fromId, next.id, next.edge);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    clearDrag();
  }

  function patchCollect(partial: Partial<Section>) {
    if (!selected) return;
    const merged = { ...selected, ...partial };
    patchSection({ ...partial, actions: deriveActions(merged) });
  }

  function addPhoto() {
    if (!selected) return;
    const slot = { key: newId("slot"), label: "Take Photo", action: "photo" as const, maxItems: 1 };
    patchCollect({
      slots: [...selected.slots, slot],
    });
  }

  function addVideo() {
    if (!selected) return;
    const slot = { key: newId("slot"), label: "Record", action: "video" as const };
    patchCollect({
      slots: [...selected.slots, slot],
    });
  }

  function addGroup() {
    if (!selected || selected.repeatable) return;
    patchCollect({
      repeatable: true,
      numbered: true,
      addLabel: selected.addLabel.trim() ? selected.addLabel : "+ Add group",
      groupLabel: selected.groupLabel.trim() ? selected.groupLabel : "Group",
    });
  }

  function addText() {
    if (!selected) return;
    const field = newField("text");
    patchCollect({ fields: [...selected.fields, field] });
    setAnswers((prev) => {
      const cur = prev[selected.id] ?? emptyValue();
      return {
        ...prev,
        [selected.id]: { ...cur, fields: { ...cur.fields, [field.key]: "" } },
      };
    });
  }

  function addCheck() {
    if (!selected) return;
    const field = newField("check");
    patchCollect({ fields: [...selected.fields, field] });
    setAnswers((prev) => {
      const cur = prev[selected.id] ?? emptyValue();
      return {
        ...prev,
        [selected.id]: { ...cur, fields: { ...cur.fields, [field.key]: "" } },
      };
    });
  }

  function setFieldAction(idx: number, action: "text" | "select") {
    if (!selected) return;
    if (selected.fields[idx]?.action === action) return;
    const fields = selected.fields.map((x, i): FieldDef => {
      if (i !== idx) return x;
      if (action === "select") {
        return { ...x, action: "select", options: x.options?.length ? x.options : DEFAULT_SELECT_OPTIONS };
      }
      return { ...x, action: "text", placeholder: x.placeholder || "Type here" };
    });
    patchCollect({ fields });
  }

  function removeSlot(idx: number) {
    if (!selected) return;
    const slots = selected.slots.filter((_, i) => i !== idx);
    patchCollect({
      slots,
      exampleEnabled: slots.some((s) => s.action === "photo") ? selected.exampleEnabled : false,
    });
  }

  return (
    <div className="studio">
      <aside className="rail">
        <div className="rail-head">
          <p className="eyebrow">Task</p>
          <label className="stack-field">
            Title
            <input
              className="rail-title"
              value={template.title}
              onChange={(e) => patchTemplate({ title: e.target.value })}
              placeholder="Task name"
            />
          </label>
          <p className="rail-meta">
            {template.sections.length === 1 ? "1 block" : `${template.sections.length} blocks`}
          </p>
        </div>
        <div className="rail-defaults">
          <p className="eyebrow">Default blocks</p>
          {DEFAULT_BLOCKS.map((block) => (
            <button
              key={block.id}
              type="button"
              className="default-block"
              onClick={() => addDefaultBlock(block.id)}
            >
              <strong>+ {block.title}</strong>
              <em>{block.hint}</em>
            </button>
          ))}
        </div>
        <div className={`rail-list ${draggingId ? "is-reordering" : ""}`} ref={listRef}>
          <p id="sec-drag-hint" className="sr-only">
            Drag to reorder
          </p>
          {template.sections.map((s, i) => (
            <div
              key={s.id}
              data-section-id={s.id}
              className={`sec-item ${s.id === selected?.id ? "is-on" : ""} ${s.available ? "" : "is-hidden"} ${
                draggingId === s.id ? "is-dragging" : ""
              } ${drop?.id === s.id ? `drop-${drop.edge}` : ""}`}
              onClick={() => {
                if (didDragRef.current) {
                  didDragRef.current = false;
                  return;
                }
                setSelectedId(s.id);
              }}
            >
              <span
                className="sec-drag"
                role="button"
                tabIndex={0}
                aria-label="Reorder block"
                aria-describedby="sec-drag-hint"
                aria-grabbed={draggingId === s.id}
                onPointerDown={(e) => onHandlePointerDown(s.id, e)}
                onPointerMove={(e) => onHandlePointerMove(s.id, e)}
                onPointerUp={(e) => onHandlePointerUp(s.id, e)}
                onPointerCancel={clearDrag}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveSection(s.id, -1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveSection(s.id, 1);
                  }
                }}
              >
                <IconGrip />
              </span>
              <button type="button" className="sec-main">
                <span className="sec-num">{i + 1}</span>
                <span className="sec-copy">
                  <strong>
                    {s.title || "Untitled"}
                    {s.required ? <span className="sec-star">*</span> : null}
                  </strong>
                  <em>{captureSummary(s)}</em>
                </span>
              </button>
            </div>
          ))}
          <button type="button" className="add-block" onClick={addSection}>
            + Add block
          </button>
        </div>
      </aside>

      <aside className="panel">
        {selected ? (
          <>
            <div className="panel-head">
              <p className="eyebrow">Block {template.sections.findIndex((s) => s.id === selected.id) + 1}</p>
              <h2>{selected.title || "Untitled"}</h2>
            </div>

            <section className="editor-card">
              <h3>Copy</h3>
              <label className="stack-field">
                Title
                <input value={selected.title} onChange={(e) => patchSection({ title: e.target.value })} />
              </label>
              <label className="stack-field">
                Description
                <input
                  value={selected.description}
                  onChange={(e) => patchSection({ description: e.target.value })}
                />
              </label>
              <label className="setting-row">
                <input
                  type="checkbox"
                  checked={selected.helpEnabled}
                  onChange={(e) => patchSection({ helpEnabled: e.target.checked })}
                />
                <span>
                  <strong>Help tip</strong>
                </span>
              </label>
              {selected.helpEnabled ? (
                <>
                  <label className="stack-field">
                    Tip text
                    <textarea
                      rows={3}
                      value={selected.helpText}
                      onChange={(e) => patchSection({ helpText: e.target.value })}
                    />
                  </label>
                  <label className="stack-field">
                    Help link
                    <input
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={selected.helpLink ?? ""}
                      onChange={(e) => patchSection({ helpLink: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
            </section>

            <section className="editor-card">
              <h3>Collect</h3>
              <div className="add-bar" role="group" aria-label="Add capture">
                <button type="button" aria-label="Add photo" onClick={addPhoto}>
                  + Photo
                </button>
                <button type="button" aria-label="Add video" onClick={addVideo}>
                  + Video
                </button>
                <button
                  type="button"
                  aria-label="Add group"
                  onClick={addGroup}
                  disabled={selected.repeatable}
                  title={selected.repeatable ? "Group already added" : undefined}
                >
                  + Group
                </button>
                <button type="button" aria-label="Add text" onClick={addText}>
                  + Text
                </button>
                <button type="button" aria-label="Add check" onClick={addCheck}>
                  + Check
                </button>
              </div>

              {selected.repeatable || selected.slots.length > 0 || selected.fields.length > 0 ? (
                <div className="nested part-list">
                  {selected.slots.some((s) => s.action === "photo") ? (
                    <>
                      <label className="setting-row">
                        <input
                          type="checkbox"
                          checked={selected.exampleEnabled}
                          onChange={(e) => patchSection({ exampleEnabled: e.target.checked })}
                        />
                        <span>
                          <strong>Example photo</strong>
                        </span>
                      </label>
                      {selected.exampleEnabled ? (
                        <label className="stack-field">
                          Example link
                          <input
                            type="url"
                            inputMode="url"
                            placeholder="https://"
                            value={selected.exampleLink ?? ""}
                            onChange={(e) => patchSection({ exampleLink: e.target.value })}
                          />
                        </label>
                      ) : null}
                    </>
                  ) : null}

                  {selected.repeatable ? (
                    <div className="field-card">
                      <div className="slot-row">
                        <span className="part-kind">Group</span>
                        <input
                          value={selected.groupLabel}
                          placeholder="Group"
                          aria-label="Group title"
                          onChange={(e) => patchSection({ groupLabel: e.target.value })}
                        />
                        <input
                          className="slot-max"
                          type="number"
                          min={1}
                          max={99}
                          title="Max photos per group"
                          aria-label="Max photos per group"
                          value={selected.maxItems}
                          onChange={(e) => patchSection({ maxItems: parseCap(e.target.value) })}
                        />
                        <button
                          type="button"
                          className="icon-x"
                          aria-label="Remove group"
                          onClick={() => patchCollect({ repeatable: false, numbered: false })}
                        >
                          ×
                        </button>
                      </div>
                      <input
                        className="options-input"
                        value={selected.addLabel}
                        placeholder="+ Add group"
                        aria-label="Add group label"
                        onChange={(e) => patchSection({ addLabel: e.target.value })}
                      />
                    </div>
                  ) : null}

                  {selected.slots.map((slot, idx) => (
                    <div key={slot.key} className="slot-row">
                      <span className="part-kind">{slot.action === "video" ? "Video" : "Photo"}</span>
                      <input
                        value={slot.label}
                        aria-label={`${slot.action === "video" ? "Video" : "Photo"} label`}
                        onChange={(e) => {
                          const slots = selected.slots.map((x, i) =>
                            i === idx ? { ...x, label: e.target.value } : x,
                          );
                          patchSection({ slots });
                        }}
                      />
                      {slot.action === "photo" ? (
                        <input
                          className="slot-max"
                          type="number"
                          min={1}
                          max={99}
                          title="Max photos"
                          aria-label="Max photos"
                          value={slot.maxItems ?? selected.maxItems}
                          onChange={(e) => {
                            const slots = selected.slots.map((x, i) =>
                              i === idx ? { ...x, maxItems: parseCap(e.target.value) } : x,
                            );
                            patchSection({ slots });
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="icon-x"
                        aria-label="Remove slot"
                        onClick={() => removeSlot(idx)}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {selected.fields.map((field, idx) => (
                    <div key={field.key} className="field-card">
                      <div className="slot-row">
                        <span className="part-kind">{field.action === "check" ? "Check" : "Text"}</span>
                        {field.action === "check" ? null : (
                          <select
                            className="type-select"
                            aria-label="Field type"
                            value={field.action}
                            onChange={(e) =>
                              setFieldAction(idx, e.target.value === "select" ? "select" : "text")
                            }
                          >
                            <option value="text">Fill in</option>
                            <option value="select">Select</option>
                          </select>
                        )}
                        <input
                          value={field.label}
                          aria-label={field.action === "check" ? "Check prompt" : "Field label"}
                          onChange={(e) => {
                            const fields = selected.fields.map((x, i) =>
                              i === idx ? { ...x, label: e.target.value } : x,
                            );
                            patchSection({ fields });
                          }}
                        />
                        <button
                          type="button"
                          className="icon-x"
                          aria-label="Remove field"
                          onClick={() =>
                            patchCollect({ fields: selected.fields.filter((_, i) => i !== idx) })
                          }
                        >
                          ×
                        </button>
                      </div>
                      {field.action === "select" || field.action === "check" ? (
                        <input
                          className="options-input"
                          value={optionsText(field)}
                          placeholder={field.action === "check" ? "Yes, No" : "Choices"}
                          onChange={(e) => {
                            const fields = selected.fields.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    options:
                                      field.action === "check"
                                        ? parseChoiceOptions(e.target.value)
                                        : parseOptions(e.target.value),
                                  }
                                : x,
                            );
                            patchSection({ fields });
                          }}
                        />
                      ) : (
                        <input
                          className="options-input"
                          value={field.placeholder ?? ""}
                          placeholder="Placeholder"
                          onChange={(e) => {
                            const fields = selected.fields.map((x, i) =>
                              i === idx ? { ...x, placeholder: e.target.value } : x,
                            );
                            patchSection({ fields });
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="editor-card">
              <h3>Rules</h3>
              <label className="setting-row">
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={(e) => patchSection({ required: e.target.checked })}
                />
                <span>
                  <strong>Required</strong>
                </span>
              </label>
              <label className="setting-row">
                <input
                  type="checkbox"
                  checked={selected.unavailableButton}
                  onChange={(e) => patchSection({ unavailableButton: e.target.checked })}
                />
                <span>
                  <strong>Not available</strong>
                </span>
              </label>
              {selected.unavailableButton ? (
                <label className="stack-field">
                  Title
                  <input
                    value={selected.unavailableLabel ?? ""}
                    placeholder="Not available"
                    onChange={(e) => patchSection({ unavailableLabel: e.target.value })}
                  />
                </label>
              ) : null}
              <label className="setting-row">
                <input
                  type="checkbox"
                  checked={selected.available}
                  onChange={(e) => patchSection({ available: e.target.checked })}
                />
                <span>
                  <strong>Visible</strong>
                </span>
              </label>
            </section>

            <button
              type="button"
              className="danger-link"
              onClick={() => removeSection(selected.id)}
              disabled={template.sections.length <= 1}
            >
              Delete block
            </button>
          </>
        ) : null}
      </aside>

      <section className="stage">
        <div className="stage-head">
          <p className="stage-kicker">Preview</p>
        </div>
        <Phone
          template={template}
          answers={answers}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onAnswers={setAnswers}
        />
      </section>
    </div>
  );
}

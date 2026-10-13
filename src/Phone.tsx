import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  canSubmit,
  captureCap,
  groupTitle,
  slotCap,
  clearUnavailable,
  emptyValue,
  isSectionComplete,
  isSectionVisible,
  mediaCap,
  unavailableReasonLabel,
  unavailableTitle,
  sanitizeHref,
} from "./engine";
import { EXAMPLE_URL, makePlaceholder } from "./media";
import {
  DEFAULT_CHECK_OPTIONS,
  UNAVAILABLE_REASONS,
  type Answers,
  type CaptureAction,
  type FieldDef,
  type GroupValue,
  type MediaItem,
  type Section,
  type SectionValue,
  type TaskTemplate,
  type UnavailableReasonId,
} from "./types";

type CaptureTarget = {
  sectionId: string;
  kind: "photo" | "video";
  slotKey?: string;
  groupId?: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#22c55e" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" />
      <path d="M12 16v-4M12 8h.01" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IconCam() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2.1l1.2-2h4.4l1.2 2h2.1A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 10l6-3v10l-6-3V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 3l6 6M9 3L3 9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type PhoneProps = {
  template: TaskTemplate;
  answers: Answers;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAnswers: (next: Answers | ((prev: Answers) => Answers)) => void;
};

export function Phone({ template, answers, selectedId, onSelect, onAnswers }: PhoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const targetRef = useRef<CaptureTarget | null>(null);
  const [help, setHelp] = useState<Section | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [skipSection, setSkipSection] = useState<Section | null>(null);
  const [skipReason, setSkipReason] = useState<UnavailableReasonId | "">("");
  const [skipNote, setSkipNote] = useState("");
  const [guide, setGuide] = useState<{ title: string; url: string } | null>(null);

  const visible = template.sections.filter((s) => isSectionVisible(s, template));
  const ready = canSubmit(template, answers);

  useEffect(() => {
    if (!selectedId) return;
    const node = bodyRef.current?.querySelector<HTMLElement>(`[data-section-id="${selectedId}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  function patchSection(id: string, updater: (value: SectionValue) => SectionValue) {
    onAnswers((prev) => ({
      ...prev,
      [id]: updater(prev[id] ?? emptyValue()),
    }));
  }

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }

  function addMedia(section: Section, item: MediaItem, target: CaptureTarget) {
    const slot = target.slotKey ? section.slots.find((s) => s.key === target.slotKey) : undefined;
    const cap = mediaCap(section, item.kind, slot);
    patchSection(section.id, (value) => {
      if (target.slotKey) {
        const prev = value.slots[target.slotKey] ?? [];
        if (prev.length >= cap) return value;
        return {
          ...clearUnavailable(value),
          slots: { ...value.slots, [target.slotKey]: [...prev, item] },
        };
      }
      if (target.groupId) {
        return {
          ...value,
          groups: value.groups.map((g) => {
            if (g.id !== target.groupId) return g;
            const count = g.items.filter((i) => i.kind === item.kind).length;
            if (count >= cap) return g;
            return { ...g, items: [...g.items, item] };
          }),
        };
      }
      const count = value.items.filter((i) => i.kind === item.kind).length;
      if (count >= cap) return value;
      return { ...clearUnavailable(value), items: [...value.items, item] };
    });
  }

  function capture(section: Section, kind: "photo" | "video", extra?: { slotKey?: string; groupId?: string }) {
    const slotLabel = extra?.slotKey
      ? section.slots.find((s) => s.key === extra.slotKey)?.label
      : undefined;
    const item: MediaItem = {
      id: uid(),
      kind,
      url: makePlaceholder(kind, slotLabel || section.title),
      label: extra?.slotKey ?? slotLabel,
    };
    addMedia(section, item, { sectionId: section.id, kind, ...extra });
  }

  function pickFile(section: Section, kind: "photo" | "video", extra?: { slotKey?: string; groupId?: string }) {
    targetRef.current = { sectionId: section.id, kind, ...extra };
    const input = fileRef.current;
    if (!input) return;
    input.accept = kind === "video" ? "video/*" : "image/*";
    input.value = "";
    input.click();
  }

  function onFile(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    const target = targetRef.current;
    if (!file || !target) return;
    const section = template.sections.find((s) => s.id === target.sectionId);
    if (!section) return;
    const url = URL.createObjectURL(file);
    addMedia(section, { id: uid(), url, kind: target.kind, label: file.name }, target);
  }

  function removeItem(section: Section, itemId: string, extra?: { slotKey?: string; groupId?: string }) {
    patchSection(section.id, (value) => {
      const drop = (list: MediaItem[]) => list.filter((i) => i.id !== itemId);
      if (extra?.slotKey) {
        return { ...value, slots: { ...value.slots, [extra.slotKey]: drop(value.slots[extra.slotKey] ?? []) } };
      }
      if (extra?.groupId) {
        return {
          ...value,
          groups: value.groups.map((g) => (g.id === extra.groupId ? { ...g, items: drop(g.items) } : g)),
        };
      }
      return { ...value, items: drop(value.items) };
    });
  }

  function submit() {
    if (!ready) {
      showToast("Finish required blocks first");
      return;
    }
    showToast("Submitted");
  }

  function openSkipSheet(section: Section) {
    setSkipSection(section);
    setSkipReason("");
    setSkipNote("");
  }

  function closeSkipSheet() {
    setSkipSection(null);
    setSkipReason("");
    setSkipNote("");
  }

  function applyUnavailable(sectionId: string, reason: UnavailableReasonId, note = "") {
    const trimmed = note.trim();
    if (reason === "other" && !trimmed) return;
    patchSection(sectionId, (v) => ({
      ...v,
      unavailable: true,
      unavailableReason: reason,
      unavailableNote: reason === "other" ? trimmed : "",
    }));
    closeSkipSheet();
    showToast("Marked unavailable");
  }

  function pickSkipReason(reason: UnavailableReasonId) {
    if (!skipSection) return;
    setSkipReason(reason);
    if (reason === "other") return;
    applyUnavailable(skipSection.id, reason);
  }

  return (
    <div className="phone">
      <header className="phone-header">
        <button className="icon-btn" type="button" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1>{template.title}</h1>
        <button
          className="icon-btn"
          type="button"
          title="Clear captured photos and fields"
          aria-label="Clear captured photos and fields"
          onClick={() => {
            onAnswers((prev) => {
              const next = { ...prev };
              for (const key of Object.keys(next)) {
                next[key] = {
                  ...next[key],
                  items: [],
                  slots: {},
                  groups: next[key].groups.map((g) => ({ ...g, items: [] })),
                  fields: Object.fromEntries(Object.keys(next[key].fields).map((k) => [k, ""])),
                  unavailable: false,
                  unavailableReason: "",
                  unavailableNote: "",
                };
              }
              return next;
            });
            showToast("Cleared");
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </header>

      <main className="phone-body" ref={bodyRef}>
        {visible.map((section, index) => {
          const value = answers[section.id];
          const complete = isSectionComplete(section, value);
          const selected = section.id === selectedId;
          return (
            <section
              key={section.id}
              data-section-id={section.id}
              className={`task-card ${selected ? "is-selected" : ""}`}
              onClick={() => onSelect(section.id)}
            >
              <div className="task-title-row">
                <span className="task-index">
                  {index + 1}.{section.title}
                </span>
                {section.required ? <span className="required">*</span> : null}
                {complete ? (
                  <span className="check">
                    <IconCheck />
                  </span>
                ) : null}
                {section.helpEnabled ? (
                  <button
                    type="button"
                    className="info-btn"
                    aria-label="Help"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      const href = sanitizeHref(section.helpLink);
                      if (href) setGuide({ title: "Help", url: href });
                      else setHelp(section);
                    }}
                  >
                    <IconInfo />
                  </button>
                ) : null}
              </div>
              {section.description ? <p className="task-hint">{section.description}</p> : null}
              {value?.unavailable ? (
                <div className="unavailable-banner">
                  <div className="unavailable-banner-text">
                    <strong>{unavailableTitle(section)}</strong>
                    {unavailableReasonLabel(value) ? <span>{unavailableReasonLabel(value)}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="unavailable-undo"
                    onClick={(e) => {
                      e.stopPropagation();
                      patchSection(section.id, clearUnavailable);
                    }}
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <>
                  <SectionBody
                    section={section}
                    value={value}
                    onCapture={capture}
                    onPick={pickFile}
                    onRemove={removeItem}
                    onPreview={setPreview}
                    onField={(key, text) =>
                      patchSection(section.id, (v) => ({ ...v, fields: { ...v.fields, [key]: text } }))
                    }
                    onOpenLink={(title, url) => setGuide({ title, url })}
                    onMarkUnavailable={() => openSkipSheet(section)}
                    onAddGroup={() =>
                      patchSection(section.id, (v) => ({
                        ...v,
                        groups: [
                          ...v.groups,
                          { id: uid(), name: groupTitle(section, v.groups.length), items: [] },
                        ],
                      }))
                    }
                  />
                </>
              )}
            </section>
          );
        })}
      </main>

      <footer className="phone-footer">
        <button className="submit-btn" type="button" onClick={submit}>
          Submit
        </button>
      </footer>

      <input ref={fileRef} className="hidden-file" type="file" onChange={onFile} />

      {toast ? <div className="toast">{toast}</div> : null}

      {skipSection ? (
        <div className="sheet" onClick={closeSkipSheet}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <h3>{unavailableTitle(skipSection)}</h3>
            <p>Select a reason</p>
            <div className="reason-list">
              {UNAVAILABLE_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  className={`reason-option ${skipReason === reason.id ? "is-selected" : ""}`}
                  onClick={() => pickSkipReason(reason.id)}
                >
                  {reason.label}
                </button>
              ))}
            </div>
            {skipReason === "other" ? (
              <>
                <textarea
                  className="reason-note"
                  value={skipNote}
                  placeholder="Enter a reason"
                  autoFocus
                  onChange={(e) => setSkipNote(e.target.value)}
                />
                <button
                  type="button"
                  className="sheet-ok"
                  disabled={!skipNote.trim()}
                  onClick={() => applyUnavailable(skipSection.id, "other", skipNote)}
                >
                  Confirm
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {help ? (
        <div className="sheet" onClick={() => setHelp(null)}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <h3>Shooting guide</h3>
            <p>{help.helpText || "No extra guidance for this block."}</p>
            <button type="button" className="sheet-ok" onClick={() => setHelp(null)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {guide ? (
        <div className="sheet" onClick={() => setGuide(null)}>
          <div className="sheet-card guide-card" onClick={(e) => e.stopPropagation()}>
            <h3>{guide.title}</h3>
            <iframe className="guide-frame" title={guide.title} src={guide.url} />
            <a className="guide-open" href={guide.url} target="_blank" rel="noreferrer">
              Open page
            </a>
            <button type="button" className="sheet-ok" onClick={() => setGuide(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="sheet" onClick={() => setPreview(null)}>
          <div className="lightbox" onClick={(e) => e.stopPropagation()}>
            {preview.kind === "video" ? (
              <div className="lightbox-video">Video clip · {preview.label ?? "demo"}</div>
            ) : (
              <img src={preview.url} alt="" />
            )}
            <button type="button" className="sheet-ok" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type BodyProps = {
  section: Section;
  value: SectionValue | undefined;
  onCapture: (section: Section, kind: "photo" | "video", extra?: { slotKey?: string; groupId?: string }) => void;
  onPick: (section: Section, kind: "photo" | "video", extra?: { slotKey?: string; groupId?: string }) => void;
  onRemove: (section: Section, itemId: string, extra?: { slotKey?: string; groupId?: string }) => void;
  onPreview: (item: MediaItem) => void;
  onOpenLink: (title: string, url: string) => void;
  onField: (key: string, value: string) => void;
  onMarkUnavailable: () => void;
  onAddGroup: () => void;
};

function SectionBody(props: BodyProps) {
  const { section } = props;
  const media = section.actions.includes("photo") || section.actions.includes("video");
  const showGallery = media && section.slots.length === 0 && !section.repeatable;
  const showSlots = section.slots.length > 0;
  const showGroups = section.repeatable;
  const showForm =
    section.actions.includes("text") ||
    section.actions.includes("select") ||
    section.actions.includes("check");
  return (
    <>
      {showGallery ? <GalleryBody {...props} /> : null}
      {showSlots ? <SlotsBody {...props} /> : null}
      {showGroups ? <GroupsBody {...props} /> : null}
      {showForm ? <FormFields {...props} /> : null}
      {section.unavailableButton ? (
        <UnavailableMark label={unavailableTitle(section)} onMark={props.onMarkUnavailable} />
      ) : null}
    </>
  );
}

function UnavailableMark({ label, onMark }: { label: string; onMark: () => void }) {
  return (
    <button
      type="button"
      className="unavailable-mark"
      onClick={(e) => {
        e.stopPropagation();
        onMark();
      }}
    >
      {label}
    </button>
  );
}

function FormFields({ section, value, onField }: BodyProps) {
  if (!section.fields.length) return null;
  return (
    <div className="form-stack">
      {section.fields.map((field) =>
        field.action === "check" ? (
          <CheckField
            key={field.key}
            field={field}
            value={value?.fields[field.key] ?? ""}
            onChange={(next) => onField(field.key, next)}
          />
        ) : (
          <label key={field.key} className="field">
            <span>
              {field.label}
              {field.required ? <span className="required"> *</span> : null}
            </span>
            {field.action === "select" ? (
              <select
                value={value?.fields[field.key] ?? ""}
                onChange={(e) => onField(field.key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                {(field.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={value?.fields[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) => onField(field.key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </label>
        ),
      )}
    </div>
  );
}

function CheckField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (next: string) => void;
}) {
  const options = field.options?.length ? field.options : DEFAULT_CHECK_OPTIONS;
  const pair = options.length === 2;
  return (
    <div className="check-field">
      {field.label ? <p className="check-prompt">{field.label}</p> : null}
      <div className={`check-options ${pair ? "is-pair" : ""}`} role="radiogroup" aria-label={field.label}>
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={on}
              className={`check-option ${on ? "is-on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(on ? "" : opt.value);
              }}
            >
              {on ? <IconCheck /> : <span className="check-empty" />}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function exampleThumb(section: Section, onOpenLink?: (title: string, url: string) => void) {
  if (!section.exampleEnabled) return null;
  const href = sanitizeHref(section.exampleLink);
  return (
    <button
      type="button"
      className={`thumb example${href ? " is-link" : ""}`}
      aria-label={href ? "Open example page" : "Example photo"}
      onClick={(e) => {
        e.stopPropagation();
        if (href) onOpenLink?.("Example", href);
      }}
    >
      <img src={EXAMPLE_URL} alt="Example" />
      <span className="ex-badge">{section.exampleLabel || "Ex."}</span>
    </button>
  );
}

function GalleryBody(props: BodyProps) {
  const { section, value } = props;
  const items = value?.items ?? [];
  const photos = items.filter((i) => i.kind === "photo");
  const videos = items.filter((i) => i.kind === "video");
  const showPhoto = section.actions.includes("photo");
  const showVideo = section.actions.includes("video");
  const photoCap = captureCap(section);
  return (
    <div className="shot-row wrap">
        {showPhoto ? (
          photoCap > 1 ? (
            <AlbumRow
              items={photos}
              cap={photoCap}
              kinds={["photo"]}
              example={exampleThumb(section, props.onOpenLink)}
              onCapture={(kind) => props.onCapture(section, kind)}
              onPick={(kind) => props.onPick(section, kind)}
              onPreview={props.onPreview}
              onRemove={(id) => props.onRemove(section, id)}
            />
          ) : (
            <>
              {exampleThumb(section, props.onOpenLink)}
              {photos[0] ? (
                <Thumb
                  item={photos[0]}
                  caption="Take Photo"
                  onOpen={() => props.onPreview(photos[0])}
                  onRemove={() => props.onRemove(section, photos[0].id)}
                />
              ) : (
                <CaptureTile
                  action="photo"
                  label="Take Photo"
                  onClick={() => props.onCapture(section, "photo")}
                  onPick={() => props.onPick(section, "photo")}
                />
              )}
            </>
          )
        ) : (
          exampleThumb(section, props.onOpenLink)
        )}
        {showVideo ? (
          videos[0] ? (
            <Thumb
              item={videos[0]}
              caption="Record"
              onOpen={() => props.onPreview(videos[0])}
              onRemove={() => props.onRemove(section, videos[0].id)}
            />
          ) : (
            <CaptureTile
              action="video"
              label="Record"
              onClick={() => props.onCapture(section, "video")}
              onPick={() => props.onPick(section, "video")}
            />
          )
        ) : null}
    </div>
  );
}

function SlotsBody(props: BodyProps) {
  const { section, value } = props;
  return (
    <div className="shot-row wrap">
      {exampleThumb(section, props.onOpenLink)}
      {section.slots.map((slot) => {
        const items = value?.slots[slot.key] ?? [];
        const kind = slot.action === "video" ? "video" : "photo";
        const cap = slotCap(section, slot);
        if (cap > 1) {
          return (
            <AlbumRow
              key={slot.key}
              items={items}
              cap={cap}
              kinds={[kind]}
              captureLabel={slot.label}
              onCapture={(next) => props.onCapture(section, next, { slotKey: slot.key })}
              onPick={(next) => props.onPick(section, next, { slotKey: slot.key })}
              onPreview={props.onPreview}
              onRemove={(id) => props.onRemove(section, id, { slotKey: slot.key })}
            />
          );
        }
        const item = items[0];
        return item ? (
          <Thumb
            key={slot.key}
            item={item}
            caption={slot.label}
            onOpen={() => props.onPreview(item)}
            onRemove={() => props.onRemove(section, item.id, { slotKey: slot.key })}
          />
        ) : (
          <CaptureTile
            key={slot.key}
            action={kind}
            label={slot.label}
            onClick={() => props.onCapture(section, kind, { slotKey: slot.key })}
            onPick={() => props.onPick(section, kind, { slotKey: slot.key })}
          />
        );
      })}
    </div>
  );
}

function GroupsBody(props: BodyProps) {
  const { section, value } = props;
  const groups = value?.groups ?? [];
  return (
    <div>
      {groups.map((group, idx) => (
        <GroupRow
          key={group.id}
          section={section}
          group={group}
          title={groupTitle(section, idx)}
          onCapture={(kind) => props.onCapture(section, kind, { groupId: group.id })}
          onPick={(kind) => props.onPick(section, kind, { groupId: group.id })}
          onRemove={(id) => props.onRemove(section, id, { groupId: group.id })}
          onPreview={props.onPreview}
        />
      ))}
      <button
        type="button"
        className="add-group"
        onClick={(e) => {
          e.stopPropagation();
          props.onAddGroup();
        }}
      >
        {section.addLabel || "+ Add"}
      </button>
    </div>
  );
}

function GroupRow({
  section,
  group,
  title,
  onCapture,
  onPick,
  onRemove,
  onPreview,
}: {
  section: Section;
  group: GroupValue;
  title: string;
  onCapture: (kind: "photo" | "video") => void;
  onPick: (kind: "photo" | "video") => void;
  onRemove: (id: string) => void;
  onPreview: (item: MediaItem) => void;
}) {
  const kinds = section.actions.filter((a): a is "photo" | "video" => a === "photo" || a === "video");
  const video = group.items.find((i) => i.kind === "video");
  return (
    <div className="group-block">
      <div className="group-head">
        <span className="group-name">{title}</span>
      </div>
      <div className="shot-row wrap">
        {kinds.includes("photo") ? (
          <AlbumRow
            items={group.items.filter((i) => i.kind === "photo")}
            cap={captureCap(section)}
            kinds={["photo"]}
            onCapture={onCapture}
            onPick={onPick}
            onPreview={onPreview}
            onRemove={onRemove}
          />
        ) : null}
        {kinds.includes("video") ? (
          video ? (
            <Thumb
              item={video}
              caption="Record"
              onOpen={() => onPreview(video)}
              onRemove={() => onRemove(video.id)}
            />
          ) : (
            <CaptureTile
              action="video"
              label="Record"
              onClick={() => onCapture("video")}
              onPick={() => onPick("video")}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

function AlbumRow({
  items,
  cap,
  kinds,
  captureLabel,
  example,
  onCapture,
  onPick,
  onPreview,
  onRemove,
}: {
  items: MediaItem[];
  cap: number;
  kinds: Array<"photo" | "video">;
  captureLabel?: string;
  example?: ReactNode;
  onCapture: (kind: "photo" | "video") => void;
  onPick: (kind: "photo" | "video") => void;
  onPreview: (item: MediaItem) => void;
  onRemove: (id: string) => void;
}) {
  const latest = items[items.length - 1];
  return (
    <div className="shot-cluster">
      {example}
      {kinds.map((kind) =>
        items.length < cap ? (
          <CaptureTile
            key={kind}
            action={kind}
            label={captureLabel ?? (kind === "video" ? "Record" : "Take Photo")}
            hint={kind === "photo" && cap > 1 ? `Max ${cap}` : undefined}
            onClick={() => onCapture(kind)}
            onPick={() => onPick(kind)}
          />
        ) : null,
      )}
      {latest ? (
        <Thumb
          item={latest}
          badge={items.length}
          onOpen={() => onPreview(latest)}
          onRemove={() => onRemove(latest.id)}
        />
      ) : null}
    </div>
  );
}

function Thumb({
  item,
  badge,
  caption,
  onOpen,
  onRemove,
}: {
  item: MediaItem;
  badge?: number;
  caption?: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="thumb">
      <button type="button" className="thumb-hit" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        {item.kind === "video" ? (
          <div className="thumb-video">
            <img src={item.url} alt="" />
            <span>Video</span>
          </div>
        ) : (
          <img src={item.url} alt="" />
        )}
      </button>
      {badge != null ? <span className="num-badge">{badge}</span> : null}
      {caption ? <span className="thumb-caption">{caption}</span> : null}
      <button
        type="button"
        className="thumb-x"
        aria-label="Remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <IconClose />
      </button>
    </div>
  );
}

function CaptureTile({
  action,
  label,
  hint,
  onClick,
  onPick,
}: {
  action: CaptureAction;
  label: string;
  hint?: string;
  onClick: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={hint ? "capture has-hint" : "capture"}
      title="Tap to capture a demo photo"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick();
      }}
    >
      <span className="cam-bubble">{action === "video" ? <IconVideo /> : <IconCam />}</span>
      <span>{label}</span>
      {hint ? <span className="capture-hint">{hint}</span> : null}
    </button>
  );
}

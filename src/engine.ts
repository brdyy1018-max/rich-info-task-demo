import {
  UNAVAILABLE_REASONS,
  type Answers,
  type FieldDef,
  type LayoutKind,
  type Section,
  type SectionValue,
  type Slot,
  type TaskTemplate,
} from "./types";

export function emptyValue(): SectionValue {
  return {
    items: [],
    slots: {},
    groups: [],
    fields: {},
    unavailable: false,
    unavailableReason: "",
    unavailableNote: "",
  };
}

export function sanitizeHref(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const withProtocol = /^[a-zA-Z][a-zA-Z+\-.]*:/.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function unavailableTitle(section: Pick<Section, "unavailableLabel">): string {
  const label = section.unavailableLabel?.trim();
  return label || "Not available";
}

export function unavailableReasonLabel(value: SectionValue): string {
  if (!value.unavailableReason) return "";
  if (value.unavailableReason === "other") return (value.unavailableNote ?? "").trim();
  return UNAVAILABLE_REASONS.find((r) => r.id === value.unavailableReason)?.label ?? "";
}

export function clearUnavailable(value: SectionValue): SectionValue {
  return { ...value, unavailable: false, unavailableReason: "", unavailableNote: "" };
}

export function groupTitle(section: Pick<Section, "groupLabel">, index: number): string {
  const prefix = section.groupLabel?.trim() || "Group";
  return `${prefix} ${index + 1}`;
}

export function captureCap(section: Section): number {
  return clampCap(section.maxItems);
}

export function slotCap(section: Section, slot: Slot): number {
  if (slot.action === "video") return 1;
  return clampCap(slot.maxItems ?? section.maxItems);
}

export function mediaCap(section: Section, kind: "photo" | "video", slot?: Slot): number {
  if (kind === "video") return 1;
  if (slot) return slotCap(section, slot);
  return captureCap(section);
}

function clampCap(n: unknown, fallback = 1): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(99, Math.max(1, Math.floor(v)));
}

export function hasPhotoCapture(section: Section): boolean {
  if (section.repeatable) return true;
  if (section.slots.some((s) => s.action === "photo")) return true;
  return section.actions.includes("photo") && section.slots.length === 0;
}

/** How a block renders is inferred from capture config — not a user-facing template. */
export function deriveLayout(section: Section): LayoutKind {
  const media = section.actions.includes("photo") || section.actions.includes("video");
  const form =
    section.actions.includes("text") ||
    section.actions.includes("select") ||
    section.actions.includes("check");
  if (section.repeatable && media) return "repeatable_group";
  if (section.slots.length > 0 && media) return "labeled_slots";
  if (form && !media) return "form";
  if (media) return "gallery";
  return "form";
}

export function followUpKey(field: Pick<FieldDef, "key">): string {
  return `${field.key}__note`;
}

export function isFollowUpVisible(field: FieldDef, selected: string): boolean {
  if (field.action !== "check" || !field.followUpEnabled) return false;
  if (!selected.trim()) return false;
  const when = (field.followUpWhen ?? "").trim();
  return !when || when === selected;
}

export function emptyAnswers(sections: Section[]): Answers {
  const next: Answers = {};
  for (const section of sections) {
    next[section.id] = emptyValue();
    for (const field of section.fields) {
      next[section.id].fields[field.key] = "";
      if (field.action === "check") next[section.id].fields[followUpKey(field)] = "";
    }
  }
  return next;
}

export function isSectionVisible(section: Section, template: TaskTemplate): boolean {
  if (!section.available) return false;
  if (section.visibleWhen === "always") return true;
  if (section.visibleWhen === "category:fnb") return template.category === "fnb";
  if (section.visibleWhen === "category:hotel") return template.category === "hotel";
  if (section.visibleWhen === "field:hours_missing") return true;
  return true;
}

function checkFieldsAnswered(section: Section, value: SectionValue): boolean {
  const checks = section.fields.filter((f) => f.action === "check");
  if (!checks.length) return true;
  return checks.every((f) => {
    const selected = (value.fields[f.key] ?? "").trim();
    if (!selected) return false;
    if (isFollowUpVisible(f, selected) && f.followUpRequired) {
      return (value.fields[followUpKey(f)] ?? "").trim().length > 0;
    }
    return true;
  });
}

function galleryDone(section: Section, v: SectionValue): boolean {
  return v.items.some((i) => section.actions.includes(i.kind));
}

function slotsDone(section: Section, v: SectionValue): boolean {
  return section.slots.some((slot) => (v.slots[slot.key]?.length ?? 0) >= 1);
}

function groupsDone(v: SectionValue): boolean {
  return v.groups.some((g) => g.items.length > 0);
}

export function isSectionComplete(section: Section, value: SectionValue | undefined): boolean {
  const v = value ?? emptyValue();
  if (v.unavailable) {
    if (!v.unavailableReason) return false;
    if (v.unavailableReason === "other") return (v.unavailableNote ?? "").trim().length > 0;
    return true;
  }
  if (!checkFieldsAnswered(section, v)) return false;
  const media = section.actions.includes("photo") || section.actions.includes("video");
  const parts: boolean[] = [];
  if (section.slots.length > 0 && media) parts.push(slotsDone(section, v));
  if (section.repeatable && media) parts.push(groupsDone(v));
  if (media && section.slots.length === 0 && !section.repeatable) parts.push(galleryDone(section, v));
  if (parts.length) return parts.every(Boolean);
  const otherFields = section.fields.filter((f) => f.action !== "check");
  if (!otherFields.length) return true;
  const requiredFields = otherFields.filter((f) => f.required);
  if (requiredFields.length) {
    return requiredFields.every((f) => (v.fields[f.key] ?? "").trim().length > 0);
  }
  if (section.fields.some((f) => f.action === "check")) return true;
  return otherFields.some((f) => (v.fields[f.key] ?? "").trim().length > 0);
}

export function canSubmit(template: TaskTemplate, answers: Answers): boolean {
  return template.sections
    .filter((s) => isSectionVisible(s, template) && s.required)
    .every((s) => isSectionComplete(s, answers[s.id]));
}

export function bindPayload(template: TaskTemplate, answers: Answers) {
  const payload: Record<string, unknown> = {
    template_id: template.id,
    poi_fields: {},
  };
  const fields: Record<string, unknown> = {};
  for (const section of template.sections) {
    if (!isSectionVisible(section, template)) continue;
    const v = answers[section.id] ?? emptyValue();
    if (v.unavailable) {
      fields[section.bindField] = {
        unavailable: true,
        reason: v.unavailableReason,
        ...(v.unavailableReason === "other" && (v.unavailableNote ?? "").trim()
          ? { note: (v.unavailableNote ?? "").trim() }
          : {}),
      };
      continue;
    }
    const typed = Object.values(v.fields).some((x) => x.trim().length) ? v.fields : undefined;
    const media = section.actions.includes("photo") || section.actions.includes("video");
    const out: Record<string, unknown> = {};
    if (media && section.slots.length === 0 && !section.repeatable) {
      out.items = v.items.map(({ id, kind, label }) => ({ id, kind, label }));
    }
    if (section.slots.length > 0) {
      out.slots = Object.fromEntries(
        section.slots.map((slot) => [
          slot.key,
          (v.slots[slot.key] ?? []).map(({ id, kind }) => ({ id, kind })),
        ]),
      );
    }
    if (section.repeatable) {
      out.groups = v.groups.map((g, i) => ({
        name: groupTitle(section, i),
        count: g.items.length,
        items: g.items.map(({ id, kind }) => ({ id, kind })),
      }));
    }
    if (typed) out.fields = typed;
    const keys = Object.keys(out);
    if (keys.length === 0) {
      fields[section.bindField] = v.fields;
    } else if (keys.length === 1 && keys[0] === "items") {
      fields[section.bindField] = out.items;
    } else if (keys.length === 1 && keys[0] === "slots") {
      fields[section.bindField] = out.slots;
    } else if (keys.length === 1 && keys[0] === "groups") {
      fields[section.bindField] = out.groups;
    } else {
      fields[section.bindField] = out;
    }
  }
  payload.poi_fields = fields;
  return payload;
}

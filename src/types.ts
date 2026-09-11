export type LayoutKind = "gallery" | "labeled_slots" | "repeatable_group" | "form";
export type CaptureAction = "photo" | "video" | "text" | "select" | "check";
export type VisibleWhen =
  | "always"
  | "category:fnb"
  | "category:hotel"
  | "field:hours_missing";

export type Slot = {
  key: string;
  label: string;
  action: CaptureAction;
  maxItems?: number;
};

export type FieldDef = {
  key: string;
  label: string;
  action: "text" | "select" | "check";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
};

export const DEFAULT_CHECK_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export type Section = {
  id: string;
  title: string;
  description: string;
  required: boolean;
  available: boolean;
  helpText: string;
  helpEnabled: boolean;
  exampleEnabled: boolean;
  exampleLabel: string;
  layout: LayoutKind;
  actions: CaptureAction[];
  minItems: number;
  maxItems: number;
  numbered: boolean;
  repeatable: boolean;
  slots: Slot[];
  addLabel: string;
  groupLabel: string;
  fields: FieldDef[];
  bindField: string;
  visibleWhen: VisibleWhen;
  unavailableButton: boolean;
  unavailableLabel: string;
};

export type TaskTemplate = {
  id: string;
  name: string;
  title: string;
  blurb: string;
  category: "fnb" | "retail" | "hotel" | "generic";
  sections: Section[];
};

export type MediaKind = "photo" | "video";

export type MediaItem = {
  id: string;
  url: string;
  kind: MediaKind;
  label?: string;
};

export type GroupValue = {
  id: string;
  name: string;
  items: MediaItem[];
};

export type UnavailableReasonId =
  | "exclusive"
  | "no_cooperate"
  | "materials_unattractive"
  | "materials_damaged"
  | "delayed_install"
  | "no_kp"
  | "other";

export type UnavailableReason = {
  id: UnavailableReasonId;
  label: string;
  needsInput?: boolean;
};

export const UNAVAILABLE_REASONS: UnavailableReason[] = [
  { id: "exclusive", label: "商家与他人签订“排他”" },
  { id: "no_cooperate", label: "不想与TT合作" },
  { id: "materials_unattractive", label: "物料不美观" },
  { id: "materials_damaged", label: "物料当场损坏" },
  { id: "delayed_install", label: "店家要求延迟铺设" },
  { id: "no_kp", label: "未找到KP人" },
  { id: "other", label: "Other", needsInput: true },
];

export type SectionValue = {
  items: MediaItem[];
  slots: Record<string, MediaItem[]>;
  groups: GroupValue[];
  fields: Record<string, string>;
  unavailable: boolean;
  unavailableReason: UnavailableReasonId | "";
  unavailableNote: string;
};

export type Answers = Record<string, SectionValue>;

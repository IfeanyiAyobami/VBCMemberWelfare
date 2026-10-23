export const sections = [
  "overview",
  "areas",
  "cells",
  "members",
  "attendance",
  "finances",
  "visitors",
  "reports",
  "communications",
  "leaders",
  "settings",
] as const;
export type Section = (typeof sections)[number];
export const titles: Record<Section, string> = {
  overview: "Dashboard",
  areas: "My Areas",
  cells: "Home Cells",
  members: "Members",
  attendance: "Attendance",
  finances: "Finances",
  visitors: "Visitors",
  reports: "Weekly Reports",
  communications: "Communications",
  leaders: "Leadership Accounts",
  settings: "Settings",
};
export type Area = { id: string; name: string };
export type Cell = {
  id: string;
  area_id: string;
  name: string;
  address: string | null;
  meeting_day: number;
  meeting_start: string;
  meeting_end: string;
};
export type Assignment = {
  id: string;
  role: string;
  area_id: string | null;
  cell_id: string | null;
};
export type Person = {
  id: string;
  other_names: string;
  surname: string;
  phone: string | null;
  email: string | null;
  status: string;
};
export type Membership = {
  id: string;
  member_id: string;
  cell_id: string;
  care_members: Person | null;
};
export type Meeting = {
  id: string;
  cell_id: string;
  meeting_date: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: string;
  version: number;
  submitted_at: string | null;
};
export type Attendance = {
  id: string;
  meeting_id: string;
  member_id: string | null;
  visitor_name: string | null;
  status: string;
};
export type Finance = {
  voided_at: string | null;
  void_reason: string | null;
  id: string;
  meeting_id: string;
  kind: string;
  amount: number;
  description: string | null;
  created_at: string;
};
export type Visit = {
  id: string;
  cell_id: string;
  meeting_id: string | null;
  member_id: string | null;
  guest_submission_id: string | null;
  visited_at: string;
  followup_status: string;
  notes: string | null;
  care_members: Person | null;
  care_guest_submissions: Person | null;
};
export type Correction = {
  id: string;
  meeting_id: string;
  reason: string;
  status: string;
  requested_at: string;
};
export type Announcement = {
  id: string;
  cell_id: string | null;
  area_id: string | null;
  title: string;
  body: string;
  created_at: string;
};
export type WorkspaceData = {
  email: string;
  churchAdmin: boolean;
  manager: boolean;
  assignments: Assignment[];
  scope: string;
  areas: Area[];
  cells: Cell[];
  memberships: Membership[];
  meetings: Meeting[];
  attendance: Attendance[];
  finances: Finance[];
  visits: Visit[];
  corrections: Correction[];
  announcements: Announcement[];
  from: string;
  to: string;
};
export function attendanceRate(rows: Attendance[]) {
  return rows.length
    ? Math.round(
        (rows.filter((r) => r.status !== "absent").length / rows.length) * 100,
      )
    : null;
}
export function money(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(n);
}

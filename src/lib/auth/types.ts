export type StaffRole = "administrator" | "editor" | "viewer" | "followup_worker";
export type StaffIdentity = {
  user_id: string;
  display_name: string;
  role: StaffRole;
  email: string;
};
export type StaffSession =
  | { status: "ready"; staff: StaffIdentity }
  | { status: "configuration"; message: string }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "unavailable" };

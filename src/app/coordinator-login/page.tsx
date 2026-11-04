import StaffAccess from "@/components/StaffAccess";
export default function Page() {
  return (
    <StaffAccess
      next="/followups"
      workspaceLabel="Follow Through Coordinator"
    />
  );
}

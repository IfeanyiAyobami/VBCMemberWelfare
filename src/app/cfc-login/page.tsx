import PinSignIn from "@/components/PinSignIn";

export default function Page() {
  return (
    <PinSignIn
      title="Foundational Class Leader"
      endpoint="/api/cfc/login"
      next="/cfc"
      help="Forgot your PIN? Call your Coordinator."
    />
  );
}

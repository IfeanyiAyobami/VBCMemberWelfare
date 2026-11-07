import PinSignIn from "@/components/PinSignIn";

export default function Page() {
  return (
    <PinSignIn
      title="Follow Through Friend"
      endpoint="/api/journey/friend-login"
      next="/followups"
      help="Forgot your PIN? Call your Coordinator."
    />
  );
}

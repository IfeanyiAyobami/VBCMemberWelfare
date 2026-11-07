import PinSignIn from "@/components/PinSignIn";

export default function Page() {
  return (
    <PinSignIn
      title="Home Cell leaders"
      endpoint="/api/home-cell/login"
      next="/home-cell"
      homeCell
      help="Forgot your PIN? Call your Coordinator."
    />
  );
}

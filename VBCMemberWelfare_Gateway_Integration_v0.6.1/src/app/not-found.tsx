import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <div className="eyebrow">Vine Branch Church</div>
      <h1>That page isn’t here.</h1>
      <p>Return to the care desk to continue your review.</p>
      <Link className="btn primary" href="/overview">
        Open care desk
      </Link>
    </main>
  );
}

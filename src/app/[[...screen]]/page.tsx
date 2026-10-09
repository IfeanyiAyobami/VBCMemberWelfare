import { notFound } from "next/navigation";
import CareApp from "@/components/CareApp";
import { isCareRoute } from "@/lib/routes";

export default async function CarePage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen = [] } = await params;
  if (!isCareRoute(screen.join("/"))) notFound();
  return <CareApp />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import islandsData from "../../../../public/data/islands.json";
import layoutData from "../../../../public/data/layout.json";
import { safeContactUrl } from "@/lib/config";
import type { Island, Sample } from "@/lib/types";
import { ResultActions } from "./ResultActions";

const islands = islandsData as Island[];
const samples = layoutData as Sample[];

export const dynamicParams = false;

export function generateStaticParams() {
  return islands.map((island) => ({ islandId: island.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ islandId: string }>;
}): Promise<Metadata> {
  const { islandId } = await params;
  const island = islands.find((candidate) => candidate.id === islandId);
  if (!island) return {};
  return {
    title: `${island.name}. Мир Аси`,
    description: "Твой остров в мире Аси",
    openGraph: {
      title: `${island.name}. Мир Аси`,
      description: "Твой остров в мире Аси",
      images: [`/share/${island.id}.jpg`],
    },
  };
}

export default async function ResultPage({ params }: { params: Promise<{ islandId: string }> }) {
  const { islandId } = await params;
  const island = islands.find((candidate) => candidate.id === islandId);
  if (!island) notFound();
  const collection = samples.filter((sample) => sample.islandId === island.id).slice(0, 9);
  return (
    <main className="static-result" style={{ "--island-color": island.color } as React.CSSProperties}>
      <div className="static-result-atmosphere" />
      <section className="static-result-content">
        <p className="reveal-kicker">Твой остров в мире Аси</p>
        <h1>{island.name}</h1>
        <div className="result-mosaic" aria-label="Обои острова">
          {collection.map((sample) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={sample.id} src={sample.srcset.md} alt="" width={320} height={320} />
          ))}
        </div>
        <ResultActions
          islandId={island.id}
          islandName={island.name}
          contactUrl={safeContactUrl(process.env.NEXT_PUBLIC_CONTACT_URL)}
        />
      </section>
    </main>
  );
}

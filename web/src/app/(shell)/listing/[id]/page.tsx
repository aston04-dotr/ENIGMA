import ListingDetailPageClient from "./page-client";

export function generateStaticParams() {
  if (process.env.CAP_LOCAL_BUNDLE === "1") {
    return [{ id: "__mobile__" }];
  }
  return [];
}

export default function ListingDetailPage() {
  return <ListingDetailPageClient />;
}

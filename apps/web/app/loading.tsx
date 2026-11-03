import { LoadingRegion, SkeletonHeading, SkeletonList, SkeletonStats } from "../components/Skeleton";

/** Shown while any page without its own loading screen is on its way (the dashboard, for one). */
export default function Loading(): JSX.Element {
  return (
    <LoadingRegion label="Loading…" className="space-y-6">
      <SkeletonHeading />
      <SkeletonStats />
      <SkeletonList rows={4} />
    </LoadingRegion>
  );
}

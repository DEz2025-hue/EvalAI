import { LoadingRegion, SkeletonCard, SkeletonHeading } from "../../components/Skeleton";

export default function Loading(): JSX.Element {
  return (
    <LoadingRegion label="Loading settings…" className="space-y-6">
      <SkeletonHeading />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={2} />
    </LoadingRegion>
  );
}

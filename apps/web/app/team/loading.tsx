import { LoadingRegion, SkeletonHeading, SkeletonTable } from "../../components/Skeleton";

export default function Loading(): JSX.Element {
  return (
    <LoadingRegion label="Loading team…" className="space-y-6">
      <SkeletonHeading />
      <SkeletonTable rows={5} cols={4} />
    </LoadingRegion>
  );
}

import { SkeletonListPage } from "../../components/Skeleton";

export default function Loading(): JSX.Element {
  return <SkeletonListPage label="Loading templates…" rows={4} />;
}

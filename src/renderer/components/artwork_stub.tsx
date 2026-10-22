export function ArtworkStub({ label }: { label: string }) {
  return <span className="artwork_stub" role="img" aria-label={`${label}: not yet available`} title={`${label}: not yet available`}>—</span>;
}

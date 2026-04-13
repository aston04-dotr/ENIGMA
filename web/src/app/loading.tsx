export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-main px-8">
      <div className="w-full max-w-[200px] space-y-4">
        <div className="mx-auto h-10 w-28 animate-skeleton rounded-lg bg-elev-2" />
        <div className="h-3 w-full animate-skeleton rounded bg-elev-2" />
        <div className="h-3 w-[85%] animate-skeleton rounded bg-elev-2" />
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { CreateListingForm } from "./create-form";

function CreateFallback() {
  return (
    <main className="safe-pt px-5 pb-10 pt-10">
      <p className="text-sm text-muted">Загрузка формы…</p>
    </main>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<CreateFallback />}>
      <CreateListingForm />
    </Suspense>
  );
}

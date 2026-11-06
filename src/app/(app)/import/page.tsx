import { ImportProspects, ImportRelations } from "./formulaires";

export default function PageImport() {
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Import</h1>
      <ImportRelations />
      <ImportProspects />
    </section>
  );
}

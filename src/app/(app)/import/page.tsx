import { EnTetePage } from "@/components/interface/elements";
import { ImportProspects, ImportRelations } from "./formulaires";

export default function PageImport() {
  return (
    <section className="flex flex-col">
      <EnTetePage description="Deux fichiers, dans cet ordre : tes relations LinkedIn pour connaître les statuts sans aucun appel, puis tes prospects." />
      <div className="flex max-w-[900px] flex-col gap-4 px-4 pb-8">
        <ImportRelations />
        <ImportProspects />
      </div>
    </section>
  );
}

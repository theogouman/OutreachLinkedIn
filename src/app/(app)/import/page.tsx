import { EnTetePage } from "@/components/interface/elements";
import { ImportProspects, ImportRelations } from "./formulaires";

export default function PageImport() {
  return (
    <section className="flex max-w-[860px] flex-col gap-6">
      <EnTetePage
        titre="Import"
        description="Tes relations LinkedIn pour connaître les statuts sans aucun appel, et tes prospects, dans n'importe quel ordre"
      />
      <ImportRelations />
      <ImportProspects />
    </section>
  );
}

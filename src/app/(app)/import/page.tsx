import { EnTetePage } from "@/components/interface/elements";
import { ImportProspects, ImportRelations } from "./formulaires";

export default function PageImport() {
  return (
    <section className="flex max-w-[860px] flex-col gap-6">
      <EnTetePage
        titre="Import"
        description="Deux fichiers, dans cet ordre : tes relations LinkedIn pour connaître les statuts sans aucun appel, puis tes prospects"
      />
      <ImportRelations />
      <ImportProspects />
    </section>
  );
}

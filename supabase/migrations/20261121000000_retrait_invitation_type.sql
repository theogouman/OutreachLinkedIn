-- Workflows (spec 001-workflows) : nouvelle action LinkedIn « retrait d'invitation ».
-- Fichier à part : une valeur d'enum ne peut pas servir dans la transaction qui la crée.
alter type public.type_action add value if not exists 'retrait_invitation';

-- Vue Kanban de la liste Prospects (src/lib/vues/catalogue.ts) : nouveau type de mise en page.
alter table public.vues drop constraint vues_type_check;
alter table public.vues add constraint vues_type_check check (type in ('table', 'galerie', 'kanban'));

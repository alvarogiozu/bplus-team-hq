-- Hoja de dibujo clara u oscura: cada dibujo recuerda su papel (el PNG ya sale pintado con ese papel
-- y, al volver a editarlo, las tintas se ven con los colores de ese papel).
alter table public.cuaderno_drawings add column if not exists paper text not null default 'claro';
alter table public.cuaderno_drawings drop constraint if exists cuaderno_drawings_paper_check;
alter table public.cuaderno_drawings add constraint cuaderno_drawings_paper_check check (paper in ('claro', 'oscuro'));

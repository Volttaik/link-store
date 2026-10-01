import Link from "next/link";
import { ProfileCard } from "@/components/cards/ProfileCard";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { query } from "@/lib/db";
import { SearchForm } from "@/components/ui/SearchForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "People", description: "Meet the people behind Rush Cart stores." };
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const people = await query<{ name: string; avatar_url: string | null; slug: string; store_name: string }>(
    `SELECT u.name, u.avatar_url, s.slug, s.name AS store_name FROM users u JOIN stores s ON s.user_id = u.id
     WHERE s.is_published = 1 AND (LOWER(u.name) LIKE ? OR LOWER(s.name) LIKE ?)
     ORDER BY s.updated_at DESC LIMIT 25 OFFSET ?`, [`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`, (page - 1) * 24],
  );
  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <PageHeader title="People" description="Meet the people behind independent stores. Private buyer accounts are not listed." />
    <SearchForm action="/people" className="flex max-w-md gap-2"><input aria-label="Search sellers" name="q" defaultValue={search} placeholder="Search people or stores" className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm" /><button className="rounded-xl bg-foreground px-4 py-2 text-sm text-background" type="submit">Search</button></SearchForm>
    {people.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{people.slice(0, 24).map(person => <ProfileCard key={person.slug} name={person.name} avatarUrl={person.avatar_url} handle={person.slug} caption={person.store_name} href={`/@${person.slug}`} actionLabel="Visit store" />)}</div> : <EmptyState title={search ? "No matching sellers" : "Meet sellers soon"} description="People appear here when they publish their store." />}
    <nav aria-label="People results" className="flex justify-between text-sm">{page > 1 ? <Link href={`/people?q=${encodeURIComponent(search)}&page=${page - 1}`}>Previous</Link> : <span />}{people.length > 24 ? <Link href={`/people?q=${encodeURIComponent(search)}&page=${page + 1}`}>Next</Link> : null}</nav>
  </div>;
}

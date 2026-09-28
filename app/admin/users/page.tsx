import { Card } from "@heroui/react/card";
import { Link } from "@heroui/react/link";
import { Table } from "@heroui/react/table";
import { TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";

import { AdminSearch, UserRoleControl } from "@/components/admin/AdminControls";
import { PageHeader, StatTile } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { UrlPagination } from "@/components/workspace/UrlPagination";
import { formatDateTime, formatNumber } from "@/lib/format";
import { countUsersForAdmin, getPlatformMetrics, listUsersForAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Users" };

const PAGE_SIZE = 20;

/**
 * Accounts.
 *
 * Role changes go through the server, which refuses to demote the last admin so
 * the platform can never be locked out of its own administration.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);

  const [total, metrics] = await Promise.all([countUsersForAdmin(query), getPlatformMetrics()]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  const users = await listUsersForAdmin({
    search: query,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Everyone with a LINK STORE account, and the storefronts they run."
        breadcrumb={
          <span className="text-xs text-muted">
            Admin <span className="mx-1">/</span> Users
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Accounts" value={formatNumber(metrics.users.total)} />
        <StatTile label="Admins" value={formatNumber(metrics.users.admins)} hint="Platform operators" />
        <StatTile label="New in 30 days" value={formatNumber(metrics.users.new30Days)} />
      </div>

      <Card className="ls-elev-2">
        <Card.Content className="gap-4">
          <AdminSearch action="/admin/users" defaultValue={query} placeholder="Search by name or email" />

          {users.length === 0 ? (
            <EmptyState icon="search"
              title={query ? "No accounts match that search" : "No accounts yet"}
              description={
                query
                  ? "Try a different name or email address."
                  : "Accounts appear here as people register."
              }
            />
          ) : (
            <Table aria-label="All users">
              <TableHeader>
                <TableColumn>Account</TableColumn>
                <TableColumn>Storefront</TableColumn>
                <TableColumn>Orders</TableColumn>
                <TableColumn>Joined</TableColumn>
                <TableColumn>Last sign-in</TableColumn>
                <TableColumn className="text-end">Role</TableColumn>
              </TableHeader>
              <TableBody items={users}>
                {(user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{user.name}</span>
                        <span className="text-xs text-muted">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.store_slug ? (
                        <div className="flex flex-col">
                          <Link href={`/@${user.store_slug}`}>
                            {user.store_name}
                          </Link>
                          <span className="text-xs text-muted">@{user.store_slug}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">No storefront</span>
                      )}
                    </TableCell>
                    <TableCell>{formatNumber(user.orders)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted">{formatDateTime(user.created_at)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted">
                        {user.last_login_at ? formatDateTime(user.last_login_at) : "Never"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <UserRoleControl userId={user.id} role={user.role} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <UrlPagination
            page={currentPage}
            totalPages={totalPages}
            summary={`Showing ${users.length} of ${total} accounts`}
          />
        </Card.Content>
      </Card>
    </div>
  );
}

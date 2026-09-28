import { Card } from "@heroui/react/card";
import { Link } from "@heroui/react/link";

import { PageHeader, StatTile, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { PayoutRequestForm } from "@/components/workspace/PayoutRequestForm";
import { UrlPagination } from "@/components/workspace/UrlPagination";
import { UrlTabs } from "@/components/workspace/UrlTabs";
import { formatDateTime, formatPercent } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requireStore } from "@/lib/auth";
import { paymentStatusTone } from "@/lib/catalog";
import {
  countTransactions,
  getFinanceOverview,
  listPayouts,
  listStorePayments,
  listTransactions,
} from "@/lib/server/insights";
import { getStoreSettings } from "@/lib/server/stores";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "balance", label: "Balance" },
  { key: "transactions", label: "Transactions" },
  { key: "payments", label: "Payments" },
  { key: "payouts", label: "Payouts" },
];

const PAGE_SIZE = 20;

/**
 * Finance.
 *
 * Every figure is aggregated from `transactions`, `orders` and `payouts` for
 * this store only, and the money ledger is the single source of truth — the
 * page never estimates a number it cannot read.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { store } = await requireStore();

  const tab = TABS.some((entry) => entry.key === params.tab) ? (params.tab as string) : "balance";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);

  const [finance, settings, payouts] = await Promise.all([
    getFinanceOverview(store.id),
    getStoreSettings(store.id),
    listPayouts(store.id),
  ]);

  const currency = finance.currency;

  const transactionCount = tab === "transactions" ? await countTransactions(store.id) : 0;
  const transactionPages = Math.max(Math.ceil(transactionCount / PAGE_SIZE), 1);
  const transactions =
    tab === "transactions"
      ? await listTransactions(store.id, {
          limit: PAGE_SIZE,
          offset: (Math.min(page, transactionPages) - 1) * PAGE_SIZE,
        })
      : [];

  const payments = tab === "payments" ? await listStorePayments(store.id, { limit: 25 }) : [];

  const hasBankDetails = Boolean(
    settings?.payout_account_number && settings?.payout_bank_name && settings?.payout_account_name,
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Finance" description="Revenue, fees and payouts computed from your settled transactions."
        breadcrumb={
          <span className="text-xs text-muted">
            Workspace <span className="mx-1">/</span> Finance
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Net revenue"
          value={formatMoney(finance.netRevenue, currency)}
          hint={`${finance.orderCount} paid order${finance.orderCount === 1 ? "" : "s"}`}
        />
        <StatTile label="Available balance"
          value={formatMoney(finance.available, currency)}
          hint={
            finance.payoutsPending > 0
              ? `${formatMoney(finance.payoutsPending, currency)} pending payout`
              : "Nothing pending"
          }
        />
        <StatTile label="Platform fees"
          value={formatMoney(finance.platformFees, currency)}
          hint={
            finance.grossRevenue > 0
              ? `${formatPercent((finance.platformFees / finance.grossRevenue) * 100)} of gross`
              : "No sales yet"
          }
        />
        <StatTile label="Average order"
          value={formatMoney(finance.averageOrderValue, currency)}
          hint={finance.refunds > 0 ? `${formatMoney(finance.refunds, currency)} refunded` : "No refunds"}
        />
      </div>

      <UrlTabs items={TABS} value={tab} ariaLabel="Finance sections" />

      {tab === "balance" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Revenue breakdown</h2>
              <p className="text-sm text-muted">
                Derived from settled transactions rather than order totals alone.
              </p>
            </Card.Header>
            <Card.Content className="gap-4">
              <BreakdownRow label="Gross revenue" value={formatMoney(finance.grossRevenue, currency)} />
              <BreakdownRow label="Platform fees"
                value={`− ${formatMoney(finance.platformFees, currency)}`}
              />
              <BreakdownRow label="Refunds" value={`− ${formatMoney(finance.refunds, currency)}`} />
              <BreakdownRow label="Net revenue"
                value={formatMoney(finance.netRevenue, currency)}
                emphasis
                dividerBefore
              />
              <BreakdownRow label="Paid out"
                value={formatMoney(finance.payoutsTotal, currency)}
                hint={`${finance.paidOutCount} payout${finance.paidOutCount === 1 ? "" : "s"} recorded`}
              />
              <BreakdownRow label="Available balance"
                value={formatMoney(finance.available, currency)}
                emphasis
                dividerBefore
              />
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Request a payout</h2>
              <p className="text-sm text-muted">Recorded against your ledger for review.</p>
            </Card.Header>
            <Card.Content>
              <PayoutRequestForm
                currency={currency}
                available={finance.available}
                hasBankDetails={hasBankDetails}
              />
            </Card.Content>
          </Card>
        </div>
      ) : null}

      {tab === "transactions" ? (
        transactions.length === 0 ? (
          <EmptyState icon="receipt" title="No transactions yet" description="Every sale, fee, refund and payout will be recorded here with a running balance."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Card className="ls-elev-2">
              <Card.Content className="gap-3 p-4">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 pb-3 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {transaction.description ?? transaction.type}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDateTime(transaction.created_at)}
                        {transaction.reference ? ` · ${transaction.reference}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusChip
                        label={transaction.type.replace(/_/g, " ")}
                        tone={transaction.type === "refund" ? "danger" : "default"}
                      />
                      <span
                        className={
                          transaction.direction === "credit"
                            ? "text-sm font-semibold text-success"
                            : "text-sm font-semibold text-danger"
                        }
                      >
                        {transaction.direction === "credit" ? "+" : "−"}{" "}
                        {formatMoney(transaction.amount, transaction.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </Card.Content>
            </Card>

            <UrlPagination
              page={page}
              totalPages={transactionPages}
              summary={`Showing ${transactions.length} of ${transactionCount} transactions`}
            />
          </div>
        )
      ) : null}

      {tab === "payments" ? (
        payments.length === 0 ? (
          <EmptyState icon="creditCard" title="No payment attempts yet" description="Paystack initialisations, successful charges and failures appear here for reconciliation."
          />
        ) : (
          <Card className="ls-elev-2">
            <Card.Content className="gap-3 p-4">
              {payments.map((payment) => (
                <div
                  key={payment.id} className="flex flex-wrap items-center justify-between gap-3 pb-3 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/workspace/orders/${payment.order_id}`} className="truncate text-sm font-medium"
                    >
                      {payment.order_number}
                    </Link>
                    <p className="text-xs text-muted">
                      {payment.email} · {formatDateTime(payment.paid_at ?? payment.created_at)}
                      {payment.channel ? ` · ${payment.channel}` : ""}
                    </p>
                    {payment.failure_reason ? (
                      <p className="text-xs text-danger">{payment.failure_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip
                      label={payment.status}
                      tone={paymentStatusTone(payment.status)}
                    />
                    <span className="text-sm font-semibold">
                      {formatMoney(payment.amount, payment.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </Card.Content>
          </Card>
        )
      ) : null}

      {tab === "payouts" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Payout history</h2>
              <p className="text-sm text-muted">Requests you have made and their current state.</p>
            </Card.Header>
            <Card.Content className="p-4">
              {payouts.length === 0 ? (
                <EmptyState icon="bank" title="No payouts yet" description="Once your balance is available you can request a payout, and it will be tracked here."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {payouts.map((payout) => (
                    <div
                      key={payout.id} className="flex flex-wrap items-center justify-between gap-3 pb-3 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {formatMoney(payout.amount, payout.currency)}
                        </p>
                        <p className="text-xs text-muted">
                          Requested {formatDateTime(payout.requested_at)}
                          {payout.destination ? ` · ${payout.destination}` : ""}
                        </p>
                        {payout.notes ? <p className="text-xs text-muted">{payout.notes}</p> : null}
                      </div>
                      <StatusChip
                        label={payout.status}
                        tone={
                          payout.status === "paid"
                            ? "success"
                            : payout.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Payout account</h2>
              <p className="text-sm text-muted">Where payouts are sent.</p>
            </Card.Header>
            <Card.Content className="gap-3">
              {hasBankDetails ? (
                <>
                  <Detail label="Bank" value={settings?.payout_bank_name ?? "—"} />
                  <Detail label="Account name" value={settings?.payout_account_name ?? "—"} />
                  <Detail label="Account number" value={settings?.payout_account_number ?? "—"} />
                  <Link href="/workspace/settings?tab=payments">
                    Update payout account
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Add your bank details so payouts can be sent to you.
                  </p>
                  <Link href="/workspace/settings?tab=payments">
                    Add payout account
                  </Link>
                </>
              )}
            </Card.Content>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  hint,
  emphasis,
  dividerBefore,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  dividerBefore?: boolean;
}) {
  return (
    <>
      {dividerBefore ? <div className="h-3" /> : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={emphasis ? "text-sm font-semibold" : "text-sm text-muted"}>{label}</p>
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        </div>
        <p className={emphasis ? "text-base font-semibold" : "text-sm font-medium"}>{value}</p>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

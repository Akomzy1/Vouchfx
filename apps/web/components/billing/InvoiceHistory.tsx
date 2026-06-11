import { History, Download, Check, Undo2, X } from "lucide-react";

export interface InvoiceRow {
  id: string;
  date: string;
  plan: string;
  amount: string;
  method: string;
  status: "paid" | "refunded" | "failed";
  downloadUrl: string | null;
}

const STATUS_STYLES: Record<InvoiceRow["status"], string> = {
  paid:     "text-profit bg-profit/10 border border-profit/20",
  refunded: "text-text-secondary bg-border/30 border border-border",
  failed:   "text-loss bg-loss/10 border border-loss/20",
};

const STATUS_LABELS: Record<InvoiceRow["status"], string> = {
  paid:     "Paid",
  refunded: "Refunded",
  failed:   "Failed",
};

function StatusPill({ status }: { status: InvoiceRow["status"] }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}>
      {status === "paid"     && <Check  size={10} strokeWidth={2.5} />}
      {status === "refunded" && <Undo2  size={10} />}
      {status === "failed"   && <X      size={10} strokeWidth={2.5} />}
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function InvoiceHistory({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <History size={16} className="text-primary" />
          <h3 className="text-sm font-bold tracking-tight text-text-primary">Invoice history</h3>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-muted">
          No invoices yet — they&apos;ll appear here once you subscribe.
        </div>
      ) : (
        <>
          {/* Column headers — desktop only */}
          <div className="hidden grid-cols-[1.1fr_1.4fr_0.9fr_0.9fr_2rem] items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:grid">
            <span>Date</span>
            <span>Plan</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Status</span>
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/50">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5 sm:grid sm:grid-cols-[1.1fr_1.4fr_0.9fr_0.9fr_2rem] sm:items-center"
              >
                {/* mobile: stacked left | desktop: date col + plan col */}
                <div className="min-w-0 sm:contents">
                  <p className="num text-[12.5px] font-medium text-text-primary">{inv.date}</p>
                  <p className="mt-0.5 sm:mt-0">
                    <span className="text-[12.5px] text-text-secondary">{inv.plan}</span>
                    <span className="num ml-2 hidden text-[11px] text-text-muted sm:inline">{inv.method}</span>
                  </p>
                </div>

                {/* mobile: right group | desktop: amount + status + download cols */}
                <div className="flex shrink-0 items-center gap-3 sm:contents">
                  <p className="num text-right text-[13px] font-semibold text-text-primary sm:text-right">
                    {inv.amount}
                  </p>
                  <div className="flex justify-center">
                    <StatusPill status={inv.status} />
                  </div>
                  {inv.downloadUrl ? (
                    <a
                      href={inv.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download invoice"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
                    >
                      <Download size={15} />
                    </a>
                  ) : (
                    <div className="h-8 w-8" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

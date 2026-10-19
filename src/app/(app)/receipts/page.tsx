"use client";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { suggestReceiptMatches } from "@/domain/dedupe";
import { formatINR } from "@/domain/money";

export default function Receipts() {
  const { receipts, records, linkReceipt } = useStore();
  return (
    <>
      <PageHeader title="Receipts" sub="We match receipts to card transactions. You confirm each link." actions={<Badge tone="warn">Mock receipts</Badge>} />
      <p className="mb-3 text-xs text-muted">Email receipt ingestion is not implemented; it needs an authorized integration.</p>
      {receipts.length === 0 ? <EmptyState title="No receipts" /> : (
        <div className="space-y-3">
          {receipts.map((rc) => {
            const linked = records.find((r) => r.receiptId === rc.id);
            const sugg = suggestReceiptMatches(rc, records)[0];
            const sr = sugg && records.find((r) => r.id === sugg.recordId);
            return (
              <Card key={rc.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-medium">{rc.merchant} · <span className="num">{formatINR(rc.amountPaise)}</span></div><div className="text-xs text-muted">{rc.date} · {rc.filename}{rc.orderId ? ` · ${rc.orderId}` : ""}</div></div>
                  {linked ? (
                    <div className="flex items-center gap-2"><Badge tone="good">Linked to {linked.merchant} {linked.date}</Badge><Button onClick={() => linkReceipt(rc.id, null)}>Unlink</Button></div>
                  ) : sr ? (
                    <div className="flex items-center gap-2"><span className="text-xs text-muted">Likely match: {sr.originalDescription} ({sugg.reasons.join(", ")})</span><Button variant="primary" onClick={() => linkReceipt(rc.id, sr.id)}>Link</Button></div>
                  ) : <Badge>No match found</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

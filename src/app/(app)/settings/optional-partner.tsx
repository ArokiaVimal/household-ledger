"use client";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useHousehold } from "@/components/household-context";
import { Badge, Button, Card, CardTitle } from "@/components/ui";
import { PartnerCard } from "./partner-card";

/**
 * Linking a partner is one optional way to split, not the point of the app. Until someone links, has an invitation
 * waiting or has been linked before, it is a small card; the full partner settings open on tap (or from onboarding with ?partner=1).
 */
export function OptionalPartner() {
  const { partner, offers, membership } = useHousehold();
  const involved = !!partner || offers.length > 0 || (membership?.invites.length ?? 0) > 0;
  const [open, setOpen] = useState(false);
  useEffect(() => { void Promise.resolve().then(() => { if (new URLSearchParams(window.location.search).get("partner") === "1") setOpen(true); }); }, []);
  if (open || involved) return <PartnerCard />;
  return (
    <Card className="space-y-3">
      <CardTitle action={<Badge>Optional</Badge>}><span className="inline-flex items-center gap-2"><Heart size={16} aria-hidden className="text-accent" />Link a partner</span></CardTitle>
      <p className="text-sm text-muted">Split often with one person? Invite them by email to share expenses and set your usual split. If you split with friends or groups, you can skip this.</p>
      <Button onClick={() => setOpen(true)}>Set up</Button>
    </Card>
  );
}

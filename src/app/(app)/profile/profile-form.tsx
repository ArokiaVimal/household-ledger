"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Avatar } from "@/components/avatar";
import { useProfile } from "@/components/profile-context";
import { Button, Card, CardTitle, ChipGroup, Field, Input, PageHeader } from "@/components/ui";
import { MAX_AVATAR_BYTES, ProfileInputSchema, validateAvatarDataUrl, type Profile, type ProfileInput } from "@/lib/profile/profile";

/** Centre-crop to a square and re-encode as a small JPEG, so the stored photo is tiny and always a JPEG. */
async function toSquareJpeg(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  for (const q of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (Math.floor(((url.length - 23) * 3) / 4) <= MAX_AVATAR_BYTES) return url;
  }
  throw new Error("too large");
}

export function ProfileForm() {
  const { profile, status, setProfile } = useProfile();
  if (!profile && status === "error") {
    return (
      <>
        <PageHeader title="Profile" />
        <Card><p role="alert" className="text-sm text-danger">Your profile could not be loaded. The server could not reach the database. Check that Firestore is created for this project, then reload. The server log has the exact error.</p></Card>
      </>
    );
  }
  if (!profile) {
    return (
      <>
        <PageHeader title="Profile" />
        <Card><p className="text-sm text-muted">Profiles need sign-in. This is prototype mode with fictional data, so there is no account to edit. Configure Firebase (see README) to use this page.</p></Card>
      </>
    );
  }
  return <Editor profile={profile} onSaved={setProfile} />;
}

function Editor({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileInput>({
    resolver: zodResolver(ProfileInputSchema),
    defaultValues: { displayName: profile.displayName, nickname: profile.nickname, phone: profile.phone, defaultView: profile.defaultView },
  });
  const nameNow = useWatch({ control, name: "displayName" });
  const viewNow = useWatch({ control, name: "defaultView" });
  const shown: Profile = { ...profile, displayName: nameNow || profile.displayName, avatarDataUrl: avatar === undefined ? profile.avatarDataUrl : avatar };
  const dirty = isDirty || avatar !== undefined;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    if (!file.type.startsWith("image/") || file.size > 10_000_000) return setMsg({ ok: false, text: "Choose an image under 10 MB." });
    try {
      const url = await toSquareJpeg(file);
      const err = validateAvatarDataUrl(url);
      if (err) return setMsg({ ok: false, text: err });
      setAvatar(url);
    } catch {
      setMsg({ ok: false, text: "Could not read that image. Try a JPEG or PNG." });
    }
  };

  const onSubmit = async (v: ProfileInput) => {
    setMsg(null);
    try {
      const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...v, ...(avatar !== undefined && { avatarDataUrl: avatar }) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save your profile.");
      onSaved(data.profile);
      setAvatar(undefined);
      setValue("displayName", data.profile.displayName, { shouldDirty: false });
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader title="Profile" sub="Your name, photo and preferences" />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <Card className="flex flex-col items-center gap-3 text-center">
          <Avatar profile={shown} size={112} />
          <div>
            <div className="font-medium">{shown.displayName}</div>
            <div className="text-xs text-muted">{profile.email}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Choose profile photo" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => fileRef.current?.click()}><Camera size={16} aria-hidden />Change photo</Button>
            {(shown.avatarDataUrl) && <Button type="button" onClick={() => setAvatar(null)}>Remove</Button>}
          </div>
          <p className="text-xs text-muted">Cropped to a square and saved as a small JPEG. {profile.providerPhotoUrl && !shown.avatarDataUrl ? "Showing your Google photo." : ""}</p>
        </Card>
        <Card className="space-y-3">
          <CardTitle>Basics</CardTitle>
          <Field label="Full name" error={errors.displayName?.message}><Input autoComplete="name" {...register("displayName")} /></Field>
          <Field label="Greeting name (optional)" error={errors.nickname?.message}><Input placeholder="e.g. Vimal" {...register("nickname")} /></Field>
          <Field label="Email (from your sign-in, not editable)"><Input value={profile.email} readOnly /></Field>
          <Field label="Phone (optional)" error={errors.phone?.message}><Input type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" {...register("phone")} /></Field>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted">Open the app showing</span>
            <ChipGroup label="Default view" options={[{ id: "personal", label: "Mine" }, { id: "household", label: "Everything" }]} value={viewNow} onChange={(v) => setValue("defaultView", v, { shouldDirty: true })} />
          </div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>{msg.text}</p>}
          <div className="flex justify-end"><Button type="submit" variant="primary" disabled={isSubmitting || !dirty}>{isSubmitting ? "Saving…" : "Save changes"}</Button></div>
        </Card>
      </form>
    </>
  );
}

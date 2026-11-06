import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { invoke } from "@/lib/platform/ipc";

export type IdentityValues = { name: string; email: string; signing_format: "openpgp" | "ssh" | "x509"; signing_key: string; sign_commits: boolean };
export type IdentityProfile = IdentityValues & { id: string; label: string; account?: { host: string; login: string } };
export type IdentityInfo = { effective: Record<string, string>; local: Record<string, string>; fingerprint: string };
export type IdentityApplyResult = { info: IdentityInfo; completed_keys: string[]; error: string | null };
type IdentityProfiles = {
  profiles: IdentityProfile[]; assignments: Record<string, string>;
  saveProfile: (profile: IdentityProfile) => void;
  removeProfile: (id: string) => void;
  assignGroup: (groupId: string, profileId: string | null) => void;
};
export function validateIdentity(profile: IdentityValues): void {
  if (!profile.name.trim() || /[\r\n\0<>]/.test(profile.name) || !/^[^\s<>@]+@[^\s<>@]+$/.test(profile.email)
    || !["openpgp", "ssh", "x509"].includes(profile.signing_format) || /[\r\n\0]/.test(profile.signing_key)
    || profile.sign_commits && !profile.signing_key.trim()) throw new Error("Invalid author or signing configuration.");
}
export const useIdentityProfiles = create<IdentityProfiles>()(persist((set) => ({
  profiles: [], assignments: {},
  saveProfile: profile => {
    validateIdentity(profile);
    if (!profile.id || !profile.label.trim()) throw new Error("Profile ID and label are required.");
    // Copy only known metadata; an imported object must never persist credential fields.
    const safe: IdentityProfile = { id: profile.id, label: profile.label, name: profile.name, email: profile.email, signing_format: profile.signing_format, signing_key: profile.signing_key, sign_commits: profile.sign_commits,
      ...(profile.account ? { account: { host: profile.account.host, login: profile.account.login } } : {}) };
    set(state => ({ profiles: [...state.profiles.filter(p => p.id !== profile.id), safe] }));
  },
  removeProfile: id => set(state => ({ profiles: state.profiles.filter(p => p.id !== id), assignments: Object.fromEntries(Object.entries(state.assignments).filter(([, profile]) => profile !== id)) })),
  assignGroup: (groupId, profileId) => set(state => {
    if (profileId && !state.profiles.some(p => p.id === profileId)) throw new Error("Unknown identity profile.");
    const assignments = { ...state.assignments };
    if (profileId) assignments[groupId] = profileId; else delete assignments[groupId];
    return { assignments };
  }),
}), { name: "l8git-identity-profiles-v1", storage: createJSONStorage(() => localStorage) }));

export function readIdentity(path: string): Promise<IdentityApplyResult> {
  return invoke("hub_identity_profile", { path, profile: null, expectedFingerprint: null });
}
export function applyIdentity(path: string, profile: IdentityValues, expectedFingerprint: string): Promise<IdentityApplyResult> {
  validateIdentity(profile);
  if (!expectedFingerprint) throw new Error("Preview current identity before applying a profile.");
  return invoke("hub_identity_profile", { path, profile: { name: profile.name, email: profile.email, signing_format: profile.signing_format, signing_key: profile.signing_key, sign_commits: profile.sign_commits }, expectedFingerprint });
}
export function identityDifferences(profile: IdentityValues, info: IdentityInfo): string[] {
  const expected: Record<string, string> = { "user.name": profile.name.trim(), "user.email": profile.email, "gpg.format": profile.signing_format, "user.signingkey": profile.signing_key, "commit.gpgsign": String(profile.sign_commits) };
  return Object.entries(expected).filter(([key, value]) => {
    let current = info.effective[key] ?? "";
    if (key === "commit.gpgsign") current = ["true", "yes", "on", "1"].includes(current.toLowerCase()) ? "true" : "false";
    if (key === "gpg.format" && !current) current = "openpgp";
    return current !== value;
  }).map(([key]) => key);
}

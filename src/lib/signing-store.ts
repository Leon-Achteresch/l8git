import { create } from 'zustand';

type SigningRevisionState = {
  revision: number;
  bump: () => void;
};

export const useSigningRevision = create<SigningRevisionState>(set => ({
  revision: 0,
  bump: () => set(s => ({ revision: s.revision + 1 })),
}));

export function notifySigningChanged() {
  useSigningRevision.getState().bump();
}

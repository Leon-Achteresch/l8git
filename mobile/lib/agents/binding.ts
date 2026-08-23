import { create } from 'zustand';

export interface AgentBindingState {
  hostId: string | null;
  epoch: number;
}

export const useAgentBinding = create<AgentBindingState>(() => ({ hostId: null, epoch: 0 }));

export function boundAgentHostId(): string | null {
  return useAgentBinding.getState().hostId;
}

interface BindingOwnerState {
  stack: number[];
}

export const useBindingOwners = create<BindingOwnerState>(() => ({ stack: [] }));

let lastOwnerId = 0;

export function nextBindingOwnerId(): number {
  lastOwnerId += 1;
  return lastOwnerId;
}

export function claimBindingOwner(id: number): () => void {
  useBindingOwners.setState((state) => ({ stack: [...state.stack, id] }));
  return () => {
    useBindingOwners.setState((state) => ({
      stack: state.stack.filter((entry) => entry !== id),
    }));
  };
}

export function isBindingOwner(stack: readonly number[], id: number): boolean {
  return stack.length === 0 || stack[stack.length - 1] === id;
}

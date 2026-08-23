import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimBindingOwner,
  isBindingOwner,
  nextBindingOwnerId,
  useBindingOwners,
} from './binding';

beforeEach(() => {
  useBindingOwners.setState({ stack: [] });
});

describe('binding ownership', () => {
  it('lets a lone consumer drive the binding', () => {
    const id = nextBindingOwnerId();
    claimBindingOwner(id);
    expect(isBindingOwner(useBindingOwners.getState().stack, id)).toBe(true);
  });

  it('hands the binding to the consumer that mounted last', () => {
    const overview = nextBindingOwnerId();
    const chat = nextBindingOwnerId();
    claimBindingOwner(overview);
    claimBindingOwner(chat);

    const { stack } = useBindingOwners.getState();
    expect(isBindingOwner(stack, overview)).toBe(false);
    expect(isBindingOwner(stack, chat)).toBe(true);
  });

  it('returns ownership to the background consumer once the foreground one unmounts', () => {
    const overview = nextBindingOwnerId();
    const chat = nextBindingOwnerId();
    claimBindingOwner(overview);
    const releaseChat = claimBindingOwner(chat);
    releaseChat();

    const { stack } = useBindingOwners.getState();
    expect(stack).toEqual([overview]);
    expect(isBindingOwner(stack, overview)).toBe(true);
  });

  it('releases only its own claim when consumers unmount out of order', () => {
    const overview = nextBindingOwnerId();
    const chat = nextBindingOwnerId();
    const releaseOverview = claimBindingOwner(overview);
    claimBindingOwner(chat);
    releaseOverview();

    const { stack } = useBindingOwners.getState();
    expect(stack).toEqual([chat]);
    expect(isBindingOwner(stack, chat)).toBe(true);
  });

  it('treats every consumer as owner before the first claim lands', () => {
    expect(isBindingOwner([], nextBindingOwnerId())).toBe(true);
  });

  it('hands out distinct ids', () => {
    expect(nextBindingOwnerId()).not.toBe(nextBindingOwnerId());
  });
});

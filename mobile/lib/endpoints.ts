const ENDPOINT_PATTERN = /^(wss?):\/\/([^/?#]+)(\/[^?#]*)?$/i;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

export const LAN_ONLY_MESSAGE =
  'This host has no local network address (it was paired for the removed relay). Re-pair on the local network.';

export class NoLanEndpointError extends Error {
  constructor() {
    super(LAN_ONLY_MESSAGE);
    this.name = 'NoLanEndpointError';
  }
}

export function isLanEndpoint(endpoint: string): boolean {
  const match = ENDPOINT_PATTERN.exec(endpoint.trim());
  if (!match) {
    return false;
  }
  const [, scheme, authority, path] = match;
  if (scheme.toLowerCase() !== 'ws') {
    return false;
  }
  if (path && path !== '/' && path !== '/ws') {
    return false;
  }
  const host = authority.replace(/^\[/, '').replace(/\](:\d+)?$/, '').replace(/:\d+$/, '');
  return host === 'localhost' || IPV4_PATTERN.test(host) || host.includes(':');
}

export function lanEndpoints(endpoints: readonly string[]): string[] {
  return endpoints.map((endpoint) => endpoint.trim()).filter(isLanEndpoint);
}

export function requireLanEndpoints(endpoints: readonly string[]): string[] {
  const lan = lanEndpoints(endpoints);
  if (lan.length === 0) {
    throw new NoLanEndpointError();
  }
  return lan;
}

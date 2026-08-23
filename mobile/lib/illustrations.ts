export const illustrations = {
  repo: require('~/assets/illustrations/repo.png'),
  agent: require('~/assets/illustrations/agent.png'),
  inbox: require('~/assets/illustrations/inbox.png'),
  dashboard: require('~/assets/illustrations/dash.png'),
  host: require('~/assets/illustrations/host.png'),
} as const;

export const illustrationsLarge = {
  repo: require('~/assets/illustrations/repo-lg.png'),
  agent: require('~/assets/illustrations/agent-lg.png'),
  inbox: require('~/assets/illustrations/inbox-lg.png'),
  dashboard: require('~/assets/illustrations/dash-lg.png'),
  host: require('~/assets/illustrations/host-lg.png'),
} as const;

export type IllustrationName = keyof typeof illustrations;

import { ActivityCenter } from "./activity-center";

import { InboxHeaderButton } from "@/components/inbox/inbox-header-button";
import { AppHeaderSearch } from "@/components/app/app-header-search";
import { MainNav, UtilityNav } from "@/components/app/shell/shell-nav";
import {
  NO_DRAG,
  ShellDivider,
  ShellTopBar,
} from "@/components/app/shell/shell-chrome";
import { RepoTabBar } from "@/components/repo/tabs/repo-tab-bar";

/** Classic shell header: repo tabs on the left, search and navigation on the right. */
export function AppHeader() {
  return (
    <ShellTopBar macInset className="h-12 items-stretch gap-1 overflow-hidden pl-2">
      <RepoTabBar />

      <div className="flex shrink-0 items-center gap-0.5 pr-1.5" style={NO_DRAG}>
        <AppHeaderSearch />
        <ActivityCenter />
        <InboxHeaderButton />
        <ShellDivider vertical />
        <MainNav variant="header" />
        <ShellDivider vertical />
        <UtilityNav variant="header" />
      </div>
    </ShellTopBar>
  );
}

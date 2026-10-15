import { createContext, useContext } from "react";

/** How repo tabs/groups render: horizontal header tabs or vertical rail/list entries. */
export type RepoStripStyle = "classic" | "labeled" | "flat" | "rail" | "list";

export const RepoStripStyleContext = createContext<RepoStripStyle>("classic");

export const useRepoStripStyle = () => useContext(RepoStripStyleContext);

export const isVerticalStrip = (style: RepoStripStyle) =>
  style === "rail" || style === "list";

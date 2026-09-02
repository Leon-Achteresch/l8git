import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { SPRING_SWAP } from "@/lib/motion/ease";

export function ApprovalProgressDots({
  current,
  ids,
}: {
  current: number;
  ids: string[];
}) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-1.5">
      <span className="sr-only">
        {t("agentChat.request.questionProgress", {
          current: current + 1,
          total: ids.length,
        })}
      </span>
      {ids.map((id, index) => (
        <m.span
          key={id}
          aria-hidden="true"
          initial={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          animate={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          transition={SPRING_SWAP}
          className="size-1.5 rounded-full bg-current"
        />
      ))}
    </span>
  );
}

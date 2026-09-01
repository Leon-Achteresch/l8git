import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OptionLabel } from "@/components/agents/ui/approval-card/option-label";
import type {
  ApprovalCardAnswer,
  ApprovalCardQuestion,
} from "@/components/agents/ui/approval-card/types";
import { cn } from "@/lib/utils";

export function QuestionOptions({
  question,
  answer,
  disabled,
  onChange,
  onSingleSelect,
}: {
  question: ApprovalCardQuestion;
  answer: ApprovalCardAnswer;
  disabled: boolean;
  onChange: (answer: ApprovalCardAnswer) => void;
  onSingleSelect?: () => void;
}) {
  const custom = answer.custom ?? "";

  return (
    <div className="mt-3">
      {question.options?.length ? (
        question.multiple ? (
          <div className="grid gap-0.5">
            {question.options.map((option) => (
              <label
                key={option.value}
                className="flex min-h-9 cursor-pointer items-start gap-3 rounded-lg px-1.5 py-1.5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={answer.selected.includes(option.value)}
                  disabled={disabled || option.disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...answer,
                      selected:
                        checked === true
                          ? [...answer.selected, option.value]
                          : answer.selected.filter(
                              (value) => value !== option.value,
                            ),
                    })
                  }
                />
                <OptionLabel option={option} />
              </label>
            ))}
          </div>
        ) : (
          <RadioGroup
            value={answer.selected[0] ?? ""}
            onValueChange={(value) => {
              onChange({ selected: [value], custom: "" });
              onSingleSelect?.();
            }}
            className="gap-0.5"
          >
            {question.options.map((option) => (
              <label
                key={option.value}
                className="flex min-h-9 cursor-pointer items-start gap-3 rounded-lg px-1.5 py-1.5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
              >
                <RadioGroupItem
                  className="mt-0.5"
                  value={option.value}
                  disabled={disabled || option.disabled}
                />
                <OptionLabel option={option} />
              </label>
            ))}
          </RadioGroup>
        )
      ) : null}

      {question.allowCustom ? (
        <Input
          type={question.secret ? "password" : "text"}
          autoComplete={question.secret ? "off" : undefined}
          value={custom}
          disabled={disabled}
          placeholder={question.customPlaceholder ?? "Add another response…"}
          onChange={(event) =>
            onChange({
              selected: question.multiple ? answer.selected : [],
              custom: event.target.value,
            })
          }
          className={cn(
            "h-10 rounded-xl border-0 bg-background/70 px-3 text-sm focus-visible:bg-background",
            question.options?.length && "mt-1.5",
          )}
        />
      ) : null}
    </div>
  );
}

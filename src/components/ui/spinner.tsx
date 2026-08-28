import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"
import { SpinIcon } from "@/components/motion/kit";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <SpinIcon icon={Loader2Icon} role="status" aria-label="Loading" className={cn("size-4", className)} {...props} />
  )
}

export { Spinner }

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // 温暖守护者 v2：实色背景
        "flex min-h-[120px] w-full rounded-xl",
        "border border-border/60 bg-muted/50",
        "px-4 py-3 text-sm text-foreground",
        "placeholder:text-muted-foreground/60",
        "transition-all duration-200",
        "focus:bg-background focus:border-primary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };













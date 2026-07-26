import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-xl border transition-shadow",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border shadow-sm hover:shadow-md",
        muted: "bg-muted text-foreground border-transparent",
        accent: "bg-accent text-accent-foreground border-transparent",
        outline: "bg-transparent text-foreground border-border shadow-none",
      },
      padding: {
        none: "p-0",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
);

interface CardProps extends VariantProps<typeof cardVariants> {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ title, children, className, variant, padding }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant, padding }), className)}>
      {title && <h3 className="font-semibold mb-3 text-foreground">{title}</h3>}
      {children}
    </div>
  );
}

export { cardVariants };

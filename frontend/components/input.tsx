import { cva, type VariantProps } from "class-variance-authority";
import cn from "utils/cn";

const inputVariants = cva("", {
  variants: {
    variant: {},
  },
  defaultVariants: {},
});

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>;

const Input = ({ className, variant, ...props }: InputProps) => {
  return (
    <input className={cn(inputVariants({ className, variant }))} {...props} />
  );
};

export { Input, inputVariants };

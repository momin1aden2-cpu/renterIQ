import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "teal" | "outline";
  children: ReactNode;
  fullWidth?: boolean;
}

export default function Button({
  variant = "primary",
  children,
  fullWidth = false,
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-sora font-bold text-sm min-h-[44px] px-6 transition-colors";

  const variants = {
    primary: "bg-blue text-white hover:bg-blue-md active:bg-blue-dk",
    teal: "bg-teal text-white hover:bg-teal-dk active:bg-teal-dk",
    outline:
      "bg-white text-blue border border-border hover:bg-blue-xl active:bg-blue-lt",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

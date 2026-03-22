import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  large?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, large, className = "", onClick }: CardProps) {
  return (
    <div
      className={`${large ? "card-lg" : "card"} p-4 ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

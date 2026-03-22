interface StatusTagProps {
  label: string;
  variant?: "blue" | "teal" | "amber" | "red" | "neutral";
}

const variantStyles: Record<string, string> = {
  blue: "bg-blue-lt text-blue",
  teal: "bg-[#D6F5EC] text-teal-dk",
  amber: "bg-[#FFF3D6] text-[#A6700A]",
  red: "bg-[#FFE4E4] text-[#C62828]",
  neutral: "bg-[#F0F2F5] text-muted",
};

export default function StatusTag({ label, variant = "blue" }: StatusTagProps) {
  return (
    <span className={`status-tag ${variantStyles[variant]}`}>
      {label}
    </span>
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function ScreenHeader({ title, subtitle, children }: ScreenHeaderProps) {
  return (
    <header
      className="sticky top-0 z-10 px-5 pt-[52px] pb-4"
      style={{ background: "var(--blue)" }}
    >
      <div className="max-w-[390px] mx-auto">
        <h1 className="text-white text-xl font-sora font-extrabold leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-blue-lt text-sm mt-0.5 font-nunito">{subtitle}</p>
        )}
        {children}
      </div>
    </header>
  );
}

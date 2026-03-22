"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  Wrench,
  MessageSquare,
  User,
} from "lucide-react";

const tabs = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Leases", href: "/leases", icon: FileText },
  { label: "Repairs", href: "/maintenance", icon: Wrench },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Profile", href: "/profile", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border-lt"
      style={{ paddingBottom: 20 }}
    >
      <div className="flex items-center justify-around h-[60px] max-w-[390px] mx-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] gap-0.5"
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                  active ? "bg-blue text-white" : "text-muted"
                }`}
              >
                <Icon size={20} strokeWidth={2} />
              </div>
              <span
                className={`text-[10px] font-sora font-bold leading-tight ${
                  active ? "text-blue" : "text-muted"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

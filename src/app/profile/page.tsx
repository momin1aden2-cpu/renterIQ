import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import {
  User,
  Bell,
  Shield,
  HelpCircle,
  FileText,
  ChevronRight,
  LogOut,
} from "lucide-react";

const menuItems = [
  { label: "Personal Details", icon: User, href: "#" },
  { label: "Notifications", icon: Bell, href: "#" },
  { label: "Privacy & Security", icon: Shield, href: "#" },
  { label: "Documents", icon: FileText, href: "#" },
  { label: "Help & Support", icon: HelpCircle, href: "#" },
];

export default function ProfilePage() {
  return (
    <>
      <ScreenHeader title="Profile" subtitle="Manage your account" />

      <div className="px-4 py-5 flex flex-col gap-4">
        {/* User info */}
        <Card className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue flex items-center justify-center">
            <span className="text-white font-sora font-extrabold text-xl">A</span>
          </div>
          <div>
            <p className="font-sora font-bold text-base">Alex Taylor</p>
            <p className="text-muted text-xs">alex.taylor@email.com.au</p>
            <p className="text-muted text-xs">Sydney, NSW</p>
          </div>
        </Card>

        {/* Menu */}
        <Card className="p-0 divide-y divide-border-lt">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3.5 min-h-[44px] hover:bg-blue-xl transition-colors first:rounded-t-card last:rounded-b-card"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-lt flex items-center justify-center">
                  <Icon size={18} className="text-blue" />
                </div>
                <span className="flex-1 font-nunito font-semibold text-sm">
                  {item.label}
                </span>
                <ChevronRight size={16} className="text-muted" />
              </a>
            );
          })}
        </Card>

        {/* Sign out */}
        <Button variant="outline" fullWidth className="text-red-500 border-red-200 hover:bg-red-50">
          <LogOut size={16} />
          Sign Out
        </Button>

        <p className="text-center text-[10px] text-muted">
          RenterIQ v0.1.0 · Made for Australian renters
        </p>
      </div>
    </>
  );
}

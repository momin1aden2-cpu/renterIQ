import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import StatusTag from "@/components/StatusTag";
import { MessageSquare, Building2, ShieldCheck } from "lucide-react";

const conversations = [
  {
    id: 1,
    name: "Ray White Surry Hills",
    icon: Building2,
    iconBg: "bg-blue-lt",
    iconColor: "text-blue",
    lastMessage: "Thanks for reporting the tap issue. A plumber has been scheduled for Thursday.",
    time: "2h ago",
    unread: true,
  },
  {
    id: 2,
    name: "RenterIQ Assistant",
    icon: ShieldCheck,
    iconBg: "bg-[#D6F5EC]",
    iconColor: "text-teal",
    lastMessage: "Your rent increase notice has been reviewed. It appears compliant with NSW fair trading guidelines.",
    time: "1d ago",
    unread: false,
  },
  {
    id: 3,
    name: "Strata Management",
    icon: Building2,
    iconBg: "bg-blue-lt",
    iconColor: "text-blue",
    lastMessage: "Building maintenance scheduled for this Saturday — water may be disrupted 9am–12pm.",
    time: "3d ago",
    unread: false,
  },
];

export default function MessagesPage() {
  return (
    <>
      <ScreenHeader title="Messages" subtitle="Conversations with agents and support" />

      <div className="px-4 py-5 flex flex-col gap-3">
        {conversations.map((convo) => {
          const Icon = convo.icon;
          return (
            <Card key={convo.id} className="cursor-pointer hover:border-blue transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${convo.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={20} className={convo.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-sora font-bold text-sm truncate">{convo.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted text-[11px]">{convo.time}</span>
                      {convo.unread && (
                        <div className="w-2 h-2 rounded-full bg-teal" />
                      )}
                    </div>
                  </div>
                  <p className="text-muted text-xs leading-relaxed line-clamp-2">
                    {convo.lastMessage}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import StatusTag from "@/components/StatusTag";
import Button from "@/components/Button";
import { Wrench, Droplets, Zap, ThermometerSun, Plus } from "lucide-react";

const repairs = [
  {
    id: 1,
    title: "Leaking kitchen tap",
    icon: Droplets,
    iconBg: "bg-blue-lt",
    iconColor: "text-blue",
    status: "In Progress",
    statusVariant: "amber" as const,
    date: "Lodged 12 Mar 2026",
    description: "Persistent drip from the mixer tap. Washer likely needs replacing.",
  },
  {
    id: 2,
    title: "Broken power point — bedroom",
    icon: Zap,
    iconBg: "bg-[#FFF3D6]",
    iconColor: "text-[#A6700A]",
    status: "Urgent",
    statusVariant: "red" as const,
    date: "Lodged 8 Mar 2026",
    description: "Double power point in main bedroom not working. Tested with multiple devices.",
  },
  {
    id: 3,
    title: "Air con servicing",
    icon: ThermometerSun,
    iconBg: "bg-[#D6F5EC]",
    iconColor: "text-teal",
    status: "Completed",
    statusVariant: "teal" as const,
    date: "Resolved 1 Feb 2026",
    description: "Annual service completed. Filters replaced, system running efficiently.",
  },
];

export default function MaintenancePage() {
  return (
    <>
      <ScreenHeader title="Repairs" subtitle="Track and lodge maintenance requests">
        <div className="mt-3">
          <Button variant="teal" className="text-xs h-10 px-4">
            <Plus size={16} />
            Lodge New Repair
          </Button>
        </div>
      </ScreenHeader>

      <div className="px-4 py-5 flex flex-col gap-4">
        {repairs.map((repair) => {
          const Icon = repair.icon;
          return (
            <Card key={repair.id} className="cursor-pointer hover:border-blue transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${repair.iconBg} flex items-center justify-center`}>
                    <Icon size={20} className={repair.iconColor} />
                  </div>
                  <div>
                    <p className="font-sora font-bold text-sm">{repair.title}</p>
                    <p className="text-muted text-[11px]">{repair.date}</p>
                  </div>
                </div>
                <StatusTag label={repair.status} variant={repair.statusVariant} />
              </div>
              <p className="text-muted text-xs leading-relaxed ml-[52px]">
                {repair.description}
              </p>
            </Card>
          );
        })}

        <p className="text-[10px] text-muted text-center italic mt-2">
          AI-assisted · Reviewed by tenant
        </p>
      </div>
    </>
  );
}

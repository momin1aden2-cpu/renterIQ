import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import StatusTag from "@/components/StatusTag";
import { FileText, ChevronRight, Calendar, DollarSign } from "lucide-react";

const leases = [
  {
    id: 1,
    address: "42 Harbour St, Sydney NSW 2000",
    status: "Active" as const,
    statusVariant: "teal" as const,
    rent: "$620/week",
    start: "15 Nov 2024",
    end: "14 Nov 2026",
  },
  {
    id: 2,
    address: "17 Bondi Rd, Bondi NSW 2026",
    status: "Expired" as const,
    statusVariant: "neutral" as const,
    rent: "$540/week",
    start: "1 Mar 2022",
    end: "28 Feb 2024",
  },
];

export default function LeasesPage() {
  return (
    <>
      <ScreenHeader title="Leases" subtitle="Manage your rental agreements" />

      <div className="px-4 py-5 flex flex-col gap-4">
        {leases.map((lease) => (
          <Card key={lease.id} className="cursor-pointer hover:border-blue transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-lt flex items-center justify-center">
                  <FileText size={20} className="text-blue" />
                </div>
                <div>
                  <p className="font-sora font-bold text-sm">{lease.address.split(",")[0]}</p>
                  <p className="text-muted text-xs">{lease.address.split(",")[1]?.trim()}</p>
                </div>
              </div>
              <StatusTag label={lease.status} variant={lease.statusVariant} />
            </div>

            <div className="flex items-center gap-4 text-xs text-muted mt-2">
              <div className="flex items-center gap-1.5">
                <DollarSign size={14} />
                <span>{lease.rent}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} />
                <span>{lease.start} – {lease.end}</span>
              </div>
            </div>

            <div className="flex items-center justify-end mt-3 text-blue text-xs font-sora font-bold">
              <span>View Details</span>
              <ChevronRight size={16} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import StatusTag from "@/components/StatusTag";
import Button from "@/components/Button";
import {
  FileText,
  Wrench,
  ShieldCheck,
  TrendingUp,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export default function Home() {
  return (
    <>
      <ScreenHeader title="G'day, Alex" subtitle="Here's your renting snapshot" />

      <div className="px-4 py-5 flex flex-col gap-4">
        {/* Lease summary card */}
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-lt flex items-center justify-center">
                <FileText size={20} className="text-blue" />
              </div>
              <div>
                <p className="font-sora font-bold text-sm">42 Harbour St</p>
                <p className="text-muted text-xs">Sydney NSW 2000</p>
              </div>
            </div>
            <StatusTag label="Active" variant="teal" />
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Lease ends 14 Nov 2026</span>
            <ChevronRight size={16} />
          </div>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="flex flex-col items-center gap-2 py-5 cursor-pointer hover:border-blue transition-colors">
            <div className="w-11 h-11 rounded-xl bg-blue-lt flex items-center justify-center">
              <Wrench size={20} className="text-blue" />
            </div>
            <span className="font-sora font-bold text-xs text-center">
              Log Repair
            </span>
          </Card>

          <Card className="flex flex-col items-center gap-2 py-5 cursor-pointer hover:border-blue transition-colors">
            <div className="w-11 h-11 rounded-xl bg-[#D6F5EC] flex items-center justify-center">
              <ShieldCheck size={20} className="text-teal" />
            </div>
            <span className="font-sora font-bold text-xs text-center">
              Know Your Rights
            </span>
          </Card>
        </div>

        {/* Rent tracker */}
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-lt flex items-center justify-center">
              <TrendingUp size={20} className="text-blue" />
            </div>
            <div>
              <p className="font-sora font-bold text-sm">Rent Tracker</p>
              <p className="text-muted text-xs">Next payment in 5 days</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-sora font-extrabold">$620</p>
              <p className="text-muted text-xs">/week</p>
            </div>
            <StatusTag label="On Track" variant="teal" />
          </div>
        </Card>

        {/* AI insight card */}
        <Card large className="border-l-4 border-l-teal">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D6F5EC] flex items-center justify-center shrink-0">
              <Sparkles size={20} className="text-teal" />
            </div>
            <div>
              <p className="font-sora font-bold text-sm mb-1">AI Insight</p>
              <p className="text-muted text-xs leading-relaxed">
                Your lease renewal window opens in 90 days. Based on comparable
                rentals nearby, current market rate is $600–$650/week.
              </p>
              <p className="text-[10px] text-muted mt-2 italic">
                AI-assisted · Reviewed by tenant
              </p>
            </div>
          </div>
        </Card>

        {/* CTA */}
        <Button variant="teal" fullWidth>
          Explore RenterIQ Tools
        </Button>
      </div>
    </>
  );
}

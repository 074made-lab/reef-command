/** The renderer for the component protocol: one branch per ComponentSpec
 *  kind. This is the whole point of the app — answers are components. */

import type { ComponentSpec } from "@/lib/protocol";
import { AttentionFeed } from "./AttentionFeed";
import { AuctionBoard } from "./AuctionBoard";
import { CampaignCard } from "./CampaignCard";
import { CaseCard } from "./CaseCard";
import { CycleTimeline } from "./CycleTimeline";
import { FunnelChart } from "./FunnelChart";
import { LabelManifest } from "./LabelManifest";
import { MergeCard } from "./MergeCard";
import { MetricRow } from "./MetricRow";
import { OrderCard } from "./OrderCard";
import { ReportCard } from "./ReportCard";
import { RequestCard } from "./RequestCard";
import { Timeseries } from "./Timeseries";
import { VerdictCard } from "./VerdictCard";
import { WeatherStrip } from "./WeatherStrip";
import { PhaseBeacon } from "@/components/chat/PhaseBeacon";

export function SpecRenderer({ spec }: { spec: ComponentSpec }) {
  switch (spec.kind) {
    case "cycle_timeline":
      return <CycleTimeline phase={spec.phase} upcoming={spec.upcoming} />;
    case "attention_feed":
      return <AttentionFeed items={spec.items} />;
    case "metric_row":
      return <MetricRow metrics={spec.metrics} />;
    case "timeseries":
      return (
        <Timeseries
          title={spec.title}
          series={spec.series}
          annotations={spec.annotations}
        />
      );
    case "auction_board":
      return <><PhaseBeacon phase={spec.state === "live" ? "auction_live" : "winners"} /><AuctionBoard lots={spec.lots} closesAt={spec.closesAt} state={spec.state} /></>;
    case "funnel":
      return <FunnelChart title={spec.title} steps={spec.steps} />;
    case "report":
      return <><PhaseBeacon phase="report" /><ReportCard weekLabel={spec.weekLabel} sections={spec.sections} /></>;
    case "campaign_card":
      return <CampaignCard spec={spec} />;
    case "merge_card":
      return <><PhaseBeacon phase="addon_window" /><MergeCard spec={spec} /></>;
    case "label_manifest":
      return <><PhaseBeacon phase="label_day" /><LabelManifest spec={spec} /></>;
    case "order_card":
      return (
        <OrderCard order={spec.order} timeline={spec.timeline} actions={spec.actions} />
      );
    case "request_card":
      return (
        <RequestCard
          request={spec.request}
          autoActionsTaken={spec.autoActionsTaken}
          actions={spec.actions}
        />
      );
    case "case_card":
      return (
        <CaseCard
          caseId={spec.caseId}
          title={spec.title}
          evidence={spec.evidence}
          actions={spec.actions}
        />
      );
    case "verdict_card":
      return (
        <VerdictCard
          verdict={spec.verdict}
          confidence={spec.confidence}
          evidence={spec.evidence}
        />
      );
    case "weather_strip":
      return (
        <WeatherStrip
          destination={spec.destination}
          hours={spec.hours}
          policy={spec.policy}
        />
      );
    default: {
      const _exhaustive: never = spec;
      void _exhaustive;
      return null;
    }
  }
}

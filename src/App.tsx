import { Toolbar } from './ui/Toolbar';
import { Viewer } from './ui/Viewer/Viewer';
import { MeasurementsPanel } from './ui/Panels/MeasurementsPanel';
import { AutoDetectionPanel } from './ui/Panels/AutoDetectionPanel';
import { ClassificationPanel } from './ui/Panels/ClassificationPanel';
import { ManualClassificationPanel } from './ui/Panels/ManualClassificationPanel';
import { MaturityPanel } from './ui/Panels/MaturityPanel';
import { ClinicalContextPanel } from './ui/Panels/ClinicalContextPanel';
import { FollowUpPanel } from './ui/Panels/FollowUpPanel';
import { SelfMeasurementPanel } from './ui/Panels/SelfMeasurementPanel';
import { ResearchPanel } from './ui/Panels/ResearchPanel';
import { ReportPanel } from './ui/Panels/ReportPanel';

export function App(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer />
        </div>
        <aside style={{ width: 340, flexShrink: 0, borderLeft: '1px solid #26282e', background: '#111214', overflowY: 'auto' }}>
          <AutoDetectionPanel />
          <MeasurementsPanel />
          <SelfMeasurementPanel />
          <ClassificationPanel />
          <ManualClassificationPanel />
          <MaturityPanel />
          <ClinicalContextPanel />
          <FollowUpPanel />
          <ResearchPanel />
          <ReportPanel />
        </aside>
      </div>
    </div>
  );
}

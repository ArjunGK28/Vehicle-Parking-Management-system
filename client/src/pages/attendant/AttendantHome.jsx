import AppLayout from '../../components/AppLayout.jsx';
import FeatureList from '../../components/FeatureList.jsx';

const features = [
  { name: 'Slot availability', description: 'Live status of every slot (FR-03)', ready: true, to: '/slots' },
  { name: 'Vehicle entry', description: 'Record a vehicle entering the facility (FR-05)' },
  { name: 'Slot assignment', description: 'Assign a compatible free slot (FR-06)' },
  { name: 'Track vehicle', description: 'Find where a parked vehicle is (FR-07)', ready: true, to: '/track' },
  { name: 'Vehicle exit', description: 'Record exit and release the slot (FR-08)' },
  { name: 'Record payment', description: 'Take payment for a session (FR-10)' },
];

export default function AttendantHome() {
  return (
    <AppLayout>
      <FeatureList title="Attendant dashboard" features={features} />
    </AppLayout>
  );
}
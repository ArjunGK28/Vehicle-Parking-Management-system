import AppLayout from '../../components/AppLayout.jsx';
import FeatureList from '../../components/FeatureList.jsx';

const features = [
  { name: 'Slot availability', description: 'Live status of every slot (FR-03)', ready: true, to: '/slots' },
  { name: 'Vehicle entry', description: 'Record a vehicle entering the facility (FR-05)', ready: true, to: '/attendant/entry' },
  { name: 'Slot assignment', description: 'A compatible free slot is assigned on entry (FR-06)', ready: true, to: '/attendant/entry' },
  { name: 'Track vehicle', description: 'Find where a parked vehicle is (FR-07)', ready: true, to: '/track' },
  { name: 'Vehicle exit', description: 'Record exit, release the slot and show the fee (FR-08, FR-09)', ready: true, to: '/attendant/exit' },
  { name: 'Record payment', description: 'Take payment for a session (FR-10)' },
];

export default function AttendantHome() {
  return (
    <AppLayout>
      <FeatureList title="Attendant dashboard" features={features} />
    </AppLayout>
  );
}
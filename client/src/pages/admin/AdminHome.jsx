import AppLayout from '../../components/AppLayout.jsx';
import FeatureList from '../../components/FeatureList.jsx';

const features = [
  { name: 'Users and vehicles', description: 'Add and remove users, manage vehicles (FR-12)' },
  { name: 'Parking slots', description: 'Add or disable slots (FR-12)', ready: true, to: '/admin/slots' },
  { name: 'Parking rates', description: 'Set the hourly rates used for fees (FR-12)' },
  { name: 'Reports', description: 'Occupancy reports for a date range (FR-12)' },
  { name: 'Audit log', description: 'Who changed what, and when (NFR-16, NFR-17)' },
  { name: 'Track vehicle', description: 'Find where a parked vehicle is (FR-07)' },
];

export default function AdminHome() {
  return (
    <AppLayout>
      <FeatureList title="Administrator dashboard" features={features} />
    </AppLayout>
  );
}

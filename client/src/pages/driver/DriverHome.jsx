import AppLayout from '../../components/AppLayout.jsx';
import FeatureList from '../../components/FeatureList.jsx';

const features = [
  { name: 'My vehicles', description: 'Register and manage your vehicles (FR-02)' },
  { name: 'Slot availability', description: 'See which slots are free right now (FR-03)' },
  { name: 'Reserve a slot', description: 'Book a slot before you arrive (FR-04)' },
  { name: 'Payments', description: 'Pay for your parking sessions (FR-10)' },
  { name: 'Parking history', description: 'Review your past sessions (FR-11)' },
];

export default function DriverHome() {
  return (
    <AppLayout>
      <FeatureList title="Driver dashboard" features={features} />
    </AppLayout>
  );
}

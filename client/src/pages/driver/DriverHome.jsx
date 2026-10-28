import AppLayout from '../../components/AppLayout.jsx';
import FeatureList from '../../components/FeatureList.jsx';

const features = [
  { name: 'My vehicles', description: 'Register and manage your vehicles (FR-02)', ready: true, to: '/driver/vehicles' },
  { name: 'Slot availability', description: 'See which slots are free right now (FR-03)', ready: true, to: '/slots' },
  { name: 'Reserve a slot', description: 'Book a slot before you arrive (FR-04)', ready: true, to: '/driver/reserve' },
  { name: 'Payments', description: 'Pay for your parking sessions (FR-10)' },
  { name: 'Parking history', description: 'Review your past sessions (FR-11)', ready: true, to: '/history' },
];

export default function DriverHome() {
  return (
    <AppLayout>
      <FeatureList title="Driver dashboard" features={features} />
    </AppLayout>
  );
}
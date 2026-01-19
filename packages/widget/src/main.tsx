import React from 'react';
import ReactDOM from 'react-dom/client';
import { SnapStudio } from './components/SnapStudio';
import type { Asset } from './types';

// Assets de démo
const DEMO_ASSETS: Asset[] = [
  {
    id: 'c251d329-f585-4b08-9861-d87bb19cd67f',
    reference: 'P601384',
    name: 'Remilly',
    description: 'Poêle à bois contemporain noir avec design arrondi et large vitre panoramique',
    imageDetouree: 'assets/poeles-bois/invicta/P601384_detouree.png',
    imageDetoureeUrl: 'https://odspcxgafcqxjzrarsqf.supabase.co/storage/v1/object/public/snapstudio/assets/poeles-bois/invicta/P601384_detouree.png',
    powerKw: 7,
    efficiencyPct: 79,
    fuelType: 'bois',
    style: 'contemporain',
    brand: { id: 'a6ade309-0e55-467e-b2dc-fd66bcba9ab6', name: 'Invicta', slug: 'invicta' },
    catalog: { id: 'cd726bff-4c6c-496f-96a9-953cb774ce9b', name: 'Poêles à bois', slug: 'poeles-bois' },
  },
  {
    id: '64d71db8-de5d-41e8-86e6-8b4b1f47d0e6',
    reference: 'P601384-3',
    name: 'Alcor',
    description: 'Poêle à bois cylindrique noir avec lignes horizontales rainurées',
    imageDetouree: 'assets/poeles-bois/invicta/P601384_3_detouree.png',
    imageDetoureeUrl: 'https://odspcxgafcqxjzrarsqf.supabase.co/storage/v1/object/public/snapstudio/assets/poeles-bois/invicta/P601384_3_detouree.png',
    powerKw: 6,
    efficiencyPct: 78,
    fuelType: 'bois',
    style: 'moderne',
    brand: { id: 'a6ade309-0e55-467e-b2dc-fd66bcba9ab6', name: 'Invicta', slug: 'invicta' },
    catalog: { id: 'cd726bff-4c6c-496f-96a9-953cb774ce9b', name: 'Poêles à bois', slug: 'poeles-bois' },
  },
  {
    id: '8791ca77-aebe-4ed3-887b-d871ecfc1c97',
    reference: 'P601384-4',
    name: 'Ora',
    description: 'Poêle à bois conique design avec grande vitre',
    imageDetouree: 'assets/poeles-bois/invicta/P601384_4_detouree.png',
    imageDetoureeUrl: 'https://odspcxgafcqxjzrarsqf.supabase.co/storage/v1/object/public/snapstudio/assets/poeles-bois/invicta/P601384_4_detouree.png',
    powerKw: 8,
    efficiencyPct: 80,
    fuelType: 'bois',
    style: 'design',
    brand: { id: 'a6ade309-0e55-467e-b2dc-fd66bcba9ab6', name: 'Invicta', slug: 'invicta' },
    catalog: { id: 'cd726bff-4c6c-496f-96a9-953cb774ce9b', name: 'Poêles à bois', slug: 'poeles-bois' },
  },
];

function App() {
  return (
    <SnapStudio
      config={{
        supabaseUrl: 'https://odspcxgafcqxjzrarsqf.supabase.co',
        supabaseAnonKey: '',
        mockMode: true,
      }}
      leadToken="demo-token-12345"
      assets={DEMO_ASSETS}
      simulationsRemaining={3}
      onSimulationComplete={(result) => {
        console.log('✅ Simulation terminée:', result);
      }}
      onLimitReached={() => {
        console.log('⚠️ Limite de simulations atteinte');
      }}
      onError={(error) => {
        console.error('❌ Erreur:', error);
      }}
      onBookAppointment={() => {
        console.log('📅 Demande de RDV');
        alert('Redirection vers la prise de RDV...');
      }}
      branding={{
        primaryColor: '#E63946',
        secondaryColor: '#1D3557',
      }}
    />
  );
}

const container = document.getElementById('widget-container');
if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('Container #widget-container non trouvé');
}

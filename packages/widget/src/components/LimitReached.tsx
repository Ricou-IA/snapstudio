// ============================================
// LimitReached - Fin des simulations gratuites
// ============================================

import type { LimitReachedProps, Generation } from '../types';

export function LimitReached({
  generations,
  onBookAppointment,
}: LimitReachedProps) {
  return (
    <div className="snapstudio-limit-reached">
      <div className="snapstudio-limit-header">
        <div className="snapstudio-limit-icon">🎉</div>
        <h2>Bravo !</h2>
        <p>Vous avez réalisé vos <strong>3 simulations gratuites</strong></p>
      </div>

      {/* Galerie des simulations */}
      {generations.length > 0 && (
        <div className="snapstudio-limit-gallery">
          <h3>Vos créations :</h3>
          <div className="snapstudio-limit-gallery-grid">
            {generations.map((gen: Generation) => (
              <div key={gen.id} className="snapstudio-limit-gallery-item">
                <img 
                  src={gen.resultImageUrl || gen.resultImagePath} 
                  alt={`Simulation ${gen.asset.name}`}
                />
                <span>{gen.asset.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA Prise de RDV */}
      <div className="snapstudio-limit-cta">
        <div className="snapstudio-limit-cta-content">
          <h3>📅 Prenez rendez-vous avec un conseiller</h3>
          <p>En prenant RDV, vous bénéficiez de :</p>
          <ul>
            <li>✓ Simulations personnalisées <strong>illimitées</strong></li>
            <li>✓ Devis gratuit adapté à votre projet</li>
            <li>✓ Visite technique à domicile offerte</li>
            <li>✓ Accompagnement dans les aides financières</li>
          </ul>
        </div>

        <button
          onClick={onBookAppointment}
          className="snapstudio-btn-primary snapstudio-btn-rdv"
        >
          📅 Prendre rendez-vous gratuitement
        </button>
      </div>

      {/* Contact alternatif */}
      <div className="snapstudio-limit-contact">
        <p>
          Vous préférez nous appeler ?<br />
          <a href="tel:+33000000000" className="snapstudio-phone">
            📞 XX XX XX XX XX
          </a>
        </p>
      </div>
    </div>
  );
}

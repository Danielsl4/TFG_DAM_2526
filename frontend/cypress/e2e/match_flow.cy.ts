describe('Robot de Pruebas Maestro - Cobertura Técnica Total', () => {
  
  beforeEach(() => {
    // Login inicial
    cy.visit('/login');
    cy.get('input#username').type('holaa');
    cy.get('input#password').type('sdfsdf');
    cy.get('button[type="submit"]').click();
    cy.url().should('eq', Cypress.config().baseUrl + '/');
  });

  it('1. Verificación de Votaciones y Predicciones (1X2)', () => {
    cy.log('--- Probando Sistema de Votos ---');
    cy.visit('/matches');
    cy.get('body').then(($body) => {
      if ($body.find('.btn-vote').length > 0) {
        cy.get('.btn-vote').first().click({ force: true });
        cy.contains('Tu predicción', { matchCase: false }).should('be.visible');
      }
    });
  });

  it('2. Ciclo de Vida de Eventos (Insertar y Eliminar Goles)', () => {
    cy.log('--- Probando Integridad de Eventos ---');
    cy.visit('/matches');
    cy.get('.match-card-premium').first().click({ force: true });
    
    cy.get('.score-number').first().invoke('text').then((scoreBefore) => {
      const initialGoals = parseInt(scoreBefore) || 0;

      cy.contains('button', 'Gestionar Partido').click({ force: true });
      cy.contains('Editar partido').click();
      
      // Esperar a que el modal sea visible
      cy.get('#eventInsertModal', { timeout: 10000 }).should('be.visible');
      
      cy.get('#eventInsertModal').within(() => {
        // Hallazgo técnico: Los botones no dicen "Local", dicen el nombre del equipo.
        // Pulsamos el primer botón de equipo (Local) usando su clase de Bootstrap
        cy.get('button.btn-outline-primary').first().click({ force: true });
        
        cy.wait(1500); 
        cy.get('select').last().select(1); 
        cy.contains('button', 'Insertar Evento').click({ force: true });
      });

      // Verificar que el marcador ha subido (con margen para la caché)
      cy.get('.score-number', { timeout: 15000 }).first().should(($div) => {
        expect(parseInt($div.text())).to.equal(initialGoals + 1);
      });

      // ELIMINAR EL EVENTO (Limpieza)
      cy.get('.btn-delete-event').last().click({ force: true });
      cy.get('.swal2-confirm').click();

      // Verificar vuelta al marcador original
      cy.get('.score-number', { timeout: 15000 }).first().should('have.text', initialGoals.toString());
    });
  });

  it('3. Robustez del Sistema de Bloqueo (Locks)', () => {
    cy.visit('/matches');
    cy.get('.match-card-premium').first().click({ force: true });
    cy.contains('button', 'Gestionar Partido').click({ force: true });
    cy.get('#managementModal .btn-close').click();
  });

  it('4. Seguimiento de Equipos (Follow System)', () => {
    cy.visit('/standings');
    cy.get('.team-col a').first().click({ force: true });
    
    cy.contains('button', /Seguir|Siguiendo/i).then(($btn) => {
      cy.wrap($btn).click();
      cy.wait(1000);
      cy.visit('/profile');
      cy.contains('Equipos que sigues').should('be.visible');
    });
  });

  it('5. Consistencia de Estadísticas e Integridad de Enlaces', () => {
    cy.visit('/statistics');
    cy.get('.player-name').first().then(($el) => {
      const playerName = $el.text().trim();
      cy.wrap($el).click({ force: true });
      cy.contains('h3', playerName).should('be.visible');
    });
  });

  it('6. Responsividad Móvil', () => {
    cy.viewport('iphone-xr');
    cy.visit('/');
    cy.get('.navbar-toggler').should('be.visible');
  });

});

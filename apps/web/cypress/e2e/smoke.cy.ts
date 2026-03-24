describe('sign in', () => {
  it('renders', () => {
    cy.visit('/signin');
    cy.contains('Continue with GitHub').should('be.visible');
  });
});


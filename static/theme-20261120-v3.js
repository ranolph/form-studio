/* Keep the author link below all mobile controls, without changing desktop
 * alignment or coupling this appearance update to the editor's application JS. */
(() => {
  function installMobileFooter() {
    const workspace = document.querySelector('.studio-layout');
    const link = document.querySelector('.stage-github[href="https://github.com/ranolph"]')
      || document.querySelector('.app-footer a[href="https://github.com/ranolph"]');
    if (!workspace || !link || document.querySelector('[data-studio-mobile-footer]')) return;

    const originalPosition = document.createComment('Form Studio desktop author link');
    link.before(originalPosition);
    const footer = document.createElement('footer');
    footer.className = 'studio-mobile-footer';
    footer.dataset.studioMobileFooter = '';
    footer.setAttribute('aria-label', 'Project author');
    footer.hidden = true;
    workspace.after(footer);

    const mobile = window.matchMedia('(max-width: 860px)');
    function placeLink() {
      if (mobile.matches) {
        footer.append(link);
        footer.hidden = false;
      } else {
        originalPosition.after(link);
        footer.hidden = true;
      }
    }
    placeLink();
    mobile.addEventListener('change', placeLink);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMobileFooter, {once: true});
  } else {
    installMobileFooter();
  }
})();

(() => {
  const previousRenderRules = renderRules;
  renderRules = function(){
    previousRenderRules();
    document.querySelectorAll('#playbookList .system-rule-card').forEach(card=>{
      // v3 classification already selected the best supported work scenario.
      // Prevent the legacy first-regex-match compatibility layer from adding
      // a different generic context after rendering.
      card.dataset.contextEnhanced='1';
    });
  };
})();

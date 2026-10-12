/* Shared book HTML in a style-isolated, non-scrolling surface (not an iframe). */
window.HUB_BOOK_STUDY = (() => {
  let root;
  function deduplicateTakeaway(content) {
    const band = content.querySelector('#takeaway');
    const quote = band?.querySelector('blockquote');
    if (!quote || quote.id) return;
    const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const references = node => [...node.querySelectorAll('a[href]')].map(link => link.getAttribute('href')).join('\n');
    const explanation = band.querySelector(':scope > p');
    const matches = [...content.querySelectorAll('.research-section .claim')].filter(claim => {
      const statement = claim.querySelector(':scope > p');
      return statement && text(statement) === text(quote) && references(statement) === references(quote)
        && text(claim.querySelector('.claim-explanation')) === text(explanation)
        && claim.id === 'claim-' + claim.dataset.claimId
        && [...claim.children].every(node => node.tagName === 'P' || node.classList.contains('claim-meta'));
    });
    if (matches.length !== 1) return;
    const duplicate = matches[0];
    const metadata = duplicate.querySelector('.claim-meta');
    if (!metadata) return;
    // Move provenance and the citation backlink target with the exact duplicate.
    // All unique headings, explanations, identities and evidence stay visible.
    quote.id = duplicate.id;
    quote.dataset.claimId = duplicate.dataset.claimId;
    band.append(metadata);
    duplicate.remove();
  }
  function mount(host, study, discuss) {
    host.dataset.bookId = study.book_id;
    root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.replaceChildren();
    const stylesReady = [];
    for (const href of ["/book-assets/styles.css", "/assets/book-study.css"]) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = (window.HUB_SITE_BASE || "") + href;
      stylesReady.push(new Promise(resolve => {
        css.addEventListener("load", resolve, { once: true });
        css.addEventListener("error", resolve, { once: true });
      }));
      root.append(css);
    }
    // Only the same-origin, typed server renderer supplies this inert fragment.
    const parsed = new DOMParser().parseFromString(study.html, "text/html");
    const content = document.createElement("div");
    content.className = "book-study-content";
    content.append(...parsed.body.childNodes);
    deduplicateTakeaway(content);
    root.append(content);
    for (const section of study.sections) {
      const element = root.getElementById(section.id);
      if (!element || section.id === "sources" || section.id.startsWith("book-section-")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "book-discuss";
      button.textContent = "讨论本节";
      button.setAttribute("aria-label", `讨论：${section.title}`);
      button.addEventListener("click", () => discuss(section));
      element.append(button);
    }
    content.addEventListener("click", event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      if (jump(anchor.hash.slice(1))) event.preventDefault();
    });
    return Promise.all(stylesReady);
  }
  function jump(id) {
    const element = root?.getElementById(id);
    if (!element) return false;
    element.tabIndex = -1;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "start" });
    return true;
  }
  return Object.freeze({ mount, jump });
})();
